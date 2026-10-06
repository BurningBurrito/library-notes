// Runs the test suite: bundles each tests/*.test.ts with esbuild, swapping in
// stand-ins for Obsidian and the plugin's windows (tests/support/), then runs
// the bundles with Node's built-in test runner.
//
//   npm test                          answer requests from recorded responses (no network)
//   npm run test:record               make the real requests and save new recordings
//   npm run test:record -- flow       ...only for the named suites (tests/flow.test.ts)
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const record = process.argv.includes('--record');
const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const outdir = 'tests/.build';
rmSync(outdir, { recursive: true, force: true });

const entryPoints = readdirSync('tests')
	.filter((file) => file.endsWith('.test.ts'))
	.filter((file) => only.length === 0 || only.includes(file.replace(/\.test\.ts$/, '')))
	.map((file) => `tests/${file}`);
const uiStandIn = path.resolve('tests/support/ui.ts');

await esbuild.build({
	entryPoints,
	outdir,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	outExtension: { '.js': '.cjs' },
	logLevel: 'warning',
	define: { DEV_BUILD: 'false' },
	alias: { obsidian: './tests/support/obsidian.ts' },
	plugins: [
		{
			name: 'ui-stand-ins',
			setup(build) {
				build.onResolve({ filter: /\/ui\/(search|pick|choice)-modal$/ }, () => ({ path: uiStandIn }));
			},
		},
	],
});

const bundles = entryPoints.map((entry) => path.join(outdir, path.basename(entry).replace(/\.ts$/, '.cjs')));
// When recording, run one suite at a time so requests to a service aren't sent in parallel.
const concurrency = record ? ['--test-concurrency=1'] : [];
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...concurrency, ...bundles], {
	stdio: 'inherit',
	env: { ...process.env, LN_RECORD: record ? '1' : '' },
});
process.exit(result.status ?? 1);
