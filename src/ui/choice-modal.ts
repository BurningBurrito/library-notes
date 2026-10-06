import { App, ButtonComponent, Modal } from 'obsidian';

export interface Choice<T> {
	label: string;
	value: T;
	/** The main (highlighted) button. */
	cta?: boolean;
	/** A button that removes or replaces something. */
	destructive?: boolean;
}

/**
 * Ask the user to pick one of a few buttons, e.g. "Open existing" /
 * "Create copy". Resolves with null when they close the window instead.
 */
export function askChoice<T>(app: App, title: string, message: string, choices: Choice<T>[]): Promise<T | null> {
	return new Promise((resolve) => {
		new ChoiceModal(app, title, message, choices, resolve).open();
	});
}

class ChoiceModal<T> extends Modal {
	private result: T | null = null;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly choices: Choice<T>[],
		private readonly done: (result: T | null) => void,
	) {
		super(app);
	}

	onOpen() {
		this.setTitle(this.heading);
		for (const paragraph of this.message.split('\n\n')) this.contentEl.createEl('p', { text: paragraph });
		const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
		for (const choice of this.choices) {
			const button = new ButtonComponent(buttons).setButtonText(choice.label).onClick(() => {
				this.result = choice.value;
				this.close();
			});
			if (choice.destructive) button.setDestructive();
			if (choice.cta) button.setCta();
		}
		// Focus the main button so Enter picks it.
		const main = buttons.querySelector<HTMLButtonElement>('button.mod-cta');
		main?.focus();
	}

	onClose() {
		this.contentEl.empty();
		this.done(this.result);
	}
}
