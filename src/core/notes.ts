import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { BookError } from './errors';

// Characters that aren't allowed in file names on some systems, or that break
// Obsidian links (# ^ [ ] |).
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|#^[\]]/g;

/** A safe file name (without extension), e.g. "Who? / What" -> "Who What". */
export function safeFileName(text: string, fallback: string, maxLength = 120): string {
	const name = text
		// Straight apostrophes are easier to type in links; curly double quotes go like straight ones.
		.replace(/[‘’ʼ]/g, "'")
		.replace(/[“”]/g, ' ')
		.replace(ILLEGAL_FILENAME_CHARS, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
		.slice(0, maxLength)
		.trim();
	return name || fallback;
}

/**
 * For comparing note names: ignores letter case, curly vs straight quotes,
 * dash styles, and extra spaces ("Dirk Gently’s" = "dirk gently's").
 */
export function nameKey(name: string): string {
	return name
		.normalize('NFC')
		.replace(/[‘’ʼ`]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[‐‑‒–—―]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/**
 * A note in `folder` with this name, compared with nameKey. Looks in
 * subfolders too when `recursive` is set (never across the whole vault).
 */
export function findNoteByName(app: App, folder: string, baseName: string, recursive: boolean): TFile | null {
	const exact = app.vault.getFileByPath(notePath(folder, baseName));
	if (exact) return exact;
	const start = folder ? app.vault.getFolderByPath(folder) : app.vault.getRoot();
	if (!start) return null;
	const key = nameKey(baseName);
	const pending: TFolder[] = [start];
	for (let current = pending.pop(); current; current = pending.pop()) {
		for (const child of current.children) {
			if (child instanceof TFile) {
				if (child.extension === 'md' && nameKey(child.basename) === key) return child;
			} else if (child instanceof TFolder && recursive && folder !== '') {
				pending.push(child);
			}
		}
	}
	return null;
}

/** Normalized folder path; "" means the vault root. */
export function normalizeFolder(folder: string): string {
	const path = normalizePath(folder.trim());
	return path === '/' ? '' : path;
}

/** Join path parts, skipping empty ones (the vault root). */
export function joinPath(...parts: string[]): string {
	const path = normalizePath(parts.filter((part) => part !== '').join('/'));
	return path === '/' ? '' : path;
}

export function notePath(folder: string, baseName: string, copyNumber = 1): string {
	const fileName = copyNumber > 1 ? `${baseName} ${copyNumber}.md` : `${baseName}.md`;
	return joinPath(folder, fileName);
}

/** First free path of the form "Title 2.md", "Title 3.md", ... */
export function nextFreePath(app: App, folder: string, baseName: string): string {
	let n = 2;
	while (app.vault.getAbstractFileByPath(notePath(folder, baseName, n))) n++;
	return notePath(folder, baseName, n);
}

/**
 * Create a folder and any missing parents, one level at a time. Existing
 * folders are left as they are; nothing is ever renamed or deleted.
 */
export async function ensureFolder(app: App, folder: string): Promise<void> {
	if (!folder) return;
	let path = '';
	for (const part of folder.split('/')) {
		path = path ? `${path}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) continue;
		if (existing) {
			throw new BookError('config', `"${path}" is a file, not a folder. Choose another folder in the Library Notes settings.`);
		}
		await app.vault.createFolder(path);
	}
}

/**
 * The user's template file, or the built-in template if none is set.
 * `missing` is true when a template file is set but can't be found.
 */
export async function loadTemplate(
	app: App,
	templatePath: string,
	builtInTemplate: string,
): Promise<{ template: string; missing: boolean }> {
	const path = templatePath.trim();
	if (!path) return { template: builtInTemplate, missing: false };
	const file =
		app.vault.getFileByPath(normalizePath(path)) ?? app.vault.getFileByPath(normalizePath(`${path}.md`));
	if (!file) return { template: builtInTemplate, missing: true };
	return { template: await app.vault.cachedRead(file), missing: false };
}

export async function openNote(app: App, file: TFile): Promise<void> {
	await app.workspace.getLeaf(false).openFile(file);
}
