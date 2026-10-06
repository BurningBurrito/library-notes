import { App, TFile } from 'obsidian';
import { isInFolder, libraryPaths } from '../core/paths';
import type { LibraryNotesSettings } from '../settings';

/** A note in the Books folder (or one of its subfolders). */
export function isBookNote(file: TFile | null, settings: LibraryNotesSettings): file is TFile {
	return !!file && file.extension === 'md' && isInFolder(file.path, libraryPaths(settings).books);
}

/**
 * Flip the note's `read` property (a missing one counts as unread). Only that
 * property changes; Obsidian rewrites the frontmatter safely.
 */
export async function toggleRead(app: App, file: TFile): Promise<boolean> {
	let read = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		read = frontmatter.read !== true;
		frontmatter.read = read;
	});
	return read;
}
