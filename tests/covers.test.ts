import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { App } from 'obsidian';
import { downloadCover, imageExtension, saveCover } from '../src/core/covers';
import { fake, resetNetwork, setOnline } from './support/network';
import { makeApp } from './support/vault';

const bytes = (...start: number[]) => Uint8Array.from([...start, ...new Array<number>(2048).fill(7)]);
const base64 = (data: Uint8Array) => Buffer.from(data).toString('base64');
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
// Open Library's "no cover" placeholder: a 43-byte 1×1 GIF.
const BLANK_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const URL = 'https://covers.example/cover.jpg';

describe('cover images', () => {
	beforeEach(resetNetwork);

	it('recognizes images by their bytes, not their name', () => {
		assert.equal(imageExtension(JPEG.buffer), 'jpg');
		assert.equal(imageExtension(bytes(0x89, 0x50, 0x4e, 0x47).buffer), 'png');
		assert.equal(imageExtension(bytes(0x47, 0x49, 0x46, 0x38).buffer), 'gif');
		assert.equal(imageExtension(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50).buffer), 'webp');
		assert.equal(imageExtension(new TextEncoder().encode('<html>not found</html>').buffer), null);
	});

	it('downloads a real cover', async () => {
		fake(URL, { status: 200, base64: base64(JPEG), headers: { 'content-type': 'image/jpeg' } });
		const image = await downloadCover(URL, 'Open Library');
		assert.equal(image?.extension, 'jpg');
		assert.equal(image?.data.byteLength, JPEG.length);
	});

	it('treats missing covers and placeholders as "no cover"', async () => {
		fake(URL, { status: 404, text: '' });
		assert.equal(await downloadCover(URL, 'Open Library'), null);
		fake(URL, { status: 200, base64: BLANK_GIF, headers: { 'content-type': 'image/gif' } });
		assert.equal(await downloadCover(URL, 'Open Library'), null, '1×1 placeholder GIF');
		fake(URL, { status: 200, text: '<html>not an image</html>' });
		assert.equal(await downloadCover(URL, 'Open Library'), null, 'HTML page');
		fake(URL, { status: 403, text: '' });
		assert.equal(await downloadCover(URL, 'Open Library'), null, 'rate-limited ISBN cover');
	});

	it('reports a service that can’t be reached', async () => {
		fake(URL, { status: 503, text: '' });
		await assert.rejects(downloadCover(URL, 'Open Library'), /Open Library is having problems \(error 503\)/);
		fake(URL, 'network-error');
		await assert.rejects(downloadCover(URL, 'Open Library'), /Could not reach Open Library/);
		setOnline(false);
		await assert.rejects(downloadCover(URL, 'Open Library'), /You appear to be offline/);
	});

	it('saves the cover, creating the folder, and reuses an existing file instead of overwriting', async () => {
		const app = makeApp();
		const first = await saveCover(app as unknown as App, 'Synced Notes/Library/Covers', 'Dune - 9780441013593', { data: JPEG.buffer, extension: 'jpg' });
		assert.equal(first.path, 'Synced Notes/Library/Covers/Dune - 9780441013593.jpg');
		const other = new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer;
		const again = await saveCover(app as unknown as App, 'Synced Notes/Library/Covers', 'Dune - 9780441013593', { data: other, extension: 'jpg' });
		assert.equal(again, first);
		assert.equal((app.files.get(first.path) as ArrayBuffer).byteLength, JPEG.length, 'first image kept');
	});
});
