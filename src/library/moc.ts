import { Notice, TFile } from 'obsidian';
import { dataviewMessage, dataviewStatus } from '../core/dataview';
import { BookError } from '../core/errors';
import { ensureFolder, findNoteByName } from '../core/notes';
import { libraryPaths } from '../core/paths';
import type LibraryNotesPlugin from '../main';
import { askChoice, Choice } from '../ui/choice-modal';

/** Notes with this class use the full pane width (see styles.css). */
export const LIBRARY_NOTE_CLASS = 'library-notes-moc';

const START_PREFIX = '%% library-notes:start';
const START_LINE = `${START_PREFIX} (generated: "Regenerate library note" replaces only the part between these markers) %%`;
const END_LINE = '%% library-notes:end %%';

// The cover column accepts every form a cover can be stored in: a link
// ("[[…]]"), an embed ("![[…]]"), a link with "|alias", or a plain path such as
// "/Book.jpg" from older notes. Every function used accepts any value, so no
// row can make the expression fail (Dataview silently drops rows that do).
const COVER_COLUMN = String.raw`choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Cover`;

/** The Dataview query for the library table, reading notes from the Books folder. */
export function tableQuery(booksFolder: string): string {
	const from = booksFolder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return [
		'```dataview',
		'TABLE WITHOUT ID',
		`  ${COVER_COLUMN},`,
		'  default(title, file.name) AS Title,',
		'  author AS Author,',
		'  category AS Category,',
		'  file.link AS Note,',
		'  choice(read, "🟩", "🟥") AS Read,',
		'  AudioBook AS AudioBook,',
		'  EBook AS EBook',
		`FROM "${from}"`,
		'SORT default(title, file.name) ASC',
		'```',
	].join('\n');
}

export function generatedBlock(booksFolder: string): string {
	return `${START_LINE}\n${tableQuery(booksFolder)}\n${END_LINE}`;
}

export function newLibraryNote(booksFolder: string): string {
	return `---\ncssclasses:\n  - ${LIBRARY_NOTE_CLASS}\n---\n# Library\n\n${generatedBlock(booksFolder)}\n`;
}

export type RegenerationPlan =
	/** The note has our markers: replace what's between them. */
	| { kind: 'markers'; start: number; end: number }
	/** No markers, but exactly one Dataview table (e.g. a library note made by hand). */
	| { kind: 'single-table'; start: number; end: number }
	/** No markers and no single table to replace: add at the end. */
	| { kind: 'append' };

// A ```dataview (or ~~~dataview) code block, not dataviewjs.
const DATAVIEW_BLOCK = /^(`{3,}|~{3,})[ \t]*dataview[ \t]*\r?\n[\s\S]*?\r?\n\1[ \t]*$/gm;

export function planRegeneration(content: string): RegenerationPlan {
	const start = content.search(new RegExp(`^${escapeRegExp(START_PREFIX)}`, 'm'));
	if (start >= 0) {
		const endIndex = content.indexOf(END_LINE, start);
		if (endIndex >= 0) return { kind: 'markers', start, end: endIndex + END_LINE.length };
	}
	const tables = Array.from(content.matchAll(DATAVIEW_BLOCK));
	const only = tables[0];
	if (tables.length === 1 && only?.index !== undefined) {
		return { kind: 'single-table', start: only.index, end: only.index + only[0].length };
	}
	return { kind: 'append' };
}

/** The note's new content. `replaceTable` decides what happens with a single hand-made table. */
export function applyRegeneration(content: string, plan: RegenerationPlan, block: string, replaceTable: boolean): string {
	if (plan.kind === 'markers' || (plan.kind === 'single-table' && replaceTable)) {
		return content.slice(0, plan.start) + block + content.slice(plan.end);
	}
	return `${content.trimEnd()}\n\n${block}\n`;
}

const toldAboutCapitals = new Set<string>();

/**
 * The library note, also when its name differs from the setting only in
 * capital letters (e.g. "LIbrary MOC" vs "Library MOC"), so a second one is
 * never created next to it.
 */
export function findLibraryNote(plugin: LibraryNotesPlugin): TFile | null {
	const paths = libraryPaths(plugin.settings);
	const file = findNoteByName(plugin.app, paths.root, paths.libraryNoteName, false);
	if (file && file.basename !== paths.libraryNoteName && !toldAboutCapitals.has(file.path)) {
		toldAboutCapitals.add(file.path);
		new Notice(
			`Using "${file.path}" as the library note. Its name differs from the setting "${paths.libraryNoteName}" only in capital letters.`,
			10_000,
		);
	}
	return file;
}

/**
 * The library note, created if it doesn't exist yet. An existing note is
 * never changed here; that only happens through "Regenerate library note".
 */
export async function ensureLibraryNote(plugin: LibraryNotesPlugin): Promise<TFile> {
	const { app } = plugin;
	const paths = libraryPaths(plugin.settings);
	const existing = findLibraryNote(plugin);
	if (existing) return existing;
	if (app.vault.getAbstractFileByPath(paths.libraryNote)) {
		throw new BookError('config', `"${paths.libraryNote}" is a folder. Choose another library note name in the settings.`);
	}
	await ensureFolder(app, paths.root);
	const file = await app.vault.create(paths.libraryNote, newLibraryNote(paths.books));
	new Notice(`Created the library note "${paths.libraryNote}".`);
	warnIfNoDataview(plugin);
	return file;
}

type RegenerateChoice = 'regenerate' | 'replace' | 'append';

/** Rebuild (or add) the library table, after the user confirms. Text outside the table is kept. */
export async function regenerateLibraryNote(plugin: LibraryNotesPlugin): Promise<void> {
	const { app } = plugin;
	const paths = libraryPaths(plugin.settings);
	const file = findLibraryNote(plugin);
	if (!file) {
		await ensureLibraryNote(plugin);
		return;
	}

	const plan = planRegeneration(await app.vault.read(file));
	const name = file.basename;
	const cancel: Choice<RegenerateChoice | null> = { label: 'Cancel', value: null };
	let message: string;
	let choices: Choice<RegenerateChoice | null>[];
	switch (plan.kind) {
		case 'markers':
			message = `This replaces the library table in "${name}" with a new one built from your current folder settings. Everything else in the note stays as it is.`;
			choices = [{ label: 'Regenerate', value: 'regenerate', cta: true }, cancel];
			break;
		case 'single-table':
			message =
				`"${name}" already has a Dataview table that Library Notes didn't create.\n\n` +
				'Replace it with the library table? The old query is removed; your properties and any other text stay. ' +
				'Or add the library table at the end and keep both.';
			choices = [
				{ label: 'Replace that table', value: 'replace', cta: true, destructive: true },
				{ label: 'Add at the end', value: 'append' },
				cancel,
			];
			break;
		case 'append':
			message = `"${name}" has no library table yet. Add it at the end of the note? Nothing in the note is removed.`;
			choices = [{ label: 'Add the table', value: 'append', cta: true }, cancel];
			break;
	}
	const choice = await askChoice(app, 'Regenerate library note', message, choices);
	if (!choice) return;

	const block = generatedBlock(paths.books);
	// Plan again on the current text, in case the note changed while the window was open.
	await app.vault.process(file, (data) => applyRegeneration(data, planRegeneration(data), block, choice === 'replace'));
	await addLibraryClass(plugin, file);
	new Notice(`Updated the library note "${file.path}".`);
	warnIfNoDataview(plugin);
}

/** Add the full-width class to the note's cssclasses, keeping any it already has. */
async function addLibraryClass(plugin: LibraryNotesPlugin, file: TFile): Promise<void> {
	await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		const current = frontmatter.cssclasses;
		const classes = Array.isArray(current) ? current.map(String) : typeof current === 'string' && current ? [current] : [];
		if (!classes.includes(LIBRARY_NOTE_CLASS)) frontmatter.cssclasses = [...classes, LIBRARY_NOTE_CLASS];
	});
}

export function warnIfNoDataview(plugin: LibraryNotesPlugin): void {
	const message = dataviewMessage(dataviewStatus(plugin.app), libraryPaths(plugin.settings).libraryNoteName);
	if (message) new Notice(message, 15_000);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
