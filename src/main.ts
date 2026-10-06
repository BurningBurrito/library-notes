import { Notice, Plugin } from 'obsidian';
import { createBookNote } from './books/create-book-note';
import { toBookError } from './core/errors';
import { clearCache, setUserAgent } from './core/http';
import { registerDevChecks } from './dev/checks';
import { regenerateLibraryNote } from './library/moc';
import { isBookNote, toggleRead } from './library/read-status';
import { LibraryNotesSettings, LibraryNotesSettingTab, sanitizeSettings } from './settings';

export default class LibraryNotesPlugin extends Plugin {
	settings!: LibraryNotesSettings;

	async onload() {
		await this.loadSettings();
		// No contact email for now (see README "Network use"); the repo link identifies the plugin.
		setUserAgent(`LibraryNotes/${this.manifest.version} (+https://github.com/BurningBurrito/obsidian-library-notes)`);

		this.addCommand({
			id: 'create-book-note',
			name: 'Create new book note',
			callback: () => this.run(() => createBookNote(this)),
		});
		this.addCommand({
			id: 'toggle-read-status',
			name: 'Toggle read status',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!isBookNote(file, this.settings)) return false;
				if (!checking) {
					this.run(async () => {
						const read = await toggleRead(this.app, file);
						new Notice(read ? `Marked "${file.basename}" as read.` : `Marked "${file.basename}" as unread.`);
					});
				}
				return true;
			},
		});
		this.addCommand({
			id: 'regenerate-library-note',
			name: 'Regenerate library note',
			callback: () => this.run(() => regenerateLibraryNote(this)),
		});

		this.addRibbonIcon('library', 'Create new book note', () => this.run(() => createBookNote(this)));
		this.addSettingTab(new LibraryNotesSettingTab(this.app, this));

		// Developer checks exist only in `npm run dev` builds; release builds drop this code.
		if (DEV_BUILD) registerDevChecks(this);
	}

	onunload() {
		clearCache();
	}

	/** A secret from Obsidian's keychain (settings store only its name), or "" if not set. */
	getSecret(name: string): string {
		return name ? (this.app.secretStorage.getSecret(name) ?? '') : '';
	}

	async loadSettings() {
		this.settings = sanitizeSettings((await this.loadData()) as Partial<LibraryNotesSettings> | null);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private run(task: () => Promise<void>) {
		task().catch((err: unknown) => {
			new Notice(toBookError(err).message, 10_000);
		});
	}
}
