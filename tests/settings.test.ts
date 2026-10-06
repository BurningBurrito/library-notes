import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/settings';

describe('settings', () => {
	it('starts with the agreed defaults', () => {
		assert.deepEqual(sanitizeSettings(null), {
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
		});
	});

	it('keeps saved values and repairs ones the settings page would reject', () => {
		const settings = sanitizeSettings({
			libraryFolder: 'Synced Notes/Library',
			booksFolder: 'All Books',
			coversFolder: '',
			libraryNoteName: 'Bad|Name',
			defaultSource: 'hardcover' as never,
			language: 'English',
			useFallback: false,
		});
		assert.equal(settings.libraryFolder, 'Synced Notes/Library');
		assert.equal(settings.booksFolder, 'All Books');
		assert.equal(settings.coversFolder, DEFAULT_SETTINGS.coversFolder);
		assert.equal(settings.libraryNoteName, DEFAULT_SETTINGS.libraryNoteName);
		assert.equal(settings.defaultSource, 'open-library');
		assert.equal(settings.language, 'en');
		assert.equal(settings.useFallback, false);
	});

	it('allows no language preference', () => {
		assert.equal(sanitizeSettings({ language: '' }).language, '');
	});
});
