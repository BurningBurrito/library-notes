import { App, Notice, PluginSettingTab, SecretComponent, SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { DEFAULT_TEMPLATE, TEMPLATE_COPY_PATH } from './books/template';
import { dataviewMessage, dataviewStatus } from './core/dataview';
import { toBookError } from './core/errors';
import { ensureFolder } from './core/notes';
import { libraryPaths } from './core/paths';
import { regenerateLibraryNote } from './library/moc';
import type LibraryNotesPlugin from './main';
import { configuredSources, getSource, isSourceId } from './sources';
import { isSignedIn, isSignInAvailable, signOut } from './sources/hardcover/auth';
import { signInWithHardcover } from './ui/hardcover-sign-in';
import type { SourceId } from './sources/types';

export interface LibraryNotesSettings {
	/** Holds the library note and the Books and Covers folders. May be nested ("Synced Notes/Library"). */
	libraryFolder: string;
	/** Inside the library folder. */
	booksFolder: string;
	/** Inside the library folder. */
	coversFolder: string;
	/** The overview note, without ".md". */
	libraryNoteName: string;
	templateFile: string;
	openAfterCreate: boolean;

	defaultSource: SourceId;
	useFallback: boolean;
	/** Two-letter language code used to prefer editions in that language; "" for none. */
	language: string;

	/** Name of the secret in Obsidian's keychain that holds the Google Books API key (not the key itself). */
	googleBooksKeySecret: string;
}

export const DEFAULT_SETTINGS: LibraryNotesSettings = {
	libraryFolder: 'Library',
	booksFolder: 'Books',
	coversFolder: 'Covers',
	libraryNoteName: 'Library MOC',
	templateFile: '',
	openAfterCreate: true,

	defaultSource: 'open-library',
	useFallback: true,
	language: 'en',

	googleBooksKeySecret: '',
};

const LANGUAGE_CODE = /^[a-z]{2}$/;
// Characters that can't be in a file or folder name, or that break links.
const BAD_NAME_CHARS = /[\\:*?"<>|#^[\]]/;

/** Merge saved data with defaults and repair values the settings page would reject. */
export function sanitizeSettings(saved: Partial<LibraryNotesSettings> | null): LibraryNotesSettings {
	const settings = Object.assign({}, DEFAULT_SETTINGS, saved);
	for (const key of ['booksFolder', 'coversFolder', 'libraryNoteName'] as const) {
		if (folderProblem(settings[key])) settings[key] = DEFAULT_SETTINGS[key];
	}
	if (!isSourceId(settings.defaultSource)) settings.defaultSource = DEFAULT_SETTINGS.defaultSource;
	if (settings.language && !LANGUAGE_CODE.test(settings.language)) settings.language = DEFAULT_SETTINGS.language;
	return settings;
}

/** Why a subfolder or note name can't be used, or undefined if it's fine. */
function folderProblem(value: string): string | undefined {
	const text = value.trim();
	if (!text) return 'This can’t be empty.';
	if (BAD_NAME_CHARS.test(text)) return 'Remove these characters: \\ : * ? " < > | # ^ [ ]';
	if (text.split('/').some((part) => part === '..' || part === '.')) return 'Use a folder name, not "." or "..".';
	return undefined;
}

type SettingKey = keyof LibraryNotesSettings;

// Declarative settings (Obsidian 1.13+): Obsidian renders these, saves changes
// to plugin.settings, and includes them in the settings search.
export class LibraryNotesSettingTab extends PluginSettingTab {
	plugin: LibraryNotesPlugin;

	constructor(app: App, plugin: LibraryNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem<SettingKey>[] {
		return [
			{ type: 'group', items: this.generalItems() },
			{ type: 'group', heading: 'Library note', items: this.libraryNoteItems() },
			{ type: 'group', heading: 'Sources', items: this.sourceItems() },
			{ type: 'group', heading: 'Google Books', items: this.googleBooksItems() },
			{ type: 'group', heading: 'Hardcover', items: this.hardcoverItems() },
		];
	}

	private generalItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'Library folder',
				desc: 'Holds the library note and the books and covers folders. It can be inside another folder. Created if it doesn’t exist.',
				control: {
					type: 'folder',
					key: 'libraryFolder',
					placeholder: DEFAULT_SETTINGS.libraryFolder,
					defaultValue: DEFAULT_SETTINGS.libraryFolder,
				},
			},
			{
				name: 'Books folder',
				desc: 'Inside the library folder. One note per book.',
				control: {
					type: 'text',
					key: 'booksFolder',
					placeholder: DEFAULT_SETTINGS.booksFolder,
					validate: folderProblem,
				},
			},
			{
				name: 'Covers folder',
				desc: 'Inside the library folder. Cover images are saved here.',
				control: {
					type: 'text',
					key: 'coversFolder',
					placeholder: DEFAULT_SETTINGS.coversFolder,
					validate: folderProblem,
				},
			},
			{
				name: 'Template file',
				desc: 'Leave empty to use the built-in template. The README lists the available variables.',
				control: {
					type: 'file',
					key: 'templateFile',
					placeholder: TEMPLATE_COPY_PATH,
					filter: (file) => file.extension === 'md',
				},
			},
			{
				name: 'Create an editable template',
				desc: `Save the built-in template to "${TEMPLATE_COPY_PATH}" and use it, so you can change it.`,
				action: () => void this.createTemplateCopy(),
			},
			{
				name: 'Open note after creating it',
				control: { type: 'toggle', key: 'openAfterCreate' },
			},
		];
	}

	private libraryNoteItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'Library note name',
				desc: 'The overview note in the library folder, with a table of all your books. It’s created on first use and never overwritten.',
				control: {
					type: 'text',
					key: 'libraryNoteName',
					placeholder: DEFAULT_SETTINGS.libraryNoteName,
					validate: (value) => (value.includes('/') ? 'Use a name, not a path.' : folderProblem(value)),
				},
			},
			{
				name: 'Dataview',
				render: (setting) => {
					const status = dataviewStatus(this.app);
					setting.setDesc(
						dataviewMessage(status, libraryPaths(this.plugin.settings).libraryNoteName) ??
							(status === 'enabled'
								? 'Installed and enabled. The library table will show.'
								: 'The library table needs the Dataview plugin.'),
					);
				},
			},
			{
				name: 'Regenerate library note',
				desc: 'Rebuild the table from the current folder settings, or add it to a library note you made yourself. You confirm first; nothing else in the note changes.',
				action: () => void this.run(() => regenerateLibraryNote(this.plugin)),
			},
		];
	}

	private sourceItems(): SettingGroupItem<SettingKey>[] {
		const options = Object.fromEntries(configuredSources(this.plugin).map((source) => [source.id, source.name]));
		return [
			{
				name: 'Default source',
				desc: 'Where searches go first. You can switch in the search window.',
				control: { type: 'dropdown', key: 'defaultSource', options },
			},
			{
				name: 'Try the next source if the default one fails or finds nothing',
				desc: 'Uses the other sources you’ve set up, in order.',
				control: { type: 'toggle', key: 'useFallback' },
			},
			{
				name: 'Preferred language',
				desc: 'Two-letter code, such as en or es. Open Library shows editions in this language first; Google Books shows only books in this language. Leave empty for no preference.',
				control: {
					type: 'text',
					key: 'language',
					placeholder: 'en',
					validate: (value) =>
						!value.trim() || LANGUAGE_CODE.test(value.trim()) ? undefined : 'Use a two-letter lowercase code, such as en.',
				},
			},
			{
				name: 'Open Library',
				desc: 'Free, no account needed. Each search sends what you type to openlibrary.org.',
				render: (setting) => {
					setting.addButton((button) =>
						button.setButtonText('Check').onClick(() => void this.checkSource('open-library')),
					);
				},
			},
		];
	}

	private googleBooksItems(): SettingGroupItem<SettingKey>[] {
		return [
			{
				name: 'API key',
				desc: googleKeyDescription(),
				aliases: ['Google Books API key'],
				render: (setting) => {
					setting.addComponent((el) =>
						new SecretComponent(this.app, el).setValue(this.plugin.settings.googleBooksKeySecret).onChange(async (value) => {
							this.plugin.settings.googleBooksKeySecret = value;
							await this.plugin.saveSettings();
							// The source list (dropdown, search window) depends on whether a key is set.
							this.update();
						}),
					);
				},
			},
			{
				name: 'Check API key',
				desc: 'Makes one small request to Google Books with your key.',
				visible: () => this.plugin.getSecret(this.plugin.settings.googleBooksKeySecret) !== '',
				action: () => void this.checkSource('google-books'),
			},
		];
	}

	private hardcoverItems(): SettingGroupItem<SettingKey>[] {
		const signedIn = () => isSignedIn(this.plugin);
		return [
			{
				name: 'Hardcover account',
				desc: isSignInAvailable()
					? 'Optional. Sign in with your free hardcover.app account to search it. Library Notes asks only to search the book catalog; it can’t see or change your account. The sign-in stays on this device. Hardcover’s API is in beta and may change; if it stops working, your other sources still work.'
					: 'Hardcover sign-in isn’t available in this version.',
				render: (setting) => {
					if (!isSignInAvailable()) return;
					if (signedIn()) {
						setting.setName('Hardcover: signed in');
						setting.addButton((button) =>
							button.setButtonText('Check connection').onClick(() => void this.checkSource('hardcover')),
						);
						setting.addButton((button) =>
							button.setButtonText('Sign out').onClick(async () => {
								await signOut(this.plugin);
								new Notice('Hardcover: signed out on this device.');
								this.update();
							}),
						);
					} else {
						setting.addButton((button) =>
							button
								.setButtonText('Sign in')
								.setCta()
								.onClick(async () => {
									if (await signInWithHardcover(this.plugin)) this.update();
								}),
						);
					}
				},
			},
		];
	}

	private async checkSource(id: SourceId): Promise<void> {
		const source = getSource(id);
		if (!source) return;
		try {
			new Notice(await source.check(this.plugin));
		} catch (err) {
			new Notice(`${source.name} check failed: ${toBookError(err).message}`, 10_000);
		}
	}

	private async createTemplateCopy(): Promise<void> {
		await this.run(async () => {
			const path = TEMPLATE_COPY_PATH;
			if (!this.app.vault.getFileByPath(path)) {
				await ensureFolder(this.app, path.slice(0, path.lastIndexOf('/')));
				await this.app.vault.create(path, DEFAULT_TEMPLATE);
				new Notice(`Created "${path}". Edit it to change your book notes.`);
			} else {
				new Notice(`"${path}" already exists. It's now your template.`);
			}
			this.plugin.settings.templateFile = path;
			await this.plugin.saveSettings();
			this.update();
		});
	}

	private async run(task: () => Promise<void>): Promise<void> {
		try {
			await task();
		} catch (err) {
			new Notice(toBookError(err).message, 10_000);
		}
	}
}

function googleKeyDescription(): DocumentFragment {
	return createFragment((frag) => {
		frag.appendText('Optional. Google Books needs your own free API key. In the Google Cloud console (');
		frag.createEl('a', { text: 'console.cloud.google.com', href: 'https://console.cloud.google.com/apis/library/books.googleapis.com' });
		frag.appendText(
			'), enable "Books API", then create an API key under Credentials, restricted to the Books API. The key is kept in Obsidian’s keychain, not in this plugin’s settings file. Each search sends what you type, and your key, to Google.',
		);
	});
}
