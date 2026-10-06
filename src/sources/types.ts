import type { ThrottleRule } from '../core/throttle';
import type LibraryNotesPlugin from '../main';

export type SourceId = 'open-library' | 'google-books';

/** Everything a source knows about one book, in one shape for all sources. */
export interface Book {
	title: string;
	subtitle: string;
	authors: string[];
	/** Genres or categories, at most a few. */
	categories: string[];
	publisher: string;
	/** "2021-05-04", "2021-05", or "2021": as precise as the source knows. */
	publishDate: string;
	pageCount: number | null;
	isbn10: string;
	isbn13: string;
	description: string;
	/** Language code as the source gives it, e.g. "eng" or "en". */
	language: string;
	/** Web address of the cover image (for the note's `cover` property). */
	coverUrl: string;
	source: {
		id: SourceId;
		name: string;
		/** The book's page on the source's website. */
		url: string;
		/** The source's own ID for the book, e.g. "OL21745884W". */
		key: string;
	};
}

/** One row in the search results list. */
export interface SearchResult {
	/** What the list shows; also the note's data if details can't be fetched. */
	book: Book;
	/** Small cover for the results list, or "". */
	thumbnailUrl: string;
	/** Source-specific IDs needed to fetch details. */
	ref: Record<string, string>;
}

export interface BookSource {
	id: SourceId;
	name: string;
	/** Spacing for all requests to this source, including cover downloads. */
	throttle?: ThrottleRule;
	/** Whether the source can be used: Open Library always; others once a key or sign-in exists. */
	isConfigured(plugin: LibraryNotesPlugin): boolean;
	/** Search for books. Resolves with [] when nothing matches; throws a BookError on failure. */
	search(query: string, plugin: LibraryNotesPlugin): Promise<SearchResult[]>;
	/** Fill in what the search didn't include, such as the description. */
	details(result: SearchResult, plugin: LibraryNotesPlugin): Promise<Book>;
	/** Where to download the cover for saving ("" for none). */
	coverDownloadUrl(book: Book): string;
	/** A tiny real request for the "check" buttons in settings. Resolves with a message for the user. */
	check(plugin: LibraryNotesPlugin): Promise<string>;
}
