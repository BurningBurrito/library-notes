import { BookError } from '../../core/errors';
import { httpRequest, parseJson } from '../../core/http';
import { delay } from '../../core/throttle';
import { asRecord, asString } from '../../core/utils';
import type LibraryNotesPlugin from '../../main';

// "Sign in with Hardcover": OAuth Device Authorization Grant (RFC 8628), as
// Hardcover recommends for apps on the user's own device.
// https://docs.hardcover.app/api/oauth/getting-started-device/
//
// The plugin asks only for `read:catalog:search`: searching Hardcover's public
// catalog. It can't read or change anything in the user's account.

/** Public ID of the "Library Notes" app registered at Hardcover (not a secret). Empty: sign-in unavailable. */
export const HARDCOVER_CLIENT_ID = '';
export const SCOPE = 'read:catalog:search';
const DEVICE_ENDPOINT = 'https://api.hardcover.app/oauth2/device';
const TOKEN_ENDPOINT = 'https://api.hardcover.app/oauth2/token';
const REVOKE_ENDPOINT = 'https://api.hardcover.app/oauth2/revoke';
const NAME = 'Hardcover';

/** One keychain entry holds the tokens. Obsidian's keychain stays on this device (it isn't synced with the vault). */
const SECRET_ID = 'library-notes-hardcover';
/** Renew this long before the access token expires. */
const RENEW_EARLY_MS = 5 * 60_000;

interface Tokens {
	accessToken: string;
	/** Hardcover replaces it on every renewal; a spent one must never be used again. */
	refreshToken: string;
	/** Milliseconds since 1970. */
	expiresAt: number;
}

export function isSignInAvailable(): boolean {
	return HARDCOVER_CLIENT_ID !== '';
}

export function isSignedIn(plugin: LibraryNotesPlugin): boolean {
	return readTokens(plugin) !== null;
}

function readTokens(plugin: LibraryNotesPlugin): Tokens | null {
	const raw = plugin.getSecret(SECRET_ID);
	if (!raw) return null;
	try {
		const data = asRecord(JSON.parse(raw));
		const tokens = {
			accessToken: asString(data.accessToken),
			refreshToken: asString(data.refreshToken),
			expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
		};
		return tokens.accessToken && tokens.refreshToken ? tokens : null;
	} catch {
		return null;
	}
}

function saveTokens(plugin: LibraryNotesPlugin, tokens: Tokens | null): void {
	// The keychain has no "delete"; an empty value means signed out.
	plugin.app.secretStorage.setSecret(SECRET_ID, tokens ? JSON.stringify(tokens) : '');
}

/** What Hardcover sends back when sign-in starts. */
export interface DeviceCode {
	deviceCode: string;
	/** The code to type at hardcover.app/link, e.g. "ABCD-1234". */
	userCode: string;
	verificationUri: string;
	/** Opens the link page with the code already filled in. */
	verificationUriComplete: string;
	expiresInSeconds: number;
	intervalSeconds: number;
}

export async function startSignIn(): Promise<DeviceCode> {
	const data = await postForm(DEVICE_ENDPOINT, { client_id: HARDCOVER_CLIENT_ID, scope: SCOPE });
	const code: DeviceCode = {
		deviceCode: asString(data.device_code),
		userCode: asString(data.user_code),
		verificationUri: asString(data.verification_uri) || 'https://hardcover.app/link',
		verificationUriComplete: asString(data.verification_uri_complete) || asString(data.verification_uri),
		expiresInSeconds: typeof data.expires_in === 'number' ? data.expires_in : 900,
		intervalSeconds: typeof data.interval === 'number' ? data.interval : 5,
	};
	if (!code.deviceCode || !code.userCode) throw unreadable();
	return code;
}

/**
 * Wait until the user approves at hardcover.app/link, then save the tokens.
 * Resolves false if cancelled; throws a BookError if denied or expired.
 */
export async function finishSignIn(
	plugin: LibraryNotesPlugin,
	code: DeviceCode,
	isCancelled: () => boolean,
): Promise<boolean> {
	const deadline = Date.now() + code.expiresInSeconds * 1000;
	let interval = code.intervalSeconds;
	while (Date.now() < deadline) {
		await delay(interval * 1000);
		if (isCancelled()) return false;
		const response = await httpRequest(TOKEN_ENDPOINT, formRequest({
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
			device_code: code.deviceCode,
			client_id: HARDCOVER_CLIENT_ID,
		}));
		const data = asRecord(parseJson(response, NAME));
		if (response.status === 200) {
			saveTokens(plugin, toTokens(data));
			return true;
		}
		const error = asString(data.error);
		if (error === 'authorization_pending') continue;
		if (error === 'slow_down') {
			interval += 5;
			continue;
		}
		if (error === 'access_denied') throw new BookError('auth', 'Sign-in was declined at Hardcover.');
		if (error === 'expired_token') break;
		throw new BookError('auth', `Hardcover sign-in failed (${error || `error ${response.status}`}). Try again.`);
	}
	throw new BookError('auth', 'The sign-in code expired before it was approved. Start again.');
}

let renewal: Promise<string> | null = null;

/**
 * A valid access token, renewed first if it's about to expire. Only one
 * renewal runs at a time, since each renewal token works only once.
 */
export async function accessToken(plugin: LibraryNotesPlugin, forceRenew = false): Promise<string> {
	const tokens = readTokens(plugin);
	if (!tokens) throw signInAgain('Sign in to Hardcover in the Library Notes settings to search it.');
	if (!forceRenew && tokens.expiresAt - Date.now() > RENEW_EARLY_MS) return tokens.accessToken;
	renewal ??= renew(plugin, tokens).finally(() => (renewal = null));
	return renewal;
}

async function renew(plugin: LibraryNotesPlugin, tokens: Tokens): Promise<string> {
	// Not retried on network errors: if the request reached Hardcover, the old
	// renewal token is already spent, and using it again ends the sign-in.
	const response = await httpRequest(TOKEN_ENDPOINT, formRequest({
		grant_type: 'refresh_token',
		refresh_token: tokens.refreshToken,
		client_id: HARDCOVER_CLIENT_ID,
	}));
	const data = asRecord(parseJson(response, NAME));
	if (response.status === 200) {
		const fresh = toTokens(data);
		saveTokens(plugin, fresh);
		return fresh.accessToken;
	}
	if (response.status === 400 || response.status === 401) {
		// Expired (6 months unused), revoked, or reset by Hardcover.
		saveTokens(plugin, null);
		throw signInAgain('Your Hardcover sign-in has expired. Sign in again in the Library Notes settings.');
	}
	throw unreadable();
}

/** Sign out: revoke at Hardcover (best effort), then forget the tokens on this device. */
export async function signOut(plugin: LibraryNotesPlugin): Promise<void> {
	const tokens = readTokens(plugin);
	saveTokens(plugin, null);
	if (!tokens) return;
	try {
		await httpRequest(REVOKE_ENDPOINT, formRequest({
			token: tokens.refreshToken,
			token_type_hint: 'refresh_token',
			client_id: HARDCOVER_CLIENT_ID,
		}));
	} catch {
		// Already signed out locally; an unreachable server doesn't change that.
	}
}

/** Forget the tokens after Hardcover rejects them for good. */
export function forgetTokens(plugin: LibraryNotesPlugin): void {
	saveTokens(plugin, null);
}

function toTokens(data: Record<string, unknown>): Tokens {
	const accessToken = asString(data.access_token);
	const refreshToken = asString(data.refresh_token);
	if (!accessToken || !refreshToken) throw unreadable();
	const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
	return { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
}

async function postForm(url: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
	const response = await httpRequest(url, formRequest(fields));
	const data = asRecord(parseJson(response, NAME));
	if (response.status !== 200) {
		const reason = asString(data.error_description) || asString(data.error) || `error ${response.status}`;
		throw new BookError('auth', `Hardcover sign-in couldn't start (${reason}).`);
	}
	return data;
}

function formRequest(fields: Record<string, string>) {
	return {
		sourceName: NAME,
		method: 'POST' as const,
		body: new URLSearchParams(fields).toString(),
		contentType: 'application/x-www-form-urlencoded',
	};
}

function signInAgain(message: string): BookError {
	return new BookError('auth', message);
}

function unreadable(): BookError {
	return new BookError('bad-response', 'Hardcover sent an answer Library Notes couldn’t read. Its API may have changed.');
}
