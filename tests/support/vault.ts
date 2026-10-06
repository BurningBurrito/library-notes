// An in-memory vault with the parts of Obsidian's App the plugin uses: files
// and folders, frontmatter edits, the keychain, the open note, and the list of
// installed plugins (for the Dataview check).
import { parse, stringify } from 'yaml';
import { TAbstractFile, TFile, TFolder } from './obsidian';
import { DEFAULT_SETTINGS, LibraryNotesSettings } from '../../src/settings';
import type LibraryNotesPlugin from '../../src/main';

export interface TestApp {
	vault: ReturnType<typeof makeVault>;
	fileManager: { processFrontMatter(file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void> };
	workspace: {
		opened: string[];
		activeEditor: null;
		getLeaf(): { openFile(file: TFile): Promise<void> };
		getActiveFile(): TFile | null;
	};
	secretStorage: { setSecret(id: string, value: string): void; getSecret(id: string): string | null };
	plugins: { enabledPlugins: Set<string>; manifests: Record<string, unknown> };
	/** Text and binary contents by path, for assertions. */
	files: Map<string, string | ArrayBuffer>;
}

function makeVault(files: Map<string, string | ArrayBuffer>) {
	const root = new TFolder();
	root.path = '/';
	const entries = new Map<string, TAbstractFile>();

	const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
	const folderAt = (path: string): TFolder => (path === '' ? root : (entries.get(path) as TFolder));

	function addFolder(path: string): TFolder {
		const folder = new TFolder();
		folder.path = path;
		folder.name = path.split('/').pop() ?? path;
		const parent = folderAt(parentOf(path));
		if (!(parent instanceof TFolder)) throw new Error(`Parent folder of "${path}" doesn't exist`);
		folder.parent = parent;
		parent.children.push(folder);
		entries.set(path, folder);
		return folder;
	}

	function addFile(path: string, data: string | ArrayBuffer): TFile {
		if (entries.has(path)) throw new Error('File already exists.');
		const parentPath = parentOf(path);
		const parent = folderAt(parentPath);
		if (!(parent instanceof TFolder)) throw new Error(`Folder "${parentPath}" doesn't exist`);
		const file = new TFile();
		file.path = path;
		file.name = path.split('/').pop() ?? path;
		file.extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1) : '';
		file.basename = file.extension ? file.name.slice(0, -file.extension.length - 1) : file.name;
		file.parent = parent;
		parent.children.push(file);
		entries.set(path, file);
		files.set(path, data);
		return file;
	}

	return {
		getRoot: () => root,
		getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
		getFileByPath: (path: string) => {
			const entry = entries.get(path);
			return entry instanceof TFile ? entry : null;
		},
		getFolderByPath: (path: string) => {
			const entry = path === '' || path === '/' ? root : entries.get(path);
			return entry instanceof TFolder ? entry : null;
		},
		createFolder: (path: string) => {
			// Like Obsidian: creating a folder that exists is an error; missing parents are not created here.
			if (entries.has(path)) return Promise.reject(new Error('Folder already exists.'));
			return Promise.resolve(addFolder(path));
		},
		create: (path: string, data: string) => Promise.resolve(addFile(path, data)),
		createBinary: (path: string, data: ArrayBuffer) => Promise.resolve(addFile(path, data)),
		read: (file: TFile) => Promise.resolve(files.get(file.path) as string),
		cachedRead: (file: TFile) => Promise.resolve(files.get(file.path) as string),
		process: (file: TFile, fn: (data: string) => string) => {
			const next = fn(files.get(file.path) as string);
			files.set(file.path, next);
			return Promise.resolve(next);
		},
		/** Test helper: create a folder and its parents. */
		mkdirs(path: string) {
			let current = '';
			for (const part of path.split('/')) {
				current = current ? `${current}/${part}` : part;
				if (!entries.has(current)) addFolder(current);
			}
		},
		/** Test helper: add a file, creating its folders. */
		put(path: string, data: string | ArrayBuffer) {
			const parent = parentOf(path);
			if (parent) this.mkdirs(parent);
			return addFile(path, data);
		},
	};
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function makeApp(): TestApp {
	const files = new Map<string, string | ArrayBuffer>();
	const vault = makeVault(files);
	const secrets = new Map<string, string>();
	let active: TFile | null = null;
	const app: TestApp = {
		vault,
		files,
		fileManager: {
			// Like Obsidian: parse the YAML, let the callback change it, write it back.
			processFrontMatter(file, fn) {
				const text = files.get(file.path) as string;
				const match = text.match(FRONTMATTER);
				const data = match ? ((parse(match[1] ?? '') as Record<string, unknown> | null) ?? {}) : {};
				fn(data);
				const body = match ? text.slice(match[0].length) : text;
				files.set(file.path, `---\n${stringify(data)}---\n${body}`);
				return Promise.resolve();
			},
		},
		workspace: {
			opened: [],
			activeEditor: null,
			getLeaf: () => ({
				openFile: (file: TFile) => {
					app.workspace.opened.push(file.path);
					active = file;
					return Promise.resolve();
				},
			}),
			getActiveFile: () => active,
		},
		secretStorage: {
			setSecret: (id, value) => secrets.set(id, value),
			getSecret: (id) => secrets.get(id) ?? null,
		},
		plugins: { enabledPlugins: new Set(['dataview']), manifests: { dataview: {} } },
	};
	return app;
}

/** A plugin object with the members the code uses. */
export function makePlugin(app: TestApp, settings: Partial<LibraryNotesSettings> = {}): LibraryNotesPlugin {
	const plugin = {
		app,
		settings: { ...DEFAULT_SETTINGS, ...settings },
		getSecret: (name: string) => (name ? (app.secretStorage.getSecret(name) ?? '') : ''),
		saveSettings: () => Promise.resolve(),
	};
	return plugin as unknown as LibraryNotesPlugin;
}

/** The frontmatter of a note, parsed. */
export function frontmatter(app: TestApp, path: string): Record<string, unknown> {
	const text = app.files.get(path);
	if (typeof text !== 'string') throw new Error(`No note at ${path}`);
	const match = text.match(FRONTMATTER);
	return match ? ((parse(match[1] ?? '') as Record<string, unknown> | null) ?? {}) : {};
}
