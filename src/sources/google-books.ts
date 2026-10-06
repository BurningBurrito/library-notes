import { RequestUrlResponse } from 'obsidian';
import { BookError } from '../core/errors';
import { badResponse, httpRequest, parseJson } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, asStringArray, uniqueStrings } from '../core/utils';
import type LibraryNotesPlugin from '../main';
import { categoriesFromSubjects } from './genres';
import { asIsbn, normalizeDate } from './open-library';
import type { Book, BookSource, SearchResult } from './types';

// Google Books: needs the user's own free API key (Google no longer answers
// requests without one). https://developers.google.com/books/docs/v1/using
const NAME = 'Google Books';
const BASE = 'https://www.googleapis.com/books/v1/volumes';
const THROTTLE: ThrottleRule = { key: 'googlebooks', intervalMs: 250 };
const SEARCH_LIMIT = 20;

export const googleBooks: BookSource = {
	id: 'google-books',
	name: NAME,
	throttle: THROTTLE,

	isConfigured: (plugin) => apiKey(plugin) !== '',

	async search(query, plugin) {
		const isbn = asIsbn(query);
		const params = new URLSearchParams({
			q: isbn ? `isbn:${isbn}` : query,
			maxResults: String(SEARCH_LIMIT),
			printType: 'books',
		});
		if (plugin.settings.language) params.set('langRestrict', plugin.settings.language);
		const data = await googleGet(`${BASE}?${params.toString()}`, plugin);
		const items = asRecord(data).items;
		if (!Array.isArray(items)) return [];
		return items.map(asRecord).filter((item) => asString(item.id) && asString(asRecord(item.volumeInfo).title)).map(toResult);
	},

	async details(result, plugin) {
		// The single-volume answer has the full description and larger cover sizes.
		const data = asRecord(await googleGet(`${BASE}/${encodeURIComponent(result.ref.id ?? '')}`, plugin));
		const fresh = toResult(data).book;
		const info = asRecord(data.volumeInfo);
		return {
			...result.book,
			...fresh,
			description: htmlToText(asString(info.description)) || result.book.description,
			categories: fresh.categories.length ? fresh.categories : result.book.categories,
			coverUrl: fresh.coverUrl || result.book.coverUrl,
		};
	},

	coverDownloadUrl: (book) => book.coverUrl,

	async check(plugin) {
		const data = await googleGet(`${BASE}?q=isbn:9780593135204&maxResults=1`, plugin);
		if (!('totalItems' in asRecord(data))) throw badResponse(NAME);
		return 'Google Books is working: your API key is valid.';
	},
};

/** The key from Obsidian's keychain, or "" when none is set. */
function apiKey(plugin: LibraryNotesPlugin): string {
	return plugin.getSecret(plugin.settings.googleBooksKeySecret);
}

async function googleGet(url: string, plugin: LibraryNotesPlugin): Promise<unknown> {
	const key = apiKey(plugin);
	if (!key) {
		throw new BookError('config', 'Google Books needs an API key. Add one in the Library Notes settings.');
	}
	// The key goes in a header, so it never appears in URLs (or in logs that show them).
	const response = await httpRequest(url, {
		sourceName: NAME,
		headers: { 'X-goog-api-key': key },
		throttle: THROTTLE,
		handleRateLimit: true,
	});
	if (response.status === 200) return parseJson(response, NAME);
	throw googleError(response);
}

/** Turn Google's error answers into messages the user can act on. */
export function googleError(response: RequestUrlResponse): BookError {
	let message = '';
	let reasons: string[] = [];
	try {
		const error = asRecord(asRecord(JSON.parse(response.text)).error);
		message = asString(error.message);
		reasons = [
			...asStringArray(Array.isArray(error.details) ? error.details.map((d) => asRecord(d).reason) : []),
			...asStringArray(Array.isArray(error.errors) ? error.errors.map((e) => asRecord(e).reason) : []),
		];
	} catch {
		// Not JSON: fall through to the generic messages below.
	}
	const has = (...names: string[]) => names.some((name) => reasons.includes(name));

	if (response.status === 429) {
		return /per day/i.test(message)
			? new BookError('rate-limited', "Your Google Books API key has used up today's quota. Try again tomorrow, or search another source.")
			: new BookError('rate-limited', 'Google Books has received too many requests. Try again in a few minutes.');
	}
	if (has('API_KEY_INVALID', 'keyInvalid')) {
		return new BookError('auth', 'Google Books rejected the API key. Check the key in the Library Notes settings.');
	}
	if (has('SERVICE_DISABLED', 'accessNotConfigured')) {
		return new BookError(
			'config',
			'The Books API isn’t turned on for your key’s Google Cloud project. Enable "Books API" in the Google Cloud console, then try again.',
		);
	}
	if (has('API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED')) {
		return new BookError(
			'config',
			'Your API key isn’t allowed to use the Books API. In the Google Cloud console, add "Books API" to the key’s API restrictions.',
		);
	}
	if (response.status === 404) return new BookError('not-found', 'Google Books has no entry for this book.');
	if (response.status === 400 || response.status === 401 || response.status === 403) {
		return new BookError('auth', `Google Books refused the request${message ? `: ${message}` : ''}`);
	}
	return badResponse(NAME);
}

function toResult(item: Record<string, unknown>): SearchResult {
	const id = asString(item.id);
	const info = asRecord(item.volumeInfo);
	const images = asRecord(info.imageLinks);
	const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers.map(asRecord) : [];
	const isbn = (type: string) => asString(identifiers.find((i) => asString(i.type) === type)?.identifier);
	// Largest available; search answers usually have only the thumbnails.
	const cover = ['extraLarge', 'large', 'medium', 'small', 'thumbnail', 'smallThumbnail']
		.map((size) => asString(images[size]))
		.find(Boolean);
	const pages = typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : null;

	const book: Book = {
		title: asString(info.title),
		subtitle: asString(info.subtitle),
		authors: uniqueStrings(asStringArray(info.authors)),
		// "Fiction / Science Fiction / Hard Science Fiction" → the same genre names as other sources.
		categories: categoriesFromSubjects(asStringArray(info.categories).flatMap((c) => c.split(/\s+\/\s+/))),
		publisher: asString(info.publisher),
		publishDate: normalizeDate(asString(info.publishedDate)),
		pageCount: pages,
		isbn10: isbn('ISBN_10'),
		isbn13: isbn('ISBN_13'),
		description: htmlToText(asString(info.description)),
		language: asString(info.language),
		coverUrl: cover ? cleanImageUrl(cover) : '',
		source: {
			id: 'google-books',
			name: NAME,
			url: asString(info.canonicalVolumeLink) || asString(info.infoLink) || `https://books.google.com/books?id=${id}`,
			key: id,
		},
	};
	const thumbnail = asString(images.thumbnail) || asString(images.smallThumbnail);
	return { book, thumbnailUrl: thumbnail ? cleanImageUrl(thumbnail) : '', ref: { id } };
}

/** Google's image links use http and add a "page curl" effect; use https and a flat cover. */
export function cleanImageUrl(url: string): string {
	return url.replace(/^http:\/\//, 'https://').replace(/&edge=curl/g, '');
}

/** Single-volume descriptions are HTML (<p>, <br>, <b>); keep the text and paragraph breaks. */
export function htmlToText(html: string): string {
	if (!/[<&]/.test(html)) return html.trim();
	const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
	const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? '';
	return text.replace(/\n{3,}/g, '\n\n').trim();
}
