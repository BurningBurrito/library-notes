// Fake network for tests. Normally every request is answered from responses
// recorded from the real services (tests/fixtures/http/<suite>.json.gz), so
// tests never go online. `npm run test:record` makes the real requests and
// saves new recordings. Tests can also inject answers with `fake()`.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export interface FakeResponse {
	status: number;
	headers?: Record<string, string>;
	/** Text body (JSON answers). */
	text?: string;
	/** Binary body as base64 (images). */
	base64?: string;
}

export interface Request {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: string;
}

type Fake = FakeResponse | 'network-error' | 'hang' | ((request: Request) => FakeResponse | 'network-error' | 'hang');

export const RECORD = process.env.LN_RECORD === '1';
const suite = basename(process.argv[1] ?? 'unknown').replace(/\.test\.cjs$/, '');
const file = join(process.cwd(), 'tests', 'fixtures', 'http', `${suite}.json.gz`);

interface Recording {
	recorded: string;
	responses: Record<string, FakeResponse>;
}
const recording: Recording = existsSync(file)
	? (JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as Recording)
	: { recorded: '', responses: {} };
if (RECORD) {
	recording.recorded = new Date().toISOString();
	recording.responses = {};
	process.on('exit', () => {
		if (Object.keys(recording.responses).length === 0) {
			rmSync(file, { force: true });
			return;
		}
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, gzipSync(JSON.stringify(recording)));
	});
}

const fakes: { match: (request: Request) => boolean; response: Fake }[] = [];
export const requests: Request[] = [];

/** Answer requests whose URL contains `match` (or matches the regex) with `response`. Newest fakes win. */
export function fake(match: string | RegExp, response: Fake) {
	const test = typeof match === 'string' ? (r: Request) => r.url.includes(match) : (r: Request) => match.test(r.url);
	fakes.unshift({ match: test, response });
}

export function json(status: number, body: unknown, headers: Record<string, string> = {}): FakeResponse {
	return { status, text: JSON.stringify(body), headers };
}

export function resetNetwork() {
	fakes.length = 0;
	requests.length = 0;
	setOnline(true);
}

export function setOnline(online: boolean) {
	Object.defineProperty(globalThis.navigator, 'onLine', { value: online, configurable: true });
}

export async function handleRequest(request: Request): Promise<FakeResponse> {
	requests.push(request);
	const found = fakes.find((f) => f.match(request))?.response;
	const injected = typeof found === 'function' ? found(request) : found;
	if (injected === 'network-error') throw new Error('net::ERR_INTERNET_DISCONNECTED');
	if (injected === 'hang') return new Promise(() => undefined);
	if (injected) return injected;

	const key = `${request.method} ${request.url}`;
	if (RECORD) {
		const response = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
		const buffer = Buffer.from(await response.arrayBuffer());
		const type = response.headers.get('content-type') ?? '';
		const saved: FakeResponse = {
			status: response.status,
			headers: type ? { 'content-type': type } : {},
			...(type.startsWith('image/') ? { base64: buffer.toString('base64') } : { text: buffer.toString('utf8') }),
		};
		recording.responses[key] = saved;
		return saved;
	}
	const saved = recording.responses[key];
	if (!saved) throw new Error(`No recorded response for ${key}. Run "npm run test:record -- ${suite}" to record it.`);
	return saved;
}
