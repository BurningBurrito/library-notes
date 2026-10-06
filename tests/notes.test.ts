import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ensureFolder, findNoteByName, nameKey, nextFreePath, safeFileName } from '../src/core/notes';
import { isInFolder, libraryPaths } from '../src/core/paths';
import { DEFAULT_SETTINGS } from '../src/settings';
import { makeApp } from './support/vault';
import type { App } from 'obsidian';

describe('file names', () => {
	it('removes characters that break files or links, and uses straight apostrophes', () => {
		assert.equal(safeFileName('Dirk Gently’s Holistic Detective Agency', 'x'), "Dirk Gently's Holistic Detective Agency");
		assert.equal(safeFileName('AC/DC: [Live] #1 | “Best”?', 'x'), 'AC DC Live 1 Best');
		assert.equal(safeFileName('  ...  ', 'Untitled book'), 'Untitled book');
		assert.equal(safeFileName('a'.repeat(200), 'x', 80).length, 80);
	});

	it('treats small differences as the same name', () => {
		assert.equal(nameKey('Dirk Gently’s  Holistic Detective Agency'), nameKey("dirk gently's holistic detective agency"));
		assert.equal(nameKey('The Long Dark Tea–Time of the Soul'), nameKey('The Long Dark Tea-Time of the Soul'));
		assert.notEqual(nameKey('Dune'), nameKey('Dune Messiah'));
	});
});

describe('finding notes', () => {
	const app = makeApp();
	app.vault.put("Library/Books/Dirk Gently's Holistic Detective Agency.md", '');
	app.vault.put('Library/Books/Fiction/Dune.md', '');
	app.vault.put('Library/LIbrary MOC.md', '');
	app.vault.put('Elsewhere/Dune.md', '');
	const vaultApp = app as unknown as App;

	it('finds a note by exact name, by small differences, and in subfolders', () => {
		assert.equal(findNoteByName(vaultApp, 'Library/Books', 'Dirk Gently’s Holistic Detective Agency', true)?.path, "Library/Books/Dirk Gently's Holistic Detective Agency.md");
		assert.equal(findNoteByName(vaultApp, 'Library/Books', 'dune', true)?.path, 'Library/Books/Fiction/Dune.md');
		assert.equal(findNoteByName(vaultApp, 'Library', 'Library MOC', false)?.path, 'Library/LIbrary MOC.md');
	});

	it('stays inside the folder', () => {
		assert.equal(findNoteByName(vaultApp, 'Library/Books', 'Dune', false), null);
		assert.equal(findNoteByName(vaultApp, 'Library', 'Dune', false), null);
	});

	it('numbers copies', () => {
		app.vault.put('Library/Books/Dune.md', '');
		app.vault.put('Library/Books/Dune 2.md', '');
		assert.equal(nextFreePath(vaultApp, 'Library/Books', 'Dune'), 'Library/Books/Dune 3.md');
	});
});

describe('folders', () => {
	it('creates nested folders one level at a time and keeps existing ones', async () => {
		const app = makeApp();
		app.vault.mkdirs('Synced Notes');
		await ensureFolder(app as unknown as App, 'Synced Notes/Library/Books');
		assert.ok(app.vault.getFolderByPath('Synced Notes/Library/Books'));
		await ensureFolder(app as unknown as App, 'Synced Notes/Library/Books'); // again: no error
	});

	it('explains when a file is in the way', async () => {
		const app = makeApp();
		app.vault.put('Library', 'a file, not a folder');
		await assert.rejects(ensureFolder(app as unknown as App, 'Library/Books'), /"Library" is a file, not a folder/);
	});

	it('builds the library paths from the settings, also for a nested or root library folder', () => {
		const nested = libraryPaths({ ...DEFAULT_SETTINGS, libraryFolder: 'Synced Notes/Library/', booksFolder: 'All Books', libraryNoteName: 'LIbrary MOC' });
		assert.deepEqual(nested, {
			root: 'Synced Notes/Library',
			books: 'Synced Notes/Library/All Books',
			covers: 'Synced Notes/Library/Covers',
			libraryNoteName: 'LIbrary MOC',
			libraryNote: 'Synced Notes/Library/LIbrary MOC.md',
		});
		const root = libraryPaths({ ...DEFAULT_SETTINGS, libraryFolder: '/' });
		assert.equal(root.books, 'Books');
		assert.equal(root.libraryNote, 'Library MOC.md');
		assert.ok(isInFolder('Library/Books/Fiction/Dune.md', 'Library/Books'));
		assert.ok(!isInFolder('Library/Books Extra/Dune.md', 'Library/Books'));
	});
});
