import type { Book } from '../../src/sources/types';

/** A complete book, as a source would return it. */
export function sampleBook(overrides: Partial<Book> = {}): Book {
	return {
		title: 'Project Hail Mary',
		subtitle: '',
		authors: ['Andy Weir'],
		categories: ['Science fiction'],
		publisher: 'Ballantine Books',
		publishDate: '2021-05-04',
		pageCount: 496,
		isbn10: '0593135202',
		isbn13: '9780593135204',
		description: 'Ryland Grace is the sole survivor on a desperate, last-chance mission.',
		language: 'eng',
		coverUrl: 'https://covers.openlibrary.org/b/id/11200092-L.jpg',
		source: {
			id: 'open-library',
			name: 'Open Library',
			url: 'https://openlibrary.org/works/OL21745884W',
			key: 'OL21745884W',
		},
		...overrides,
	};
}
