import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearCache } from '../src/core/http';
import { configuredSources, searchBooks } from '../src/sources';
import { googleBooks } from '../src/sources/google-books';
import { fake, json, requests, resetNetwork, setOnline } from './support/network';
import { makeApp, makePlugin } from './support/vault';

// Google's real answers (recorded 2026-10-05).
const INVALID_KEY = {
	error: {
		code: 400,
		message: 'API key not valid. Please pass a valid API key.',
		errors: [{ message: 'API key not valid. Please pass a valid API key.', domain: 'global', reason: 'badRequest' }],
		status: 'INVALID_ARGUMENT',
		details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
	},
};
const DAILY_QUOTA = {
	error: {
		code: 429,
		message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'books.googleapis.com' for consumer 'project_number:624717413613'.",
		status: 'RESOURCE_EXHAUSTED',
	},
};

// The documented volume format (values as in a Google-made book note).
const VOLUME = {
	id: 'WTpwEAAAQBAJ',
	volumeInfo: {
		title: 'Building a Second Brain',
		subtitle: 'A Proven Method to Organize Your Digital Life and Unlock Your Creative Potential',
		authors: ['Tiago Forte'],
		publisher: 'Simon and Schuster',
		publishedDate: '2022-06-14',
		description: 'A plain description.',
		industryIdentifiers: [
			{ type: 'ISBN_13', identifier: '9781982167387' },
			{ type: 'ISBN_10', identifier: '1982167386' },
		],
		pageCount: 272,
		categories: ['Business & Economics'],
		imageLinks: {
			smallThumbnail: 'http://books.google.com/books/content?id=WTpwEAAAQBAJ&printsec=frontcover&img=1&zoom=5&edge=curl&source=gbs_api',
			thumbnail: 'http://books.google.com/books/content?id=WTpwEAAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
		},
		language: 'en',
		canonicalVolumeLink: 'https://books.google.com/books/about/Building_a_Second_Brain.html?hl=&id=WTpwEAAAQBAJ',
	},
};
const VOLUME_DETAILS = {
	...VOLUME,
	volumeInfo: {
		...VOLUME.volumeInfo,
		description: '<p><b>A revolutionary approach</b> to <i>productivity</i>.</p><p>Second paragraph<br>with a break.</p>',
		categories: ['Business & Economics / Personal Success', 'Self-Help / Personal Growth / General'],
		imageLinks: { ...VOLUME.volumeInfo.imageLinks, medium: 'http://books.google.com/books/publisher/content?id=WTpwEAAAQBAJ&printsec=frontcover&img=1&zoom=3&edge=curl&source=gbs_api' },
	},
};

const withKey = () => {
	const app = makeApp();
	app.secretStorage.setSecret('gb', 'TEST-KEY');
	return makePlugin(app, { googleBooksKeySecret: 'gb' });
};
const olEmpty = () => fake('openlibrary.org/search.json', json(200, { numFound: 0, docs: [] }));
const olResult = () =>
	fake('openlibrary.org/search.json', json(200, { numFound: 1, docs: [{ key: '/works/OL1W', title: 'From Open Library', author_name: ['Someone'] }] }));

describe('Google Books', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('is a source only when an API key is set', () => {
		assert.deepEqual(configuredSources(makePlugin(makeApp())).map((s) => s.id), ['open-library']);
		assert.deepEqual(configuredSources(withKey()).map((s) => s.id), ['open-library', 'google-books']);
	});

	it('sends the key in a header, never in the URL', async () => {
		fake('googleapis.com/books/v1/volumes?', json(200, { totalItems: 1, items: [VOLUME] }));
		await googleBooks.search('978-1-982-16738-7', withKey());
		const request = requests[0]!;
		assert.equal(request.headers['X-goog-api-key'], 'TEST-KEY');
		assert.doesNotMatch(request.url, /TEST-KEY|key=/);
		const params = new URL(request.url).searchParams;
		assert.equal(params.get('q'), 'isbn:9781982167387');
		assert.equal(params.get('langRestrict'), 'en');
		assert.equal(params.get('printType'), 'books');
	});

	it('turns a volume into a book, with a flat https cover and the shared genre names', async () => {
		fake('googleapis.com/books/v1/volumes?', json(200, { totalItems: 1, items: [VOLUME] }));
		const [result] = await googleBooks.search('building a second brain', withKey());
		assert.deepEqual(result?.book, {
			title: 'Building a Second Brain',
			subtitle: 'A Proven Method to Organize Your Digital Life and Unlock Your Creative Potential',
			authors: ['Tiago Forte'],
			categories: ['Business', 'Economics'],
			publisher: 'Simon and Schuster',
			publishDate: '2022-06-14',
			pageCount: 272,
			isbn10: '1982167386',
			isbn13: '9781982167387',
			description: 'A plain description.',
			language: 'en',
			coverUrl: 'https://books.google.com/books/content?id=WTpwEAAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
			source: {
				id: 'google-books',
				name: 'Google Books',
				url: 'https://books.google.com/books/about/Building_a_Second_Brain.html?hl=&id=WTpwEAAAQBAJ',
				key: 'WTpwEAAAQBAJ',
			},
		});
		assert.equal(result?.thumbnailUrl, result?.book.coverUrl);
	});

	it('takes the full description (HTML to text) and the larger cover from the volume itself', async () => {
		fake('googleapis.com/books/v1/volumes?', json(200, { totalItems: 1, items: [VOLUME] }));
		fake('googleapis.com/books/v1/volumes/WTpwEAAAQBAJ', json(200, VOLUME_DETAILS));
		const plugin = withKey();
		const [result] = await googleBooks.search('building a second brain', plugin);
		const book = await googleBooks.details(result!, plugin);
		assert.equal(book.description, 'A revolutionary approach to productivity.\n\nSecond paragraph\nwith a break.');
		assert.match(book.coverUrl, /zoom=3/);
		assert.doesNotMatch(book.coverUrl, /edge=curl|^http:/);
		// "Business & Economics / Personal Success", "Self-Help / Personal Growth / General"
		assert.deepEqual(book.categories, ['Business', 'Economics', 'Self-help']);
	});

	it('explains Google’s errors', async () => {
		const plugin = withKey();
		fake('googleapis.com', json(400, INVALID_KEY));
		await assert.rejects(googleBooks.search('x', plugin), /Google Books rejected the API key/);
		fake('googleapis.com', json(429, DAILY_QUOTA));
		await assert.rejects(googleBooks.search('x', plugin), /used up today's quota/);
		fake('googleapis.com', json(403, { error: { code: 403, message: 'Books API has not been used in project 1', details: [{ reason: 'SERVICE_DISABLED' }] } }));
		await assert.rejects(googleBooks.search('x', plugin), /Enable "Books API"/);
		fake('googleapis.com', json(403, { error: { code: 403, message: 'Requests to this API are blocked.', details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] } }));
		await assert.rejects(googleBooks.search('x', plugin), /add "Books API" to the key’s API restrictions/);
		await assert.rejects(googleBooks.search('x', makePlugin(makeApp(), { googleBooksKeySecret: 'missing' })), /needs an API key/);
	});
});

describe('fallback between sources', () => {
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('uses the next source when the default one fails, and says why', async () => {
		fake('googleapis.com', json(400, INVALID_KEY));
		olResult();
		const outcome = await searchBooks('dune', withKey(), 'google-books');
		assert.equal(outcome.source.id, 'open-library');
		assert.equal(outcome.fallback?.from, 'Google Books');
		assert.match(outcome.fallback?.reason ?? '', /rejected the API key/);
	});

	it('uses the next source when the default one finds nothing', async () => {
		olEmpty();
		fake('googleapis.com', json(200, { totalItems: 1, items: [VOLUME] }));
		const outcome = await searchBooks('second brain', withKey(), 'open-library');
		assert.equal(outcome.source.id, 'google-books');
		assert.equal(outcome.fallback?.reason, 'Open Library found nothing.');
	});

	it('shows the default source’s own error when fallback is off', async () => {
		fake('googleapis.com', json(400, INVALID_KEY));
		olResult();
		const plugin = withKey();
		plugin.settings.useFallback = false;
		await assert.rejects(searchBooks('dune', plugin, 'google-books'), /rejected the API key/);
		assert.ok(!requests.some((r) => r.url.includes('openlibrary')), 'Open Library not asked');
	});

	it('never falls back when offline', async () => {
		setOnline(false);
		await assert.rejects(searchBooks('never searched before', withKey(), 'open-library'), /You appear to be offline/);
		assert.equal(requests.length, 0);
	});

	it('answers a search made in the last 30 minutes from memory, even offline', async () => {
		olResult();
		await searchBooks('cached search', makePlugin(makeApp()), 'open-library');
		setOnline(false);
		const outcome = await searchBooks('cached search', makePlugin(makeApp()), 'open-library');
		assert.equal(outcome.results[0]?.book.title, 'From Open Library');
		assert.equal(requests.length, 1, 'only the first search went to the network');
	});

	it('names every source searched when nothing is found anywhere', async () => {
		olEmpty();
		fake('googleapis.com', json(200, { totalItems: 0 }));
		await assert.rejects(searchBooks('qwxz', withKey(), 'open-library'), /No books found for "qwxz" \(searched Open Library, Google Books\)/);
	});

	it('starts with Open Library when the chosen source isn’t set up', async () => {
		olResult();
		const outcome = await searchBooks('dune', makePlugin(makeApp()), 'google-books');
		assert.equal(outcome.source.id, 'open-library');
		assert.equal(outcome.fallback, undefined);
	});
});
