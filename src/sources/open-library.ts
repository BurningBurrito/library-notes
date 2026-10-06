import { getJson } from '../core/http';
import type { ThrottleRule } from '../core/throttle';
import { asRecord, asString, asStringArray, uniqueStrings } from '../core/utils';
import { categoriesFromSubjects } from './genres';
import type { Book, BookSource, SearchResult } from './types';

// Open Library: free, no account. https://openlibrary.org/developers/api
const NAME = 'Open Library';
const BASE = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org/b/id';
// Open Library allows 1 request per second from apps that don't send a contact
// email in their User-Agent (3 with one). See README "Network use".
const THROTTLE: ThrottleRule = { key: 'openlibrary', intervalMs: 1000 };
const SEARCH_LIMIT = 20;

// Work fields, plus the edition that best matches the search (and the language setting).
const SEARCH_FIELDS = [
	'key',
	'title',
	'subtitle',
	'author_name',
	'cover_i',
	'cover_edition_key',
	'first_publish_year',
	'number_of_pages_median',
	'subject',
	'editions',
	'editions.key',
	'editions.title',
	'editions.subtitle',
	'editions.cover_i',
	'editions.publisher',
	'editions.publish_date',
	'editions.isbn',
	'editions.language',
].join(',');

export const openLibrary: BookSource = {
	id: 'open-library',
	name: NAME,
	throttle: THROTTLE,

	isConfigured: () => true,

	async search(query, plugin) {
		const isbn = asIsbn(query);
		const params = new URLSearchParams({ fields: SEARCH_FIELDS, limit: String(SEARCH_LIMIT) });
		if (isbn) params.set('isbn', isbn);
		else params.set('q', query);
		if (plugin.settings.language) params.set('lang', plugin.settings.language);
		const data = await getJson(`${BASE}/search.json?${params.toString()}`, {
			sourceName: NAME,
			throttle: THROTTLE,
			cache: true,
		});
		return parseSearch(data, isbn);
	},

	async details(result) {
		const book = { ...result.book };
		const work = asRecord(
			await getJson(`${BASE}${result.ref.work ?? ''}.json`, { sourceName: NAME, throttle: THROTTLE, cache: true }),
		);
		book.description = cleanDescription(work.description);
		const subjects = asStringArray(work.subjects);
		if (subjects.length) book.categories = categoriesFromSubjects(subjects);

		if (result.ref.edition) {
			const edition = asRecord(
				await getJson(`${BASE}${result.ref.edition}.json`, { sourceName: NAME, throttle: THROTTLE, cache: true }),
			);
			applyEdition(book, edition);
		}
		return book;
	},

	coverDownloadUrl(book) {
		// ?default=false: a missing cover is a 404, not a blank placeholder image.
		return book.coverUrl ? `${book.coverUrl}?default=false` : '';
	},

	async check() {
		const data = await getJson(`${BASE}/search.json?q=the+hobbit&limit=1&fields=key`, {
			sourceName: NAME,
			throttle: THROTTLE,
		});
		if (!Array.isArray(asRecord(data).docs)) throw new Error('unexpected response');
		return 'Open Library is working.';
	},
};

/** "978-0-593-13520-4" → "9780593135204"; null when the text isn't an ISBN. */
export function asIsbn(text: string): string | null {
	const compact = text.replace(/[\s-]/g, '').toUpperCase();
	return /^(\d{9}[\dX]|\d{13})$/.test(compact) ? compact : null;
}

export function parseSearch(data: unknown, isbnSearched: string | null): SearchResult[] {
	const docs = asRecord(data).docs;
	if (!Array.isArray(docs)) return [];
	return docs.map(asRecord).filter((doc) => asString(doc.key) && asString(doc.title)).map((doc) => {
		const matched = asRecord(asArray(asRecord(doc.editions).docs)[0]);
		const coverEditionKey = asString(doc.cover_edition_key);
		// Which edition the note describes:
		// - ISBN search: the edition with that ISBN.
		// - Otherwise: the edition the work's main cover comes from, so the cover, page
		//   count, and ISBN in the note all belong to the same book. (The best-matching
		//   edition can be, say, a large-print edition with a different page count.)
		const useMatched = isbnSearched !== null || !coverEditionKey || asString(matched.key) === `/books/${coverEditionKey}`;
		const edition = useMatched ? matched : {};
		const editionKey = useMatched ? asString(matched.key) : `/books/${coverEditionKey}`;

		const workCover = coverId(doc.cover_i);
		const cover = isbnSearched ? (coverId(matched.cover_i) ?? workCover) : (workCover ?? coverId(matched.cover_i));
		const isbns = asStringArray(edition.isbn);
		const workKey = asString(doc.key);

		const book: Book = {
			title: asString(doc.title),
			subtitle: asString(doc.subtitle) || asString(edition.subtitle),
			authors: uniqueStrings(asStringArray(doc.author_name)),
			categories: categoriesFromSubjects(asStringArray(doc.subject)),
			// Edition details come from details(); until then, only what belongs to this edition or the work.
			publisher: asStringArray(edition.publisher)[0] ?? '',
			publishDate: normalizeDate(asStringArray(edition.publish_date)[0] ?? '') || asString(doc.first_publish_year),
			pageCount: positiveNumber(doc.number_of_pages_median),
			isbn10: pickIsbn(isbns, 10, isbnSearched),
			isbn13: pickIsbn(isbns, 13, isbnSearched),
			description: '',
			language: asStringArray(edition.language)[0] ?? '',
			coverUrl: cover ? `${COVERS}/${cover}-L.jpg` : '',
			source: {
				id: 'open-library',
				name: NAME,
				url: `${BASE}${workKey}`,
				key: workKey.split('/').pop() ?? workKey,
			},
		};
		return {
			book,
			thumbnailUrl: cover ? `${COVERS}/${cover}-M.jpg` : '',
			ref: { work: workKey, ...(editionKey ? { edition: editionKey } : {}) },
		};
	});
}

/** Fill in the chosen edition's own details: exact page count, full date, publisher, ISBNs. */
function applyEdition(book: Book, edition: Record<string, unknown>): void {
	const pages = positiveNumber(edition.number_of_pages);
	if (pages) book.pageCount = pages;
	const date = normalizeDate(asString(edition.publish_date));
	if (date) book.publishDate = date;
	const publisher = asStringArray(edition.publishers)[0];
	if (publisher) book.publisher = publisher;
	book.isbn13 = asStringArray(edition.isbn_13)[0] ?? book.isbn13;
	book.isbn10 = asStringArray(edition.isbn_10)[0] ?? book.isbn10;
	const language = asString(asRecord(asArray(edition.languages)[0]).key).split('/').pop();
	if (language) book.language = language;
}

function pickIsbn(isbns: string[], length: 10 | 13, searched: string | null): string {
	if (searched?.length === length && isbns.includes(searched)) return searched;
	return isbns.find((isbn) => isbn.length === length) ?? '';
}

/** Open Library uses -1 for removed covers. */
function coverId(value: unknown): number | null {
	return typeof value === 'number' && value > 0 ? value : null;
}

function positiveNumber(value: unknown): number | null {
	return typeof value === 'number' && value > 0 ? Math.round(value) : null;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Open Library dates are free text: "May 04, 2021", "1 May 2021", "2021-05-04",
 * "2021", "18 de enero de 2024". Returns "YYYY-MM-DD", "YYYY-MM", or "YYYY".
 */
export function normalizeDate(text: string): string {
	const value = text.trim();
	if (/^\d{4}(-\d{2}){0,2}$/.test(value)) return value;
	const year = /\b(\d{4})\b/.exec(value)?.[1];
	if (!year) return '';
	const monthIndex = MONTHS.findIndex((m) => new RegExp(`\\b${m}[a-z]*\\.?\\b`, 'i').test(value));
	if (monthIndex < 0) return year;
	const month = String(monthIndex + 1).padStart(2, '0');
	const day = /\b(\d{1,2})\b/.exec(value.replace(year, ''))?.[1];
	return day ? `${year}-${month}-${day.padStart(2, '0')}` : `${year}-${month}`;
}

/** Descriptions are text or {type, value}, often with source links and "Also contained in" lists. */
export function cleanDescription(value: unknown): string {
	const text = typeof value === 'string' ? value : asString(asRecord(value).value);
	return text
		.split(/\n-{3,}\s*\n/)[0]! // "----------" starts Open Library's "Also contained in" footer
		.replace(/^\s*\[\d+\]:\s*\S+\s*$/gm, '') // reference-style link definitions
		.replace(/\(\[source\]\[\d+\]\)/gi, '')
		.replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
		.trim();
}
