/** Trim, drop empties, and remove duplicates (case-insensitive), keeping order. */
export function uniqueStrings(values: Iterable<string>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of values) {
		const value = raw.trim();
		const key = value.toLowerCase();
		if (!value || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

export function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** A value from parsed JSON, read without trusting its shape. */
export function asString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

export function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
