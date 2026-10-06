import assert from 'node:assert/strict';
import { before, beforeEach, describe, it } from 'node:test';
import { createBookNote } from '../src/books/create-book-note';
import { clearCache, setUserAgent } from '../src/core/http';
import type { LibraryNotesSettings } from '../src/settings';
import { notices } from './support/obsidian';
import { fake, json, resetNetwork, setOnline } from './support/network';
import { resetUi, ui, userChooses, userPicks, userSearches } from './support/ui';
import { frontmatter, makeApp, makePlugin, TestApp } from './support/vault';

const HAND_MADE_MOC = '---\nbanner: "![[LibraryBanner.jpg]]"\n---\n\n```dataview\ntable title, localCover as cover\nFROM "Synced Notes/Library/All Books"\n```\n';
const NESTED: Partial<LibraryNotesSettings> = { libraryFolder: 'Synced Notes/Library', booksFolder: 'All Books', libraryNoteName: 'Library MOC' };

let app: TestApp;
const plugin = (settings: Partial<LibraryNotesSettings> = {}) => makePlugin(app, settings);
const notesIn = (folder: string) => [...app.files.keys()].filter((p) => p.startsWith(`${folder}/`) && p.endsWith('.md')).sort();
const coversIn = (folder: string) => [...app.files.keys()].filter((p) => p.startsWith(`${folder}/`) && !p.endsWith('.md'));

describe('creating a book note (recorded Open Library answers)', () => {
	before(() => setUserAgent('LibraryNotes/test (+https://github.com/BurningBurrito/library-notes)'));
	beforeEach(() => {
		clearCache();
		resetNetwork();
		resetUi();
		notices.length = 0;
		app = makeApp();
	});

	it('creates the note, saves the cover, creates the library note, and opens the note', async () => {
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin());

		const path = 'Library/Books/Project Hail Mary.md';
		const p = frontmatter(app, path);
		assert.equal(p.title, 'Project Hail Mary');
		assert.deepEqual(p.author, ['Andy Weir']);
		assert.equal(p.pageCount, 496);
		assert.equal(p.isbn, '9781529100624');
		assert.equal(p.source, 'Open Library');
		assert.equal(p.localCover, '[[Library/Covers/Project Hail Mary - 9781529100624.jpg]]');
		assert.deepEqual(p.link, ['[[Library MOC]]']);
		assert.equal(p.read, false);

		const cover = new Uint8Array(app.files.get('Library/Covers/Project Hail Mary - 9781529100624.jpg') as ArrayBuffer);
		assert.deepEqual([...cover.slice(0, 3)], [0xff, 0xd8, 0xff], 'a real JPEG');
		assert.match(app.files.get('Library/Library MOC.md') as string, /FROM "Library\/Books"/);
		assert.deepEqual(app.workspace.opened, [path]);
		assert.equal(ui.pickLists[0]?.length, 20, 'the results list');
		assert.deepEqual(ui.searchOptions[0]?.modes?.map((m) => m.id), ['open-library'], 'no source buttons with one source');
	});

	it('skips the list for an ISBN search (one exact result)', async () => {
		userSearches('9780593395561');
		await createBookNote(plugin());
		assert.equal(ui.pickLists.length, 0);
		assert.equal(frontmatter(app, 'Library/Books/Project Hail Mary.md').isbn, '9780593395561');
	});

	it('asks what to do when the book already has a note: open it, create a copy, or cancel', async () => {
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin());
		const original = app.files.get('Library/Books/Project Hail Mary.md');

		userSearches('project hail mary');
		userPicks(0);
		userChooses('Create copy');
		await createBookNote(plugin());
		assert.deepEqual(ui.choices[0]?.labels, ['Open existing', 'Create copy', 'Cancel']);
		assert.deepEqual(notesIn('Library/Books'), ['Library/Books/Project Hail Mary 2.md', 'Library/Books/Project Hail Mary.md']);
		assert.equal(coversIn('Library/Covers').length, 1, 'the copy reuses the cover file');
		assert.equal(app.files.get('Library/Books/Project Hail Mary.md'), original, 'original untouched');

		userSearches('project hail mary');
		userPicks(0);
		userChooses('Open existing');
		await createBookNote(plugin());
		assert.equal(app.workspace.opened.at(-1), 'Library/Books/Project Hail Mary.md');

		userSearches('project hail mary');
		userPicks(0);
		userChooses('Cancel');
		await createBookNote(plugin());
		assert.equal(notesIn('Library/Books').length, 2, 'nothing new');
	});

	it('recognizes an existing note even with a straight instead of a curly apostrophe', async () => {
		app.vault.put("Library/Books/Dirk Gently's Holistic Detective Agency.md", '---\ntitle: Dirk Gently\'s Holistic Detective Agency\n---\n');
		userSearches('dirk gently holistic detective agency');
		userPicks(0);
		userChooses('Cancel');
		await createBookNote(plugin());
		assert.equal(ui.choices[0]?.title, 'This book already has a note');
		assert.match(ui.choices[0]?.message ?? '', /Dirk Gently's Holistic Detective Agency\.md/);
		assert.equal(notesIn('Library/Books').length, 1);
	});

	it('finds an existing note in a subfolder of Books, or with different capital letters', async () => {
		app.vault.put('Library/Books/Read in 2025/project hail mary.md', '---\ntitle: Project Hail Mary\n---\n');
		userSearches('project hail mary');
		userPicks(0);
		userChooses('Open existing');
		await createBookNote(plugin());
		assert.equal(ui.choices[0]?.title, 'This book already has a note');
		assert.deepEqual(app.workspace.opened, ['Library/Books/Read in 2025/project hail mary.md']);
		assert.deepEqual(notesIn('Library/Books'), ['Library/Books/Read in 2025/project hail mary.md']);
	});

	it('works in a nested library folder and uses the existing library note, whatever its capitals, without changing it', async () => {
		app.vault.put('Synced Notes/Library/LIbrary MOC.md', HAND_MADE_MOC);
		userSearches('dune');
		userPicks(0);
		await createBookNote(plugin(NESTED));
		const p = frontmatter(app, 'Synced Notes/Library/All Books/Dune.md');
		assert.deepEqual(p.link, ['[[LIbrary MOC]]']);
		assert.match(String(p.localCover), /^\[\[Synced Notes\/Library\/Covers\/Dune - .+\.jpg\]\]$/);
		assert.equal(app.vault.getFileByPath('Synced Notes/Library/Library MOC.md'), null, 'no second library note');
		assert.equal(app.files.get('Synced Notes/Library/LIbrary MOC.md'), HAND_MADE_MOC, 'existing library note unchanged');
	});

	it('creates the note without a cover when the book has none, or the download fails', async () => {
		fake('covers.openlibrary.org', { status: 404, text: '' });
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin());
		assert.equal(frontmatter(app, 'Library/Books/Project Hail Mary.md').localCover, null);
		assert.ok(notices.some((n) => /Open Library has no cover for "Project Hail Mary"/.test(n)));

		fake('covers.openlibrary.org', 'network-error');
		userSearches('project hail mary');
		userPicks(0);
		userChooses('Create copy');
		await createBookNote(plugin());
		assert.equal(frontmatter(app, 'Library/Books/Project Hail Mary 2.md').localCover, null);
		assert.ok(notices.some((n) => /Couldn't save the cover \(Could not reach Open Library/.test(n)));
		assert.equal(coversIn('Library/Covers').length, 0);
	});

	it('creates the note from the search data when the details can’t be fetched', async () => {
		fake('openlibrary.org/works/', json(503, {}));
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin());
		const p = frontmatter(app, 'Library/Books/Project Hail Mary.md');
		assert.equal(p.title, 'Project Hail Mary');
		assert.equal(p.description, null);
		assert.ok(notices.some((n) => /Couldn't get all the details from Open Library/.test(n)));
	});

	it('uses the template file, or the built-in template when it’s missing', async () => {
		app.vault.put('Templates/Book.md', '---\ntitle: {{title}}\nyear: {{year}}\n---\n# {{title}} by {{author}}\n');
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin({ templateFile: 'Templates/Book' }));
		assert.match(app.files.get('Library/Books/Project Hail Mary.md') as string, /^---\ntitle: Project Hail Mary\nyear: "\d{4}"\n---\n# Project Hail Mary by Andy Weir\n$/);

		app = makeApp();
		userSearches('project hail mary');
		userPicks(0);
		await createBookNote(plugin({ templateFile: 'Templates/Gone.md' }));
		assert.ok(notices.some((n) => /Template "Templates\/Gone\.md" was not found/.test(n)));
		assert.equal(frontmatter(app, 'Library/Books/Project Hail Mary.md').AudioBook, 'N/A');
	});

	it('shows search problems in the search window and creates nothing', async () => {
		setOnline(false);
		userSearches('a new search while offline');
		await createBookNote(plugin());
		setOnline(true);
		userSearches('qwxzzvbnmqqq');
		await createBookNote(plugin());
		assert.match(ui.searchErrors[0] ?? '', /You appear to be offline/);
		assert.match(ui.searchErrors[1] ?? '', /No books found for "qwxzzvbnmqqq"/);
		assert.deepEqual([...app.files.keys()], []);
	});
});
