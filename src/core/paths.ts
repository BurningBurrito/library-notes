import type { LibraryNotesSettings } from '../settings';
import { joinPath, normalizeFolder, safeFileName } from './notes';

/** Where everything lives, from the folder settings. The root may be nested, e.g. "Synced Notes/Library". */
export interface LibraryPaths {
	root: string;
	books: string;
	covers: string;
	/** Name of the library note, without ".md" (also used for links to it). */
	libraryNoteName: string;
	/** Full path of the library note. */
	libraryNote: string;
}

export function libraryPaths(settings: LibraryNotesSettings): LibraryPaths {
	const root = normalizeFolder(settings.libraryFolder);
	const libraryNoteName = safeFileName(settings.libraryNoteName, 'Library MOC');
	return {
		root,
		books: joinPath(root, normalizeFolder(settings.booksFolder)),
		covers: joinPath(root, normalizeFolder(settings.coversFolder)),
		libraryNoteName,
		libraryNote: joinPath(root, `${libraryNoteName}.md`),
	};
}

/** Whether a vault path is inside a folder ("" = the whole vault). */
export function isInFolder(path: string, folder: string): boolean {
	return folder === '' || path.startsWith(`${folder}/`);
}
