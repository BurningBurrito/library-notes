import { ButtonComponent, Modal, Notice } from 'obsidian';
import { toBookError } from '../core/errors';
import type LibraryNotesPlugin from '../main';
import { DeviceCode, finishSignIn, startSignIn } from '../sources/hardcover/auth';

/**
 * Sign in with Hardcover: show a code, the user approves it at
 * hardcover.app/link, and this window closes on its own. Resolves true when
 * signed in.
 */
export function signInWithHardcover(plugin: LibraryNotesPlugin): Promise<boolean> {
	return new Promise((resolve) => new HardcoverSignInModal(plugin, resolve).open());
}

class HardcoverSignInModal extends Modal {
	private closed = false;
	private signedIn = false;
	private statusEl!: HTMLElement;

	constructor(
		private readonly plugin: LibraryNotesPlugin,
		private readonly done: (signedIn: boolean) => void,
	) {
		super(plugin.app);
	}

	onOpen() {
		this.setTitle('Hardcover sign-in');
		this.statusEl = this.contentEl.createDiv({ cls: 'library-notes-message', text: 'Asking Hardcover for a sign-in code…' });
		void this.run();
	}

	onClose() {
		this.closed = true;
		this.contentEl.empty();
		this.done(this.signedIn);
	}

	private async run() {
		let code: DeviceCode;
		try {
			code = await startSignIn();
		} catch (err) {
			this.showError(toBookError(err).message);
			return;
		}
		if (this.closed) return;
		this.showCode(code);
		try {
			const ok = await finishSignIn(this.plugin, code, () => this.closed);
			if (!ok || this.closed) return;
			this.signedIn = true;
			new Notice('Hardcover: signed in.');
			this.close();
		} catch (err) {
			if (!this.closed) this.showError(toBookError(err).message);
		}
	}

	private showCode(code: DeviceCode) {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: `1. Open ${code.verificationUri.replace(/^https?:\/\//, '')} in your browser and sign in to Hardcover.` });
		contentEl.createEl('p', { text: '2. Enter this code, then approve the request:' });
		contentEl.createDiv({ cls: 'library-notes-sign-in-code', text: code.userCode });
		contentEl.createEl('p', {
			cls: 'library-notes-message',
			text: 'Only searching the book catalog is requested. Your account can’t be seen or changed.',
		});
		this.statusEl = contentEl.createDiv({ cls: 'library-notes-message', text: 'Waiting for you to approve…' });

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		new ButtonComponent(buttons)
			.setButtonText('Open hardcover.app/link')
			.setCta()
			.onClick(() => window.open(code.verificationUriComplete || code.verificationUri));
		new ButtonComponent(buttons).setButtonText('Copy code').onClick(() => {
			void navigator.clipboard.writeText(code.userCode).then(() => new Notice('Code copied.'));
		});
		new ButtonComponent(buttons).setButtonText('Cancel').onClick(() => this.close());
	}

	private showError(message: string) {
		this.statusEl.setText(message);
		this.statusEl.addClass('is-error');
	}
}
