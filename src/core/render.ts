import { moment } from 'obsidian';
import { collapseWhitespace } from './utils';

/**
 * A list renders as "a, b, c" in the note body and as a list property in
 * frontmatter. A number stays a number property.
 */
export type TemplateValue = string | number | string[];
export type TemplateVariables = Record<string, TemplateValue>;

// {{name}} or {{name:format}}, e.g. {{date:YYYY-MM-DD}}
const PLACEHOLDER = /\{\{\s*(\w+)\s*(?::([^}]*))?\}\}/g;
// A frontmatter line whose whole value is one placeholder: "key: {{name}}" or "- {{name}}".
const WHOLE_VALUE = /^(\s*(?:-[ \t]+|[^\s#:-][^:]*:[ \t]*))\{\{\s*(\w+)\s*(?::([^}]*))?\}\}[ \t]*$/;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

type Resolver = (name: string, format: string | undefined) => TemplateValue | undefined;

/** The one moment.js method this plugin uses. */
export interface DateFormatter {
	format(format: string): string;
}

// Obsidian bundles moment.js. Describing the method we use ourselves keeps type
// checking working even where moment's own types aren't installed, as in
// Obsidian's automated plugin review.
const currentMoment = moment as unknown as () => DateFormatter;

/**
 * Replace {{variables}} in a template. Unknown variables are left untouched so
 * other plugins' template syntax survives. {{date}} and {{time}} accept a
 * moment.js format, e.g. {{date:dddd, MMMM D}}.
 */
export function renderTemplate(
	template: string,
	variables: TemplateVariables,
	now: DateFormatter = currentMoment(),
): string {
	const resolve: Resolver = (name, format) => {
		if (name === 'date') return now.format(format?.trim() || 'YYYY-MM-DD');
		if (name === 'time') return now.format(format?.trim() || 'HH:mm');
		return variables[name];
	};

	let frontmatter = '';
	let body = template;
	const match = template.match(FRONTMATTER);
	if (match) {
		const lines = (match[1] ?? '').split(/\r?\n/).map((line) => renderFrontmatterLine(line, resolve));
		frontmatter = `---\n${lines.join('\n')}\n---\n`;
		body = template.slice(match[0].length);
	}
	return frontmatter + replacePlaceholders(body, resolve, (value) => value);
}

function replacePlaceholders(text: string, resolve: Resolver, finish: (value: string) => string): string {
	return text.replace(PLACEHOLDER, (placeholder, name: string, format: string | undefined) => {
		const value = resolve(name, format);
		if (value === undefined) return placeholder;
		return finish(Array.isArray(value) ? value.join(', ') : String(value));
	});
}

// Values in frontmatter must stay valid YAML: a description containing ": " or
// a leading quote would otherwise break the note's properties.
function renderFrontmatterLine(line: string, resolve: Resolver): string {
	const whole = line.match(WHOLE_VALUE);
	if (whole) {
		const [, prefix = '', name = '', format] = whole;
		const value = resolve(name, format);
		if (value !== undefined) return (prefix + toYaml(value)).trimEnd();
	}
	return replacePlaceholders(line, resolve, collapseWhitespace);
}

const YAML_RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

function toYaml(value: TemplateValue): string {
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
	if (Array.isArray(value)) {
		return value.length ? JSON.stringify(value.map(collapseWhitespace)) : '';
	}
	const text = collapseWhitespace(value);
	if (!text) return '';
	// Leave simple words (in any alphabet) and ISO dates unquoted; quote everything else,
	// including numbers in text such as ISBNs, so they stay text.
	const plain =
		/^\d{4}-\d{2}-\d{2}$/.test(text) ||
		(/^\p{L}[\p{L} -]*$/u.test(text) && !YAML_RESERVED.test(text) && !text.endsWith(' '));
	return plain ? text : JSON.stringify(text);
}
