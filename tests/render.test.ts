import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parse } from 'yaml';
import { buildVariables, DEFAULT_TEMPLATE } from '../src/books/template';
import { renderTemplate } from '../src/core/render';
import { sampleBook } from './support/books';

const now = { format: (format: string) => ({ 'YYYY-MM-DD': '2026-10-06', 'YYYY-MM-DD HH:mm:ss': '2026-10-06 12:00:00', HH: '12' })[format] ?? `<${format}>` };
const props = (note: string) => parse(note.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '') as Record<string, unknown>;

describe('renderTemplate', () => {
	it('keeps the properties valid YAML whatever the text contains', () => {
		const note = renderTemplate('---\ntitle: {{title}}\ndescription: {{description}}\nsubtitle: {{subtitle}}\n---\n', {
			title: 'Yes',
			description: 'He said: "spice" must flow… # not a comment',
			subtitle: "'Quoted' start",
		}, now);
		assert.deepEqual(props(note), { title: 'Yes', description: 'He said: "spice" must flow… # not a comment', subtitle: "'Quoted' start" });
	});

	it('writes lists as list properties, numbers as numbers, and ISBNs as text', () => {
		const note = renderTemplate('---\nauthor: {{author}}\npageCount: {{pageCount}}\nisbn: {{isbn}}\n---\n', {
			author: ['Neil Gaiman', 'Terry Pratchett'],
			pageCount: 412,
			isbn: '0345445600',
		}, now);
		assert.deepEqual(props(note), { author: ['Neil Gaiman', 'Terry Pratchett'], pageCount: 412, isbn: '0345445600' });
	});

	it('leaves empty values empty and unknown variables untouched', () => {
		const note = renderTemplate('---\nsubtitle: {{subtitle}}\ntags: {{unknown}}\n---\n{{other}} and <% tp.file.title %>\n', { subtitle: '' }, now);
		assert.match(note, /^subtitle:$/m);
		assert.match(note, /^tags: \{\{unknown\}\}$/m);
		assert.match(note, /\{\{other\}\} and <% tp\.file\.title %>/);
	});

	it('formats dates and shows lists as text in the note body', () => {
		const note = renderTemplate('{{date}} {{date:YYYY-MM-DD HH:mm:ss}} {{time:HH}} — by {{author}}', { author: ['A', 'B'] }, now);
		assert.equal(note, '2026-10-06 2026-10-06 12:00:00 12 — by A, B');
	});
});

describe('built-in template', () => {
	it('creates the agreed properties, with the cover as a link and a link back to the library note', () => {
		const vars = buildVariables(sampleBook(), { coverPath: 'Library/Covers/Project Hail Mary - 9780593135204.jpg', libraryNoteName: 'Library MOC' });
		const p = props(renderTemplate(DEFAULT_TEMPLATE, vars, now));
		assert.deepEqual(Object.keys(p), [
			'tags', 'title', 'subtitle', 'author', 'category', 'publisher', 'publishDate', 'pageCount', 'isbn', 'description',
			'cover', 'localCover', 'read', 'rating', 'AudioBook', 'EBook', 'source', 'sourceUrl', 'created', 'link',
		]);
		assert.deepEqual(p.tags, ['📚Book']);
		assert.equal(p.title, 'Project Hail Mary');
		assert.deepEqual(p.author, ['Andy Weir']);
		assert.deepEqual(p.category, ['Science fiction']);
		assert.equal(p.publishDate, '2021-05-04');
		assert.equal(p.pageCount, 496);
		assert.equal(p.isbn, '9780593135204');
		assert.equal(p.localCover, '[[Library/Covers/Project Hail Mary - 9780593135204.jpg]]');
		assert.equal(p.read, false);
		assert.equal(p.AudioBook, 'N/A');
		assert.equal(p.EBook, 'N/A');
		assert.equal(p.sourceUrl, 'https://openlibrary.org/works/OL21745884W');
		assert.equal(p.created, '2026-10-06 12:00:00');
		assert.deepEqual(p.link, ['[[Library MOC]]']);
	});

	it('leaves the cover empty when there is none, and falls back to ISBN-10', () => {
		const vars = buildVariables(sampleBook({ isbn13: '', pageCount: null }), { coverPath: null, libraryNoteName: 'LIbrary MOC' });
		const p = props(renderTemplate(DEFAULT_TEMPLATE, vars, now));
		assert.equal(p.localCover, null);
		assert.equal(p.pageCount, null);
		assert.equal(p.isbn, '0593135202');
		assert.deepEqual(p.link, ['[[LIbrary MOC]]']);
	});

	it('supports the Book Search variable names', () => {
		const vars = buildVariables(sampleBook(), { coverPath: 'Covers/x.jpg', libraryNoteName: 'Library MOC' });
		const note = renderTemplate('{{authors}} | {{categories}} | {{totalPage}} | {{localCoverImage}} | {{year}}', vars, now);
		assert.equal(note, 'Andy Weir | Science fiction | 496 | Covers/x.jpg | 2021');
	});
});
