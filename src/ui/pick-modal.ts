import { App, SuggestModal } from 'obsidian';

export interface PickOptions<T> {
	items: T[];
	placeholder: string;
	/** Shown when the filter matches nothing. */
	emptyText: string;
	/** Fill in one row of the list. */
	render(item: T, el: HTMLElement): void;
	/** Whether an item matches the filter text (trimmed, lowercased, never empty). */
	matches(item: T, query: string): boolean;
}

/**
 * Let the user pick one item from a list they can filter by typing.
 * Resolves with null if they cancel.
 */
export function pickItem<T>(app: App, options: PickOptions<T>): Promise<T | null> {
	return new Promise((resolve) => {
		new PickModal(app, options, resolve).open();
	});
}

class PickModal<T> extends SuggestModal<T> {
	private options: PickOptions<T>;
	private done: (item: T | null) => void;
	private chosen = false;

	constructor(app: App, options: PickOptions<T>, done: (item: T | null) => void) {
		super(app);
		this.options = options;
		this.done = done;
		this.limit = options.items.length;
		this.emptyStateText = options.emptyText;
		this.setPlaceholder(options.placeholder);
		this.setInstructions([
			{ command: '↑↓', purpose: 'to navigate' },
			{ command: '↵', purpose: 'to choose' },
			{ command: 'esc', purpose: 'to cancel' },
		]);
	}

	getSuggestions(query: string): T[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.options.items;
		return this.options.items.filter((item) => this.options.matches(item, q));
	}

	renderSuggestion(item: T, el: HTMLElement) {
		this.options.render(item, el);
	}

	onChooseSuggestion(item: T) {
		this.chosen = true;
		this.done(item);
	}

	onClose() {
		super.onClose();
		// Obsidian closes the modal before calling onChooseSuggestion, so wait a
		// tick before treating the close as a cancel.
		window.setTimeout(() => {
			if (!this.chosen) this.done(null);
		}, 0);
	}
}
