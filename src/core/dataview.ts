import type { App } from 'obsidian';

export type DataviewStatus = 'enabled' | 'disabled' | 'missing' | 'unknown';

/**
 * Whether the Dataview plugin is installed and turned on. Obsidian has no
 * public API for this; Dataview's own helper for plugin developers reads the
 * same internal list. If that list ever disappears, the answer is "unknown"
 * and no warning is shown.
 */
export function dataviewStatus(app: App): DataviewStatus {
	const plugins = (app as unknown as {
		plugins?: { enabledPlugins?: Set<string>; manifests?: Record<string, unknown> };
	}).plugins;
	if (!plugins?.enabledPlugins || !plugins.manifests) return 'unknown';
	if (plugins.enabledPlugins.has('dataview')) return 'enabled';
	return 'dataview' in plugins.manifests ? 'disabled' : 'missing';
}

/** What to tell the user, or null when nothing needs doing. */
export function dataviewMessage(status: DataviewStatus, libraryNoteName: string): string | null {
	switch (status) {
		case 'missing':
			return `The table in "${libraryNoteName}" needs the Dataview plugin. Install it from Settings → Community plugins, then enable it.`;
		case 'disabled':
			return `The table in "${libraryNoteName}" needs the Dataview plugin, which is installed but turned off. Enable it in Settings → Community plugins.`;
		default:
			return null;
	}
}
