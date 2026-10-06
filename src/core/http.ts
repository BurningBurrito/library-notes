import { requestUrl, RequestUrlResponse } from 'obsidian';
import { BookError } from './errors';
import { throttle, ThrottleRule } from './throttle';

const TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 50;

/** Identifies the plugin to every service it calls. Set once in onload. */
let userAgent = 'LibraryNotes';

export function setUserAgent(value: string): void {
	userAgent = value;
}

export interface RequestOptions {
	/** Service name for error messages, e.g. "Open Library". */
	sourceName: string;
	method?: 'GET' | 'POST';
	headers?: Record<string, string>;
	body?: string;
	contentType?: string;
	throttle?: ThrottleRule;
}

/**
 * Make a request with Obsidian's requestUrl (which, unlike fetch, isn't
 * blocked by CORS and works on mobile). Network trouble, timeouts, rate
 * limits and server errors become BookErrors; other statuses (including 4xx)
 * are returned for the caller to interpret.
 */
export async function httpRequest(url: string, options: RequestOptions): Promise<RequestUrlResponse> {
	const { sourceName } = options;
	if (!navigator.onLine) {
		throw new BookError('offline', 'You appear to be offline. Check your internet connection and try again.');
	}
	if (options.throttle) await throttle(options.throttle);

	let response: RequestUrlResponse;
	try {
		response = await withTimeout(
			requestUrl({
				url,
				method: options.method ?? 'GET',
				headers: { 'User-Agent': userAgent, ...options.headers },
				body: options.body,
				contentType: options.contentType,
				throw: false,
			}),
			sourceName,
		);
	} catch (err) {
		if (err instanceof BookError) throw err;
		console.error(`Library Notes: request to ${sourceName} failed`, err);
		throw new BookError('network', `Could not reach ${sourceName}. Check your internet connection and try again.`);
	}

	if (response.status === 429) {
		const minutes = Math.ceil(Number(getHeader(response, 'retry-after')) / 60);
		const wait = minutes > 1 ? `in ${minutes} minutes` : minutes === 1 ? 'in a minute' : 'in a few minutes';
		throw new BookError('rate-limited', `${sourceName} has received too many requests. Try again ${wait}.`);
	}
	if (response.status >= 500) {
		throw new BookError('server', `${sourceName} is having problems (error ${response.status}). Try again later.`);
	}
	return response;
}

const cache = new Map<string, { at: number; value: unknown }>();

/**
 * GET a URL and parse its JSON. Successful answers are kept for 30 minutes,
 * so repeating a search doesn't ask the service again.
 */
export async function getJson(url: string, options: RequestOptions & { cache?: boolean }): Promise<unknown> {
	const cached = options.cache ? cache.get(url) : undefined;
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

	const response = await httpRequest(url, options);
	if (response.status === 404) throw new BookError('not-found', `${options.sourceName} has no entry for this book.`);
	if (response.status !== 200) throw badResponse(options.sourceName);
	const value = parseJson(response, options.sourceName);
	if (options.cache) {
		cache.set(url, { at: Date.now(), value });
		if (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value ?? '');
	}
	return value;
}

/** Parse a JSON body, turning invalid JSON into a BookError. */
export function parseJson(response: RequestUrlResponse, sourceName: string): unknown {
	try {
		return JSON.parse(response.text) as unknown;
	} catch {
		throw badResponse(sourceName);
	}
}

export function badResponse(sourceName: string): BookError {
	return new BookError('bad-response', `${sourceName} sent a response Library Notes couldn't read. Try again later.`);
}

export function getHeader(response: RequestUrlResponse, name: string): string | undefined {
	const key = Object.keys(response.headers).find((k) => k.toLowerCase() === name);
	return key === undefined ? undefined : response.headers[key];
}

function withTimeout<T>(promise: Promise<T>, sourceName: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = window.setTimeout(() => {
			reject(new BookError('timeout', `${sourceName} took too long to respond. Try again later.`));
		}, TIMEOUT_MS);
		promise.then(
			(value) => {
				window.clearTimeout(timer);
				resolve(value);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			},
		);
	});
}
