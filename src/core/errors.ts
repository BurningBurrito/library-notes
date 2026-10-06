export type BookErrorKind =
	| 'offline'
	| 'network'
	| 'timeout'
	| 'not-found'
	| 'rate-limited'
	| 'server'
	| 'bad-response'
	| 'config'
	| 'auth';

/**
 * A failed search or lookup. `message` is written for the user and is shown
 * as-is in the search window or a notice.
 */
export class BookError extends Error {
	kind: BookErrorKind;

	constructor(kind: BookErrorKind, message: string) {
		super(message);
		this.name = 'BookError';
		this.kind = kind;
	}
}

export function toBookError(err: unknown): BookError {
	if (err instanceof BookError) return err;
	console.error('Library Notes: unexpected error', err);
	return new BookError('bad-response', 'Something went wrong. See the developer console for details.');
}
