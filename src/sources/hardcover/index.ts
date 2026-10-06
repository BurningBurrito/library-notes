import { asRecord, asString, asStringArray, uniqueStrings } from '../../core/utils';
import type LibraryNotesPlugin from '../../main';
import { categoriesFromSubjects } from '../genres';
import { normalizeDate } from '../open-library';
import type { Book, BookSource, SearchResult } from '../types';
import { isSignedIn, isSignInAvailable } from './auth';
import { changed, graphql, HARDCOVER_THROTTLE } from './client';

// Hardcover (hardcover.app): optional, needs the user's free account.
// Everything Hardcover-specific lives in this folder; its API is in beta.
const NAME = 'Hardcover';
const SEARCH_LIMIT = 20;

// Step 1: which books match, in order. `results` (the search engine's own
// answer) is read only for genres, and ignored if its shape changes.
const SEARCH_QUERY = `query LibraryNotesSearch($query: String!) {
  search(query: $query, query_type: "Book", per_page: ${SEARCH_LIMIT}, page: 1) {
    ids
    results
  }
}`;

// Step 2: those books' details, from documented fields.
const BOOKS_QUERY = `query LibraryNotesBooks($ids: [Int!]) {
  books(where: {id: {_in: $ids}}) {
    id
    title
    subtitle
    description
    pages
    release_date
    release_year
    slug
    literary_type_id
    image { url }
    contributions { contribution author { name } }
    default_physical_edition {
      isbn_10
      isbn_13
      pages
      release_date
      publisher { name }
    }
  }
}`;

export const hardcover: BookSource = {
	id: 'hardcover',
	name: NAME,
	throttle: HARDCOVER_THROTTLE,

	isConfigured: (plugin) => isSignInAvailable() && isSignedIn(plugin),

	async search(query, plugin) {
		const search = asRecord((await graphql(plugin, SEARCH_QUERY, { query })).search);
		if (!Array.isArray(search.ids)) throw changed();
		const ids = search.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
		if (ids.length === 0) return [];

		const books = (await graphql(plugin, BOOKS_QUERY, { ids })).books;
		if (!Array.isArray(books)) throw changed();
		const byId = new Map(books.map(asRecord).map((book) => [Number(book.id), book]));
		const genres = genresById(search.results);
		// Keep the search engine's order (best match first).
		return ids.flatMap((id) => {
			const book = byId.get(id);
			return book && asString(book.title) ? [toResult(book, genres.get(id) ?? [])] : [];
		});
	},

	// The search already fetched everything Hardcover has for the note.
	details: (result) => Promise.resolve(result.book),

	coverDownloadUrl: (book) => book.coverUrl,

	async check(plugin: LibraryNotesPlugin) {
		const search = asRecord((await graphql(plugin, SEARCH_QUERY, { query: 'dune' })).search);
		if (!Array.isArray(search.ids)) throw changed();
		return 'Hardcover is working: you’re signed in and search works.';
	},
};

export function toResult(book: Record<string, unknown>, genres: string[]): SearchResult {
	const edition = asRecord(book.default_physical_edition);
	const contributions = Array.isArray(book.contributions) ? book.contributions.map(asRecord) : [];
	// Authors only (not illustrators, translators, …); fall back to everyone credited.
	const isAuthor = (c: Record<string, unknown>) => !asString(c.contribution) || /author/i.test(asString(c.contribution));
	const names = (list: Record<string, unknown>[]) => list.map((c) => asString(asRecord(c.author).name));
	const authors = uniqueStrings(names(contributions.filter(isAuthor)));
	const cover = asString(asRecord(book.image).url);
	const slug = asString(book.slug);
	const id = asString(book.id);
	// Like Open Library: date, pages, ISBN, and publisher all from the same edition when there is one.
	const pages = [edition.pages, book.pages].find((p): p is number => typeof p === 'number' && p > 0) ?? null;
	const literaryType = book.literary_type_id === 1 ? ['Fiction'] : book.literary_type_id === 2 ? ['Nonfiction'] : [];

	const result: Book = {
		title: asString(book.title),
		subtitle: asString(book.subtitle),
		authors: authors.length ? authors : uniqueStrings(names(contributions)),
		categories: genres.length ? categoriesFromSubjects(genres) : literaryType,
		publisher: asString(asRecord(edition.publisher).name),
		publishDate: normalizeDate(asString(edition.release_date) || asString(book.release_date)) || asString(book.release_year),
		pageCount: pages,
		isbn10: asString(edition.isbn_10),
		isbn13: asString(edition.isbn_13),
		description: asString(book.description),
		language: '',
		coverUrl: cover,
		source: {
			id: 'hardcover',
			name: NAME,
			url: slug ? `https://hardcover.app/books/${slug}` : 'https://hardcover.app',
			key: slug || `hc-${id}`,
		},
	};
	return { book: result, thumbnailUrl: cover, ref: { id } };
}

/** Genres per book from the search engine's answer ({hits: [{document: {id, genres}}]}), if present. */
function genresById(results: unknown): Map<number, string[]> {
	const map = new Map<number, string[]>();
	const hits = asRecord(results).hits;
	if (!Array.isArray(hits)) return map;
	for (const hit of hits) {
		const document = asRecord(asRecord(hit).document);
		const id = Number(document.id);
		if (Number.isInteger(id)) map.set(id, asStringArray(document.genres));
	}
	return map;
}
