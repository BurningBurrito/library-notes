import type { TemplateVariables } from '../core/render';
import type { Book } from '../sources/types';

/** Where "Create an editable template" saves a copy of the built-in template. */
export const TEMPLATE_COPY_PATH = 'Templates/Book note.md';

export const DEFAULT_TEMPLATE = `---
tags:
  - 📚Book
title: {{title}}
subtitle: {{subtitle}}
author: {{author}}
category: {{category}}
publisher: {{publisher}}
publishDate: {{publishDate}}
pageCount: {{pageCount}}
isbn: {{isbn}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
read: false
rating: N/A
AudioBook: N/A
EBook: N/A
source: {{source}}
sourceUrl: {{sourceUrl}}
created: {{date:YYYY-MM-DD HH:mm:ss}}
link:
  - {{libraryLink}}
---
# Summary:

# Notes:

# Quotes:
`;

export interface NoteContext {
	/** Vault path of the saved cover, or null when there's none. */
	coverPath: string | null;
	/** Name of the library note, for the back-link. */
	libraryNoteName: string;
}

export function buildVariables(book: Book, context: NoteContext): TemplateVariables {
	const coverPath = context.coverPath ?? '';
	const pageCount = book.pageCount ?? '';
	return {
		title: book.title,
		subtitle: book.subtitle,
		author: book.authors,
		category: book.categories,
		publisher: book.publisher,
		publishDate: book.publishDate,
		year: /^\d{4}/.exec(book.publishDate)?.[0] ?? '',
		pageCount,
		isbn: book.isbn13 || book.isbn10,
		isbn10: book.isbn10,
		isbn13: book.isbn13,
		description: book.description,
		language: book.language,
		coverUrl: book.coverUrl,
		// A link (not a plain path) so Obsidian keeps it up to date if the image is renamed or moved.
		localCover: coverPath ? `[[${coverPath}]]` : '',
		localCoverPath: coverPath,
		source: book.source.name,
		sourceUrl: book.source.url,
		libraryLink: `[[${context.libraryNoteName}]]`,

		// Names used by the Book Search plugin, so its templates mostly keep working.
		authors: book.authors,
		categories: book.categories,
		totalPage: pageCount,
		localCoverImage: coverPath,
	};
}
