// Spaces out requests to one service, e.g. Open Library asks apps for at most
// one request per second. Callers wait their turn in order.

const lastStart = new Map<string, number>();
const queues = new Map<string, Promise<void>>();

export interface ThrottleRule {
	/** Requests with the same key share one queue. */
	key: string;
	intervalMs: number;
}

/** Resolves when a request for `rule.key` may start. */
export function throttle(rule: ThrottleRule): Promise<void> {
	const previous = queues.get(rule.key) ?? Promise.resolve();
	const turn = previous.then(async () => {
		const wait = (lastStart.get(rule.key) ?? 0) + rule.intervalMs - Date.now();
		if (wait > 0) await delay(wait);
		lastStart.set(rule.key, Date.now());
	});
	queues.set(rule.key, turn);
	return turn;
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}
