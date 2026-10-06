import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { clearCache, setUserAgent } from '../src/core/http';
import { asIsbn, cleanDescription, normalizeDate, openLibrary } from '../src/sources/open-library';
import { categoriesFromSubjects } from '../src/sources/genres';
import { fake, json, requests, resetNetwork } from './support/network';
import { makeApp, makePlugin } from './support/vault';

const plugin = makePlugin(makeApp());

describe('Open Library (recorded answers)', () => {
	before(() => setUserAgent('LibraryNotes/test (+https://github.com/BurningBurrito/obsidian-library-notes)'));
	beforeEach(() => {
		clearCache();
		resetNetwork();
	});

	it('finds books, identifies the plugin, and prefers the language setting', async () => {
		const results = await openLibrary.search('project hail mary', plugin);
		assert.ok(results.length > 1);
		const first = results[0]!;
		assert.equal(first.book.title, 'Project Hail Mary');
		assert.deepEqual(first.book.authors, ['Andy Weir']);
		assert.equal(first.ref.work, '/works/OL21745884W');
		assert.match(first.thumbnailUrl, /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-M\.jpg$/);
		const request = requests[0]!;
		assert.match(request.headers['User-Agent'] ?? '', /^LibraryNotes\//);
		const params = new URL(request.url).searchParams;
		assert.equal(params.get('lang'), 'en');
		assert.match(params.get('fields') ?? '', /cover_edition_key/);
	});

	it('describes the edition the shown cover belongs to, not a "best match" large-print edition', async () => {
		const [first] = await openLibrary.search('project hail mary', plugin);
		const book = await openLibrary.details(first!, plugin);
		assert.equal(book.pageCount, 496);
		assert.equal(book.isbn13, '9781529100624');
		assert.notEqual(book.publisher, 'Random House Large Print');
		assert.ok(book.categories.includes('Science fiction'), book.categories.join());
		assert.ok(book.description.length > 100);
		assert.doesNotMatch(book.description, /\[source\]|----------/);
		assert.equal(book.coverUrl, first!.book.coverUrl, 'the cover the list showed');
		assert.equal(openLibrary.coverDownloadUrl(book), `${book.coverUrl}?default=false`);
	});

	it('searches an ISBN as that exact edition, with that edition’s cover', async () => {
		const results = await openLibrary.search('978-0-593-39556-1', plugin);
		assert.equal(results.length, 1);
		assert.equal(results[0]!.book.isbn13, '9780593395561');
		assert.equal(new URL(requests[0]!.url).searchParams.get('isbn'), '9780593395561');
		const book = await openLibrary.details(results[0]!, plugin);
		assert.equal(book.isbn13, '9780593395561');
		assert.equal(book.publisher, 'Random House Large Print');
	});

	it('picks genres the subjects mention most', async () => {
		const [hobbit] = await openLibrary.search('the hobbit', plugin);
		const book = await openLibrary.details(hobbit!, plugin);
		assert.equal(book.categories[0], 'Fantasy');
		assert.ok(!book.categories.includes('Horror'), book.categories.join());
	});

	it('returns no results for nonsense, and reports server trouble', async () => {
		assert.deepEqual(await openLibrary.search('qwxzzvbnmqqq', plugin), []);
		fake('openlibrary.org/search.json', json(503, {}));
		await assert.rejects(openLibrary.search('anything new', plugin), /Open Library is having problems \(error 503\)/);
	});
});

describe('Open Library text clean-up', () => {
	it('reads free-text dates', () => {
		assert.deepEqual(
			['May 04, 2021', '1 May 2021', '2021-05-04', '2021', 'Sept. 2003', '18 de enero de 2024', 'unknown', ''].map(normalizeDate),
			['2021-05-04', '2021-05-01', '2021-05-04', '2021', '2003-09', '2024', '', ''],
		);
	});

	it('recognizes ISBNs typed with dashes or spaces', () => {
		assert.equal(asIsbn('978-0-593-13520-4'), '9780593135204');
		assert.equal(asIsbn('0 345 44560 x'), '034544560X');
		assert.equal(asIsbn('the hobbit'), null);
		assert.equal(asIsbn('12345'), null);
	});

	it('removes source links and the "Also contained in" list from descriptions', () => {
		const description = { type: '/type/text', value: 'A story ([source][1])\n\n----------\n**Also contained in:**\n\n[1]: https://example.org' };
		assert.equal(cleanDescription(description), 'A story');
		assert.equal(cleanDescription('Plain text.'), 'Plain text.');
		assert.equal(cleanDescription(undefined), '');
	});

	it('turns subjects into a few clean genres', () => {
		assert.deepEqual(categoriesFromSubjects(['hard science-fiction', 'science-fiction', 'sci-fi', 'nyt:hardcover-fiction=2021-05-23', 'Fiction']), ['Science fiction']);
		assert.deepEqual(categoriesFromSubjects(['Accessible book', 'Zettelkasten', 'Note-taking']), ['Zettelkasten', 'Note-taking']);
		assert.deepEqual(categoriesFromSubjects([]), []);
	});
});
