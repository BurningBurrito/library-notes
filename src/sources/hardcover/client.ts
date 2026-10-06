import { BookError } from '../../core/errors';
import { getHeader, httpRequest, parseJson } from '../../core/http';
import type { ThrottleRule } from '../../core/throttle';
import { asRecord, asString } from '../../core/utils';
import type LibraryNotesPlugin from '../../main';
import { accessToken, forgetTokens } from './auth';

const GRAPHQL_ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const NAME = 'Hardcover';
// Hardcover allows 60 requests a minute per user, in bursts of up to 10.
export const HARDCOVER_THROTTLE: ThrottleRule = { key: 'hardcover', intervalMs: 500 };

/**
 * Run a GraphQL query as the signed-in user. Hardcover's API is in beta, so
 * every answer is checked before use, and errors become plain messages.
 */
export async function graphql(
	plugin: LibraryNotesPlugin,
	query: string,
	variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	let token = await accessToken(plugin);
	let response = await send(token, query, variables);
	if (response.status === 401) {
		// The access token may have been revoked or reset early: renew once and retry.
		token = await accessToken(plugin, true);
		response = await send(token, query, variables);
		if (response.status === 401) {
			forgetTokens(plugin);
			throw new BookError('auth', 'Hardcover no longer accepts this sign-in. Sign in again in the Library Notes settings.');
		}
	}
	const body = asRecord(parseJson(response, NAME));

	if (response.status === 403) {
		const error = asString(body.error);
		if (error === 'insufficient_scope') {
			throw new BookError('auth', 'Hardcover says this sign-in isn’t allowed to search. Sign out and sign in again.');
		}
		throw new BookError('auth', `Hardcover refused the request${error ? ` (${error})` : ''}.`);
	}
	if (response.status === 408) throw new BookError('timeout', 'Hardcover took too long to answer. Try again, or try fewer words.');
	if (response.status === 429) {
		const reset = Number(getHeader(response, 'ratelimit-reset') ?? getHeader(response, 'retry-after'));
		const wait = reset > 60 ? `in ${Math.ceil(reset / 60)} minutes` : 'in a minute';
		throw new BookError('rate-limited', `You've reached Hardcover's request limit. Try again ${wait}.`);
	}
	if (response.status !== 200) throw changed();

	// GraphQL reports problems inside a 200 answer.
	if (Array.isArray(body.errors) && body.errors.length) {
		const message = asString(asRecord(body.errors[0]).message);
		console.error('Library Notes: Hardcover GraphQL errors', body.errors);
		throw new BookError('bad-response', `Hardcover couldn't run the search${message ? ` (${message})` : ''}. Its API may have changed.`);
	}
	return asRecord(body.data);
}

function send(token: string, query: string, variables: Record<string, unknown>) {
	return httpRequest(GRAPHQL_ENDPOINT, {
		sourceName: NAME,
		method: 'POST',
		headers: { authorization: `Bearer ${token}` },
		contentType: 'application/json',
		body: JSON.stringify({ query, variables }),
		throttle: HARDCOVER_THROTTLE,
		handleRateLimit: true,
	});
}

export function changed(): BookError {
	return new BookError('bad-response', 'Hardcover sent an answer Library Notes couldn’t read. Its API may have changed.');
}
