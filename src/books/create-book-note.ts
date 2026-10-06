import { App, Notice } from 'obsidian';
import { downloadCover, saveCover } from '../core/covers';
import { toBookError } from '../core/errors';
import { ensureFolder, loadTemplate, nextFreePath, notePath, openNote, safeFileName } from '../core/notes';
import { libraryPaths } from '../core/paths';
import { renderTemplate } from '../core/render';
import { ensureLibraryNote } from '../library/moc';
import type LibraryNotesPlugin from '../main';
import { configuredSources, isSourceId, searchBooks, SearchOutcome } from '../sources';
import type { Book, BookSource, SearchResult } from '../sources/types';
import { askChoice } from '../ui/choice-modal';
import { pickItem } from '../ui/pick-modal';
import { openSearchModal } from '../ui/search-modal';
import { buildVariables, DEFAULT_TEMPLATE } from './template';

/** Search → pick → (existing note?) → details → cover → note from the template. */
export async function createBookNote(plugin: LibraryNotesPlugin): Promise<void> {
	const { app, settings } = plugin;

	const outcome = await openSearchModal<SearchOutcome>(
		app,
		{
			title: 'Search for a book',
			placeholder: 'Title, author, or ISBN',
			emptyMessage: 'Type a title, an author, or an ISBN.',
			initialQuery: selectedText(app),
			modes: configuredSources(plugin).map((source) => ({ id: source.id, label: source.name })),
			initialMode: settings.defaultSource,
		},
		(query, mode) => searchBooks(query, plugin, isSourceId(mode) ? mode : settings.defaultSource),
	);
	if (!outcome) return;
	if (outcome.fallback) {
		new Notice(`${outcome.fallback.reason}\nShowing results from ${outcome.source.name} instead.`, 8000);
	}

	const result = outcome.results.length === 1 ? outcome.results[0] : await pickBook(app, outcome);
	if (!result) return;

	// Check for an existing note before asking the source for more.
	const paths = libraryPaths(settings);
	const baseName = safeFileName(result.book.title, 'Untitled book');
	let path = notePath(paths.books, baseName);
	const existing = app.vault.getFileByPath(path);
	if (existing) {
		const choice = await askChoice(
			app,
			'This book already has a note',
			`"${existing.path}" already exists. Open it, or create a second note for this book?`,
			[
				{ label: 'Open existing', value: 'open' as const, cta: true },
				{ label: 'Create copy', value: 'copy' as const },
				{ label: 'Cancel', value: null },
			],
		);
		if (choice === 'open') await openNote(app, existing);
		if (choice !== 'copy') return;
		path = nextFreePath(app, paths.books, baseName);
	}

	const working = new Notice(`Getting details for "${result.book.title}"…`, 0);
	try {
		const book = await withDetails(plugin, outcome.source, result);
		await ensureFolder(app, paths.books);
		await ensureLibraryNote(plugin);
		const coverPath = await saveBookCover(plugin, outcome.source, book, paths.covers);

		const { template, missing } = await loadTemplate(app, settings.templateFile, DEFAULT_TEMPLATE);
		if (missing) new Notice(`Template "${settings.templateFile}" was not found, so the built-in template was used.`);
		const content = renderTemplate(
			template,
			buildVariables(book, { coverPath, libraryNoteName: paths.libraryNoteName }),
		);
		const file = await app.vault.create(path, content);
		working.hide();
		if (settings.openAfterCreate) await openNote(app, file);
		else new Notice(`Created "${file.path}".`);
	} catch (err) {
		working.hide();
		const reason = toBookError(err).message;
		new Notice(`Could not create the note for "${result.book.title}": ${reason}`, 10_000);
	}
}

/** The search result with its details; if those can't be fetched, what the search found. */
async function withDetails(plugin: LibraryNotesPlugin, source: BookSource, result: SearchResult): Promise<Book> {
	try {
		return await source.details(result, plugin);
	} catch (err) {
		new Notice(
			`Couldn't get all the details from ${source.name} (${toBookError(err).message}) The note uses what the search found.`,
			8000,
		);
		return result.book;
	}
}

/** Download and save the cover. Returns its vault path, or null when there's no cover (the note is still created). */
async function saveBookCover(
	plugin: LibraryNotesPlugin,
	source: BookSource,
	book: Book,
	coversFolder: string,
): Promise<string | null> {
	const url = source.coverDownloadUrl(book);
	if (!url) {
		new Notice(`${source.name} has no cover for "${book.title}".`);
		return null;
	}
	try {
		const image = await downloadCover(url, source.name, source.throttle);
		if (!image) {
			new Notice(`${source.name} has no cover for "${book.title}".`);
			return null;
		}
		// Title plus an ID, so two books with the same title never share a cover.
		const id = safeFileName(book.isbn13 || book.isbn10 || book.source.key, 'cover');
		const file = await saveCover(plugin.app, coversFolder, `${safeFileName(book.title, 'Cover', 80)} - ${id}`, image);
		return file.path;
	} catch (err) {
		new Notice(`Couldn't save the cover (${toBookError(err).message}) The note was created without it.`, 8000);
		return null;
	}
}

function pickBook(app: App, outcome: SearchOutcome): Promise<SearchResult | null> {
	return pickItem(app, {
		items: outcome.results,
		placeholder: `${outcome.results.length} results from ${outcome.source.name}. Type to filter.`,
		emptyText: 'No result matches what you typed.',
		matches: ({ book }, query) =>
			[book.title, book.subtitle, book.publisher, ...book.authors].some((text) => text.toLowerCase().includes(query)),
		render: ({ book, thumbnailUrl }, el) => {
			el.addClass('library-notes-result');
			const cover = el.createDiv({ cls: 'library-notes-result-cover' });
			if (thumbnailUrl) cover.createEl('img', { attr: { src: thumbnailUrl, alt: '', loading: 'lazy' } });
			const text = el.createDiv({ cls: 'library-notes-result-text' });
			text.createDiv({ cls: 'library-notes-result-title', text: book.subtitle ? `${book.title}: ${book.subtitle}` : book.title });
			const details = [book.authors.join(', '), /^\d{4}/.exec(book.publishDate)?.[0], book.publisher].filter(Boolean);
			if (details.length) text.createDiv({ cls: 'library-notes-result-details', text: details.join(' · ') });
		},
	});
}

/** The selected text in the active editor, if it looks like a title or ISBN. */
function selectedText(app: App): string {
	const selection = app.workspace.activeEditor?.editor?.getSelection().trim() ?? '';
	return selection.length <= 120 && !selection.includes('\n') ? selection : '';
}
