import { BookError, toBookError } from '../core/errors';
import type LibraryNotesPlugin from '../main';
import { googleBooks } from './google-books';
import { openLibrary } from './open-library';
import type { BookSource, SearchResult, SourceId } from './types';

/** Every source, in fallback order. */
export const SOURCES: BookSource[] = [openLibrary, googleBooks];

export function getSource(id: SourceId): BookSource | undefined {
	return SOURCES.find((source) => source.id === id);
}

export function isSourceId(value: unknown): value is SourceId {
	return typeof value === 'string' && SOURCES.some((source) => source.id === value);
}

/** Sources that can be used now (Open Library always; others once set up). */
export function configuredSources(plugin: LibraryNotesPlugin): BookSource[] {
	return SOURCES.filter((source) => source.isConfigured(plugin));
}

/** The chosen source first, then the other configured sources in order. */
export function sourceOrder(plugin: LibraryNotesPlugin, first: SourceId): BookSource[] {
	const available = configuredSources(plugin);
	const start = available.find((source) => source.id === first) ?? available[0];
	return start ? [start, ...available.filter((source) => source !== start)] : [];
}

export interface SearchOutcome {
	results: SearchResult[];
	source: BookSource;
	/** Set when an earlier source failed or found nothing and a later one answered. */
	fallback?: { from: string; reason: string };
}

/**
 * Search the chosen source; if it fails or finds nothing and fallback is on,
 * try the next configured source. Never falls back when offline (every source
 * would fail the same way).
 */
export async function searchBooks(query: string, plugin: LibraryNotesPlugin, first: SourceId): Promise<SearchOutcome> {
	const order = sourceOrder(plugin, first);
	const primary = order[0];
	if (!primary) throw new BookError('config', 'No book source is available. Check the Library Notes settings.');
	const candidates = plugin.settings.useFallback ? order : [primary];

	let firstProblem: { source: BookSource; error?: BookError } | null = null;
	for (const source of candidates) {
		try {
			const results = await source.search(query, plugin);
			if (results.length > 0) {
				if (!firstProblem) return { results, source };
				return {
					results,
					source,
					fallback: {
						from: firstProblem.source.name,
						reason: firstProblem.error ? firstProblem.error.message : `${firstProblem.source.name} found nothing.`,
					},
				};
			}
			firstProblem ??= { source };
		} catch (err) {
			const error = toBookError(err);
			if (error.kind === 'offline') throw error;
			firstProblem ??= { source, error };
		}
	}
	// Nothing anywhere: report the chosen source's problem, which is the one the user can act on.
	if (firstProblem?.error) throw firstProblem.error;
	const tried = candidates.length > 1 ? ` (searched ${candidates.map((s) => s.name).join(', ')})` : '';
	throw new BookError('not-found', `No books found for "${query}"${tried}. Try fewer words, or the ISBN.`);
}
