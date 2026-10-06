// Stand-in for the "obsidian" module, which only exists inside the app. It
// provides what the plugin's code uses; the vault lives in tests/support/vault.ts.
import { DOMParser as LinkeDOMParser } from 'linkedom';
import { handleRequest, RECORD } from './network';

// Browsers wrap an HTML fragment in <html><body>; linkedom doesn't, so do it
// here to parse descriptions the way Obsidian (Chromium) does.
class BrowserLikeDOMParser {
	parseFromString(html: string, type: string) {
		const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`;
		return new LinkeDOMParser().parseFromString(full, type as 'text/html');
	}
}

const g = globalThis as Record<string, unknown>;
g.DOMParser = BrowserLikeDOMParser;
// Replaying recordings, waits (such as the one-request-per-second spacing for
// Open Library) are cut to zero so the suite runs in about a second. Recording
// uses real time, to be polite to the services.
g.window = {
	setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, RECORD ? ms : 0),
	clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
};
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	contentType?: string;
	throw?: boolean;
}

export async function requestUrl(request: RequestUrlParam) {
	const headers = { ...request.headers, ...(request.contentType ? { 'content-type': request.contentType } : {}) };
	const response = await handleRequest({ url: request.url, method: request.method ?? 'GET', headers, body: request.body });
	const bytes = response.base64 !== undefined ? Buffer.from(response.base64, 'base64') : Buffer.from(response.text ?? '', 'utf8');
	return {
		status: response.status,
		headers: response.headers ?? {},
		text: response.text ?? '',
		arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		get json() {
			return JSON.parse(response.text ?? '') as unknown;
		},
	};
}
export type RequestUrlResponse = Awaited<ReturnType<typeof requestUrl>>;

export const notices: string[] = [];
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
	hide() {}
}

/** "Now" for {{date}} and {{time}}: shows the format asked for, so tests are stable. */
export const moment = () => ({ format: (format: string) => `<${format}>` });

export function normalizePath(path: string): string {
	const cleaned = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
	return cleaned === '' ? '/' : cleaned;
}

export class TAbstractFile {
	path = '';
	name = '';
	parent: TFolder | null = null;
}
export class TFile extends TAbstractFile {
	basename = '';
	extension = '';
	stat = { ctime: 0, mtime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot() {
		return this.path === '/';
	}
}

// Windows and settings classes are replaced by tests/support/ui.ts or not
// exercised; these only satisfy imports.
export class Modal {}
export class SuggestModal {}
export class ButtonComponent {}
export class TextComponent {}
export class Plugin {}
export class PluginSettingTab {}
export class SecretComponent {}
export class Menu {}
