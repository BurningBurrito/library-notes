import { uniqueStrings } from '../core/utils';

// Open Library "subjects" mix genres with places, characters, and catalog
// notes ("nyt:hardcover-fiction=2021-05-23", "Accessible book"), collected
// from every edition. For the `category` property, recognize common genres,
// give each one clean name, and keep the ones the subjects mention most.
const GENRES: [RegExp, string][] = [
	[/\bscience[- ]?fiction\b|\bsci[- ]?fi\b/i, 'Science fiction'],
	[/\bfantasy\b/i, 'Fantasy'],
	[/\bhistorical fiction\b/i, 'Historical fiction'],
	[/\bmyster(y|ies)\b|\bdetective\b/i, 'Mystery'],
	[/\bthrillers?\b|\bsuspense\b/i, 'Thriller'],
	[/\bhorror\b/i, 'Horror'],
	[/\bromance\b|\blove stories\b/i, 'Romance'],
	[/\bcomic(s| books)?\b|\bgraphic novels?\b|\bmanga\b/i, 'Comics'],
	[/\byoung[- ]adult\b/i, 'Young adult'],
	[/\bjuvenile\b|\bchildren'?s\b/i, "Children's"],
	[/\bpoetry\b/i, 'Poetry'],
	[/\bbiograph|\bautobiograph|\bmemoirs?\b/i, 'Biography'],
	[/\bself[- ]?help\b|\bpersonal (development|growth)\b|\bself[- ]?improvement\b/i, 'Self-help'],
	[/\bbusiness\b|\bmanagement\b|\bentrepreneur/i, 'Business'],
	[/\beconomics?\b/i, 'Economics'],
	[/\bpsycholog/i, 'Psychology'],
	[/\bphilosoph/i, 'Philosophy'],
	[/\bpolitic/i, 'Politics'],
	[/\breligio|\bchristian|\bspiritual/i, 'Religion'],
	[/\bhistory\b/i, 'History'],
	[/\btechnology\b|\bcomputer|\bprogramming\b/i, 'Technology'],
	[/\beducation\b|\bstudy\b|\bacadem|\blearning\b/i, 'Education'],
	[/\bwriting\b|\bauthorship\b/i, 'Writing'],
	[/\bscience\b/i, 'Science'],
	[/\bcook(ing|ery)\b|\brecipes\b/i, 'Cooking'],
	[/\btravel\b/i, 'Travel'],
	[/\bmusic\b/i, 'Music'],
	[/\bart\b|\bpainting\b|\bdrawing\b/i, 'Art'],
	[/\bfiction\b/i, 'Fiction'],
];

// Catalog notes that are never a category.
const NOISE = /[:=]|accessible book|protected daisy|in library|lending library|large type|bestseller|new york times|reviewed|staff picks|overdrive|reading level|^nyt/i;

const MAX_CATEGORIES = 3;

export function categoriesFromSubjects(subjects: string[]): string[] {
	const useful = subjects.filter((subject) => !NOISE.test(subject));
	// In a long list (many editions), a genre mentioned once is usually noise.
	const minMentions = useful.length > 20 ? 2 : 1;
	const found = GENRES.map(([pattern, label]) => {
		const positions = useful.flatMap((subject, i) => (pattern.test(subject) ? [i] : []));
		return { label, mentions: positions.length, first: positions[0] ?? Infinity };
	}).filter((genre) => genre.mentions >= minMentions);

	const labels = new Set(found.map((genre) => genre.label));
	const matched = found
		// "Science fiction" makes "Science" and plain "Fiction" redundant (likewise "Historical fiction").
		.filter((genre) => !(genre.label === 'Science' && labels.has('Science fiction')))
		.filter((genre) => !(genre.label === 'Fiction' && found.some((g) => g.label !== 'Fiction' && /fiction/i.test(g.label))))
		// Most mentioned first, then shown in the order the subjects list them.
		.sort((a, b) => b.mentions - a.mentions || a.first - b.first)
		.slice(0, MAX_CATEGORIES)
		.sort((a, b) => a.first - b.first)
		.map((genre) => genre.label);
	if (matched.length) return matched;

	// No known genre: keep the first couple of clean subjects as they are.
	const clean = useful.filter((s) => s.length <= 40).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
	return uniqueStrings(clean).slice(0, 2);
}
