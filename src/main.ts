import { Plugin } from 'obsidian';
import { registerDevChecks } from './dev/checks';

export default class LibraryNotesPlugin extends Plugin {
	onload() {
		// Developer checks exist only in `npm run dev` builds; release builds drop this code.
		if (DEV_BUILD) registerDevChecks(this);
	}
}
