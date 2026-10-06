// Stand-ins for the plugin's windows (search, results list, buttons). A test
// queues what the "user" does; each window takes the next answer in line.
import { toBookError } from '../../src/core/errors';

type Step =
	| { kind: 'search'; query: string; mode?: string }
	| { kind: 'pick'; index: number }
	| { kind: 'choose'; label: string | null };

const steps: Step[] = [];
/** What happened, for assertions: errors shown in the search window, buttons offered, etc. */
export const ui = {
	searchErrors: [] as string[],
	searchOptions: [] as { modes?: { id: string; label: string }[]; initialMode?: string }[],
	pickLists: [] as unknown[][],
	choices: [] as { title: string; message: string; labels: string[] }[],
};

export function userSearches(query: string, mode?: string) {
	steps.push({ kind: 'search', query, mode });
}
export function userPicks(index: number) {
	steps.push({ kind: 'pick', index });
}
/** Click the button with this label; null closes the window instead. */
export function userChooses(label: string | null) {
	steps.push({ kind: 'choose', label });
}

export function resetUi() {
	steps.length = 0;
	ui.searchErrors.length = 0;
	ui.searchOptions.length = 0;
	ui.pickLists.length = 0;
	ui.choices.length = 0;
}

function next<K extends Step['kind']>(kind: K): Extract<Step, { kind: K }> | undefined {
	const step = steps[0];
	if (step?.kind !== kind) return undefined;
	steps.shift();
	return step as Extract<Step, { kind: K }>;
}

// search-modal.ts: runs the lookup once. An error stays "in the window" (recorded)
// and the user then closes it.
export async function openSearchModal<T>(
	_app: unknown,
	options: { modes?: { id: string; label: string }[]; initialMode?: string },
	lookup: (query: string, mode: string | undefined) => Promise<T>,
): Promise<T | null> {
	ui.searchOptions.push(options);
	const step = next('search');
	if (!step) return null;
	try {
		return await lookup(step.query, step.mode ?? options.initialMode);
	} catch (err) {
		ui.searchErrors.push(toBookError(err).message);
		return null;
	}
}

// pick-modal.ts
export function pickItem<T>(_app: unknown, options: { items: T[] }): Promise<T | null> {
	ui.pickLists.push(options.items);
	const step = next('pick');
	return Promise.resolve(step ? (options.items[step.index] ?? null) : null);
}

// choice-modal.ts
export function askChoice<T>(
	_app: unknown,
	title: string,
	message: string,
	choices: { label: string; value: T }[],
): Promise<T | null> {
	ui.choices.push({ title, message, labels: choices.map((c) => c.label) });
	const step = next('choose');
	if (!step || step.label === null) return Promise.resolve(null);
	const choice = choices.find((c) => c.label === step.label);
	if (!choice) throw new Error(`No button "${step.label}" (offered: ${choices.map((c) => c.label).join(', ')})`);
	return Promise.resolve(choice.value);
}
