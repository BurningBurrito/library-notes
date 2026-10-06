import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { TFile } from 'obsidian';
import {
	applyRegeneration,
	ensureLibraryNote,
	generatedBlock,
	newLibraryNote,
	planRegeneration,
	regenerateLibraryNote,
	tableQuery,
} from '../src/library/moc';
import { isBookNote, toggleRead } from '../src/library/read-status';
import { DEFAULT_SETTINGS } from '../src/settings';
import { notices } from './support/obsidian';
import { resetUi, ui, userChooses } from './support/ui';
import { frontmatter, makeApp, makePlugin } from './support/vault';

// A library note made by hand, like the one in the design notes: a banner, tags,
// and one Dataview table that Library Notes didn't create.
const HAND_MADE = `---
tags:
  - 📚Book
banner: "![[LibraryBanner.jpg]]"
---

\`\`\`dataview
table title as title, author as author, localCover as cover
FROM "Synced Notes/Library/All Books"
\`\`\`
`;

const nested = { libraryFolder: 'Synced Notes/Library', booksFolder: 'All Books', libraryNoteName: 'LIbrary MOC' };

describe('library table', () => {
	it('reads the books folder from the settings, quoted safely', () => {
		assert.match(tableQuery('Synced Notes/Library/All Books'), /^FROM "Synced Notes\/Library\/All Books"$/m);
		assert.match(tableQuery('Odd "quotes"\\folder'), /^FROM "Odd \\"quotes\\"\\\\folder"$/m);
	});

	it('has the agreed columns, with the cover column that accepts every cover form', () => {
		const query = tableQuery('Library/Books');
		for (const column of ['AS Cover', 'AS Title', 'AS Author', 'AS Category', 'file.link AS Note', 'choice(read, "🟩", "🟥") AS Read', 'AudioBook AS AudioBook', 'EBook AS EBook']) {
			assert.ok(query.includes(column), column);
		}
		assert.ok(query.includes(String.raw`regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", "")`));
	});

	it('creates a full-width note with the table between markers', () => {
		const note = newLibraryNote('Library/Books');
		assert.match(note, /^---\ncssclasses:\n {2}- library-notes-moc\n---\n/);
		assert.equal(planRegeneration(note).kind, 'markers');
	});
});

describe('regenerating', () => {
	it('replaces only the marked part', () => {
		const note = `# My library\n\nIntro text.\n\n${generatedBlock('Old/Books')}\n\nNotes below.\n`;
		const updated = applyRegeneration(note, planRegeneration(note), generatedBlock('New/Books'), false);
		assert.match(updated, /FROM "New\/Books"/);
		assert.doesNotMatch(updated, /Old\/Books/);
		assert.match(updated, /^Intro text\.$/m);
		assert.match(updated, /^Notes below\.$/m);
	});

	it('finds a single hand-made table, and can replace it or add below it', () => {
		const plan = planRegeneration(HAND_MADE);
		assert.equal(plan.kind, 'single-table');
		const replaced = applyRegeneration(HAND_MADE, plan, generatedBlock('Synced Notes/Library/All Books'), true);
		assert.doesNotMatch(replaced, /localCover as cover/);
		assert.match(replaced, /banner: "!\[\[LibraryBanner\.jpg\]\]"/);
		assert.equal(planRegeneration(replaced).kind, 'markers', 'later runs find the markers');
		const added = applyRegeneration(HAND_MADE, plan, generatedBlock('X'), false);
		assert.match(added, /localCover as cover/);
		assert.match(added, /library-notes:start/);
	});

	it('adds at the end when there are several tables or only dataviewjs', () => {
		assert.equal(planRegeneration(`${HAND_MADE}\n\`\`\`dataview\nlist\n\`\`\`\n`).kind, 'append');
		assert.equal(planRegeneration('```dataviewjs\ndv.list([])\n```\n').kind, 'append');
		assert.equal(planRegeneration('%% library-notes:start (half a marker) %%\n').kind, 'append');
	});
});

describe('library note in the vault', () => {
	beforeEach(() => {
		resetUi();
		notices.length = 0;
	});

	it('is created once, and an existing one is never changed', async () => {
		const app = makeApp();
		const plugin = makePlugin(app);
		await ensureLibraryNote(plugin);
		assert.match(app.files.get('Library/Library MOC.md') as string, /FROM "Library\/Books"/);
		app.files.set('Library/Library MOC.md', 'My own text');
		await ensureLibraryNote(plugin);
		assert.equal(app.files.get('Library/Library MOC.md'), 'My own text');
	});

	it('uses a note whose name differs only in capital letters, instead of creating a second one', async () => {
		const app = makeApp();
		app.vault.put('Synced Notes/Library/LIbrary MOC.md', HAND_MADE);
		const plugin = makePlugin(app, { ...nested, libraryNoteName: 'Library MOC' });
		const file = await ensureLibraryNote(plugin);
		assert.equal(file.path, 'Synced Notes/Library/LIbrary MOC.md');
		assert.equal(app.vault.getFileByPath('Synced Notes/Library/Library MOC.md'), null);
		assert.ok(notices.some((n) => n.includes('differs from the setting "Library MOC" only in capital letters')));
	});

	it('regenerates a hand-made note after asking: replace the table, keep the rest, make it full width', async () => {
		const app = makeApp();
		app.vault.put('Synced Notes/Library/LIbrary MOC.md', HAND_MADE);
		const plugin = makePlugin(app, nested);
		userChooses('Replace that table');
		await regenerateLibraryNote(plugin);
		assert.deepEqual(ui.choices[0]?.labels, ['Replace that table', 'Add at the end', 'Cancel']);
		const text = app.files.get('Synced Notes/Library/LIbrary MOC.md') as string;
		assert.doesNotMatch(text, /localCover as cover/);
		assert.match(text, /FROM "Synced Notes\/Library\/All Books"/);
		const props = frontmatter(app, 'Synced Notes/Library/LIbrary MOC.md');
		assert.deepEqual(props.cssclasses, ['library-notes-moc']);
		assert.equal(props.banner, '![[LibraryBanner.jpg]]');
		assert.deepEqual(props.tags, ['📚Book']);

		// Again: now it has markers, so it's a plain "Regenerate"; Cancel changes nothing.
		userChooses(null);
		await regenerateLibraryNote(plugin);
		assert.deepEqual(ui.choices[1]?.labels, ['Regenerate', 'Cancel']);
		assert.equal(app.files.get('Synced Notes/Library/LIbrary MOC.md'), text, 'Cancel changed nothing');
	});

	it('keeps existing cssclasses when adding the full-width class', async () => {
		const app = makeApp();
		app.vault.put('Library/Library MOC.md', '---\ncssclasses: wide\n---\nNo table yet.\n');
		userChooses('Add the table');
		await regenerateLibraryNote(makePlugin(app));
		assert.deepEqual(frontmatter(app, 'Library/Library MOC.md').cssclasses, ['wide', 'library-notes-moc']);
		assert.match(app.files.get('Library/Library MOC.md') as string, /No table yet\.\n\n%% library-notes:start/);
	});

	it('says when Dataview is missing or turned off', async () => {
		for (const [installed, enabled, expected] of [
			[false, false, /needs the Dataview plugin\. Install it/],
			[true, false, /installed but turned off/],
		] as const) {
			const app = makeApp();
			app.plugins.enabledPlugins = new Set(enabled ? ['dataview'] : []);
			app.plugins.manifests = installed ? { dataview: {} } : {};
			notices.length = 0;
			await ensureLibraryNote(makePlugin(app));
			assert.ok(notices.some((n) => expected.test(n)), String(expected));
		}
		const app = makeApp();
		notices.length = 0;
		await ensureLibraryNote(makePlugin(app));
		assert.ok(!notices.some((n) => /Dataview/.test(n)), 'no warning when Dataview is enabled');
	});
});

describe('read status', () => {
	it('works on notes in the books folder (and its subfolders) only', () => {
		const app = makeApp();
		const settings = { ...DEFAULT_SETTINGS };
		const inBooks = app.vault.put('Library/Books/Dune.md', '');
		const inSub = app.vault.put('Library/Books/Sci-fi/Dune Messiah.md', '');
		const outside = app.vault.put('Library/Library MOC.md', '');
		const image = app.vault.put('Library/Books/cover.jpg', new ArrayBuffer(1));
		assert.ok(isBookNote(inBooks as unknown as TFile, settings));
		assert.ok(isBookNote(inSub as unknown as TFile, settings));
		assert.ok(!isBookNote(outside as unknown as TFile, settings));
		assert.ok(!isBookNote(image as unknown as TFile, settings));
		assert.ok(!isBookNote(null, settings));
	});

	it('flips read (missing counts as unread) and leaves other properties alone', async () => {
		const app = makeApp();
		const file = app.vault.put('Library/Books/Seveneves.md', '---\ntitle: Seveneves\nStatus: Completed\nAudioBook: 🟩\n---\nMy notes.\n') as unknown as TFile;
		assert.equal(await toggleRead(app as never, file), true);
		assert.equal(frontmatter(app, file.path).read, true);
		assert.equal(await toggleRead(app as never, file), false);
		const props = frontmatter(app, file.path);
		assert.deepEqual(props, { title: 'Seveneves', Status: 'Completed', AudioBook: '🟩', read: false });
		assert.match(app.files.get(file.path) as string, /My notes\.\n$/);
	});
});
