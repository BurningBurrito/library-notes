import { apiVersion, App, MarkdownView, Notice, Plugin, requestUrl, RequestUrlResponse } from 'obsidian';

// Developer checks: confirm, inside the real app, facts the design depends on
// (DESIGN.md §2). Run "Run developer checks" in the test vault; results are
// written to a note. Included only in dev builds (see DEV_BUILD in main.ts).

const USER_AGENT = 'LibraryNotes/dev-check (+https://github.com/BurningBurrito/obsidian-library-notes)';
const RESULTS_PATH = 'Checks/Developer check results.md';
const COVER_TABLE_PATH = 'Checks/Cover table.md';
const ECHO_SERVICES = ['https://httpbin.org/headers', 'https://postman-echo.com/headers'];

/** Notes in the cover table and whether their row should show a cover image. */
const EXPECTED_ROWS: Record<string, boolean> = {
	'Building a Second Brain': true,
	'One piece': true,
	'Patriot Games': true,
	Seveneves: true,
	'Project Hail Mary': true,
	'Test - embed format': true,
	'Test - link with alias': true,
	'Test - empty cover': false,
	'Test - no cover property': false,
	'Test - missing image file': false,
};

type Outcome = 'pass' | 'fail' | 'info';
interface Result {
	check: string;
	expected: string;
	actual: string;
	outcome: Outcome;
}

export function registerDevChecks(plugin: Plugin): void {
	plugin.addCommand({
		id: 'dev-run-checks',
		name: 'Run developer checks (dev build only)',
		callback: () => {
			void runChecks(plugin.app);
		},
	});
}

async function runChecks(app: App): Promise<void> {
	new Notice('Running developer checks…');
	const results = [...(await userAgentChecks()), ...(await coverChecks()), ...(await coverTableChecks(app))];
	await writeResults(app, results);
	const failed = results.filter((r) => r.outcome === 'fail').length;
	new Notice(`Developer checks done: ${failed === 0 ? 'all passed' : `${failed} failed`}. See "${RESULTS_PATH}".`);
}

// 1. Does a custom User-Agent set on requestUrl reach the server?
async function userAgentChecks(): Promise<Result[]> {
	const custom = await echoUserAgent({ 'User-Agent': USER_AGENT });
	const plain = await echoUserAgent({});
	return [
		{
			check: `Custom User-Agent reaches the server (${custom.service})`,
			expected: USER_AGENT,
			actual: custom.userAgent,
			outcome: custom.userAgent === USER_AGENT ? 'pass' : 'fail',
		},
		{
			check: `User-Agent when the plugin sets none (${plain.service})`,
			expected: '(for information)',
			actual: plain.userAgent,
			outcome: 'info',
		},
	];
}

async function echoUserAgent(headers: Record<string, string>): Promise<{ service: string; userAgent: string }> {
	for (const url of ECHO_SERVICES) {
		try {
			const response = await requestUrl({ url, headers, throw: false });
			if (response.status !== 200) continue;
			const data = JSON.parse(response.text) as { headers?: Record<string, string> };
			const userAgent = Object.entries(data.headers ?? {}).find(([key]) => key.toLowerCase() === 'user-agent');
			return { service: new URL(url).host, userAgent: userAgent?.[1] ?? '(no User-Agent header)' };
		} catch {
			// Try the next echo service.
		}
	}
	return { service: 'no echo service reachable', userAgent: '(no answer)' };
}

// 2. Open Library covers through requestUrl: redirect followed, image bytes
//    intact, and a missing cover reported as 404 (not a blank image).
async function coverChecks(): Promise<Result[]> {
	const headers = { 'User-Agent': USER_AGENT };
	const found = await requestUrl({
		url: 'https://covers.openlibrary.org/b/id/11200092-L.jpg?default=false',
		headers,
		throw: false,
	});
	const bytes = new Uint8Array(found.arrayBuffer);
	const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
	const missing = await requestUrl({
		url: 'https://covers.openlibrary.org/b/id/99999999999-L.jpg?default=false',
		headers,
		throw: false,
	});
	return [
		{
			check: 'Existing cover (redirects to archive.org)',
			expected: '200, image/jpeg, JPEG bytes',
			actual: `${found.status}, ${header(found, 'content-type')}, ${bytes.length} bytes, ${isJpeg ? 'JPEG' : 'not JPEG'}`,
			outcome: found.status === 200 && isJpeg ? 'pass' : 'fail',
		},
		{
			check: 'Missing cover with ?default=false',
			expected: '404',
			actual: `${missing.status}, ${missing.arrayBuffer.byteLength} bytes`,
			outcome: missing.status === 404 ? 'pass' : 'fail',
		},
	];
}

function header(response: RequestUrlResponse, name: string): string {
	const key = Object.keys(response.headers).find((k) => k.toLowerCase() === name);
	return key === undefined ? '(none)' : (response.headers[key] ?? '(none)');
}

// 3. The proposed Library MOC query, rendered by Dataview: which rows show a
//    cover image, and does every note get a row?
async function coverTableChecks(app: App): Promise<Result[]> {
	const dataview = isPluginEnabled(app, 'dataview');
	const file = app.vault.getFileByPath(COVER_TABLE_PATH);
	if (!file) return [fail('Dataview cover table', `"${COVER_TABLE_PATH}" exists`, 'not found')];

	const leaf = app.workspace.getLeaf('tab');
	await leaf.openFile(file, { state: { mode: 'preview' } });
	const view = leaf.view;
	if (!(view instanceof MarkdownView)) return [fail('Dataview cover table', 'opens in reading view', 'did not')];

	const table = await waitFor(() => view.containerEl.querySelector('table.table-view-table'), 15_000);
	if (!table) {
		return [fail('Dataview cover table', 'table rendered', `no table (Dataview enabled: ${dataview ? 'yes' : 'no'})`)];
	}
	// Give the cover images time to load.
	await waitFor(() => Array.from(table.querySelectorAll('img')).every((img) => img.complete) || null, 10_000);

	const results: Result[] = [];
	const seen = new Set<string>();
	for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
		const cells = row.querySelectorAll('td');
		const title = cells[1]?.textContent?.trim() ?? '?';
		const read = cells[5]?.textContent?.trim() ?? '';
		const img = cells[0]?.querySelector('img');
		const loaded = !!img && img.complete && img.naturalWidth > 0;
		const actual = !img
			? 'no image'
			: loaded
				? `image loaded (${img.naturalWidth}×${img.naturalHeight}, shown ${img.width}px wide)`
				: 'image element, failed to load';
		const expectImage = EXPECTED_ROWS[title];
		seen.add(title);
		results.push({
			check: `Cover: ${title} (read: ${read || 'empty'})`,
			expected: expectImage === undefined ? '(not in the expected list)' : expectImage ? 'image loaded' : 'no image',
			actual,
			outcome: expectImage === undefined ? 'info' : expectImage === loaded ? 'pass' : 'fail',
		});
	}
	const missingRows = Object.keys(EXPECTED_ROWS).filter((title) => !seen.has(title));
	results.push({
		check: 'Every note has a row (none silently dropped)',
		expected: `${Object.keys(EXPECTED_ROWS).length} rows`,
		actual: missingRows.length ? `missing: ${missingRows.join(', ')}` : `${seen.size} rows`,
		outcome: missingRows.length ? 'fail' : 'pass',
	});
	return results;
}

function fail(check: string, expected: string, actual: string): Result {
	return { check, expected, actual, outcome: 'fail' };
}

/** Dataview's own helper checks the same internal list; Obsidian has no public API for this. */
function isPluginEnabled(app: App, id: string): boolean {
	const plugins = (app as unknown as { plugins?: { enabledPlugins?: Set<string> } }).plugins;
	return plugins?.enabledPlugins?.has(id) ?? false;
}

async function waitFor<T>(get: () => T | null | undefined, timeoutMs: number): Promise<T | null> {
	const end = Date.now() + timeoutMs;
	for (;;) {
		const value = get();
		if (value) return value;
		if (Date.now() > end) return null;
		await sleep(200);
	}
}

async function writeResults(app: App, results: Result[]): Promise<void> {
	const mark: Record<Outcome, string> = { pass: '✅', fail: '❌', info: 'ℹ️' };
	const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
	const lines = [
		'# Developer check results',
		'',
		`Run: ${new Date().toISOString()} · Obsidian API ${apiVersion} · Dataview enabled: ${isPluginEnabled(app, 'dataview') ? 'yes' : 'no'}`,
		'',
		'| | Check | Expected | Actual |',
		'| --- | --- | --- | --- |',
		...results.map((r) => `| ${mark[r.outcome]} | ${cell(r.check)} | ${cell(r.expected)} | ${cell(r.actual)} |`),
		'',
	];
	const content = lines.join('\n');
	const existing = app.vault.getFileByPath(RESULTS_PATH);
	if (existing) await app.vault.process(existing, () => content);
	else await app.vault.create(RESULTS_PATH, content);
}
