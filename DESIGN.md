# Design proposal: book search plugin (Phase 1)

Status: **approved 2026-10-05**; all decisions answered (see §11). Items marked *(test in Phase 2)* were checked by reading source code
and will be confirmed in the test vault before any code depends on them.

---

## 1. What I reviewed and what I'll reuse

### Your dictionary plugin (`ObsidianDictionaryPlugIn`, `dictionary-notes` 1.2.0)
Reuse the structure, setup, and most of the core code (it's your own MIT code, so no restrictions):

| Reuse | What it gives this plugin |
| --- | --- |
| Build setup: `esbuild.config.mjs` (copies each dev build into `test-vault/`), `tsconfig.json`, `eslint.config.mts` with `eslint-plugin-obsidianmd`, `version-bump.mjs`, `.npmrc`, `.editorconfig`, `.gitignore` | Identical tooling and the Hot Reload workflow you already know |
| `.github/workflows/release.yml` (tag must equal manifest version, build, attestation, **draft** release) and `lint.yml` (build, lint, tests, lint without moment types) | Same release flow; the "lint without moment types" step prevents the 1.0.0 review warning |
| `core/http.ts` (requestUrl wrapper: offline check, 15 s timeout, 429 with Retry-After, 5xx) and `core/errors.ts` | Same plain-language errors |
| `core/render.ts` (`{{var}}` / `{{date:FORMAT}}`, YAML-safe frontmatter, lists become real list properties) | Templates that never break a note's properties |
| `core/notes.ts` (safe file names, `normalizePath`, nested folder creation, numbered copies) | Folder/file handling |
| `ui/search-modal.ts` (mode buttons → **source buttons**, errors shown inside the window), `ui/pick-modal.ts` | Search and result list |
| Declarative settings (Obsidian 1.13) and `SecretComponent` (keys stored in Obsidian's keychain, not in `data.json`) | Settings page and key storage |
| Offline test suite with recorded responses (`tests/`, `npm test`, `npm run test:record`) | Repeatable tests without hitting the APIs |
| README structure, including "Network use and privacy" (required disclosure) | Submission-ready docs |

### anpigon/obsidian-book-search-plugin ("Book Search")
- MIT, "Copyright (c) 2020 Jake Runzer". Last commit 2024-10-16, so effectively unmaintained.
- **I won't copy any of its code.** Obsidian's [Developer policies](https://docs.obsidian.md/Developer+policies)
  say a new project "should inherit no code from the original repo without explicit permission" (stricter than
  MIT). Nothing in it is worth the risk anyway: it runs template code with `new Function` (eval), writes covers
  with `adapter.writeBinary` instead of the Vault API, and never checks for duplicate notes. It's credited as
  the inspiration in the README, as in Dictionary Notes.
- What I take from it as **ideas only**: the search → pick → note-from-template flow, cover thumbnails in the
  result list, and its template variable names (so a Book Search template mostly works here, see §6).

### Your real vault (read only; nothing was changed)
`Synced Notes/Library/` has `All Books/` (10 notes), an empty `Covers/`, and `LIbrary MOC.md` (capital **I**).
What this means for the design:

1. **`link` is not a web link.** In your notes it's `link: ["[[LIbrary MOC]]"]`, a link back to the MOC. The
   book's web address therefore goes in a new `sourceUrl` property, and `link` keeps its meaning.
2. **`localCover` is a plain path that doesn't resolve.** Values like `/Book Title.jpg`, while the images
   are in `Synced Notes/Assets/`. In Dataview a plain path shows as text, and Obsidian treats a leading `/` as
   "from the vault root", so these links don't find the image. The new table handles them anyway (§7).
3. **`AudioBook` / `EBook` already use 🟩 / 🟥 / N/A**, the same squares you want for read status.
4. **Other existing properties:** `tags: 📚Book`, `subtitle`, `publisher`, `publish`, `total`, `isbn10`,
   `isbn13`, `cover` (Google image URL), `Status`/`status` ("Completed", "In Progress", "Not In Library", "N/A"),
   `rating`, `created`, `updated`.
5. **MOC name:** `LIbrary MOC` ≠ `Library MOC` on Linux (file names are case-sensitive), so the MOC name is a
   setting **[Q7]**.

---

## 2. Verified facts (checked 2026-10-05)

### Open Library (default, no key)
| Fact | Evidence |
| --- | --- |
| Rate limit 1 req/s unidentified, **3 req/s** with `User-Agent: AppName (contact@email)` | [API guidelines page](https://openlibrary.org/developers/api) |
| Asks: requests on behalf of a user, cache responses, no bulk download, no high-traffic commercial backend | same page |
| Search: `search.json?q=&lang=&fields=&limit=` returns **works** plus one best-matching **edition** (`editions.*` fields), language-aware with `lang` | live request |
| Searching an ISBN returns that exact edition as the best match | live request (9780593395561) |
| Work JSON: `description` is a string **or** `{type, value}`; `subjects` mixes genres with noise (`nyt:hardcover-fiction=…`); `covers` contains `-1` for deleted covers | live request |
| Covers: `covers.openlibrary.org/b/id/{cover_i}-L.jpg` → **302 redirect** to archive.org | live request |
| Covers by Cover ID/OLID are **not** rate-limited; by ISBN: 100 per 5 min, then 403 | [Covers API](https://openlibrary.org/dev/docs/api/covers) |
| **Missing cover without `?default=false` → `200` with a 43-byte 1×1 GIF.** With `?default=false` → `404` | live request |
| Covers page asks for a "courtesy link back to Open Library"; each note links to the book's Open Library page | Covers API page |

### User-Agent through Obsidian's `requestUrl` *(test in Phase 2)*
Read in Obsidian's own code (app 1.14.4): on desktop, `requestUrl` passes the request unchanged to the main
process, which calls Electron's `net.request({ redirect: "follow" })` and sets **every** header with
`setHeader`. Electron allows a custom `User-Agent` there, unlike a browser `fetch`. So it should work, and
redirects (cover → archive.org) are followed. **Phase 2 check:** a real `requestUrl` call from the test
vault to a header-echo service (`httpbin.org/headers`) to show the header that actually arrives.
- If it **doesn't** arrive: the plugin stays at the unidentified 1 req/s limit (still plenty for one person
  searching), and I'll tell you before building on it.
- Mobile uses a different, native HTTP path that I can't test here (noted as a risk, as in Dictionary Notes).

### Google Books (optional, user's own key)
- Docs: public data requests "must provide either the API key or an OAuth 2.0 token". Key goes in `&key=`.
- **Live test without a key: 429 "Quota exceeded … Queries per day"** (shared quota used up). Confirms your point.
- Search: `volumes?q=` with `intitle:`, `inauthor:`, `isbn:`; `maxResults` ≤ 40; `printType=books`; `langRestrict`.
- Fields: title, subtitle, authors, publisher, publishedDate, description, industryIdentifiers, pageCount,
  **categories** (e.g. "Fiction", which fits `category` well), imageLinks.

### Hardcover (optional; docs updated 2026-10-04, so it changes often)
- GraphQL at `https://api.hardcover.app/v1/graphql`, header `authorization: Bearer <token>`. "Heavily in flux…
  could break"; "may reset tokens without notice while in beta".
- `search(query:, query_type: "Book", per_page:)` returns Typesense results including title, subtitle,
  author_names, **genres**, isbns, pages, release_year, description, **has_audiobook**, **has_ebook**, slug.
- **Scopes (new since Aug 2026):** `search` needs only **`read:catalog:search`**, a read-only scope over the
  public catalog that can't touch your account.
- Limits (free plan): 60/min, burst 10, 5,000/day; `RateLimit` headers on every response; search times out at 2 s.
- **Important:** the docs say *"For anything a user signs into, use OAuth… **Never ask a user to paste a PAT
  into your app.**"* They also offer a "PAT Link Builder" for "tools or scripts that have to use PATs". For
  native apps they document an **OAuth Device Authorization Grant** (the plugin shows a code, you approve it at
  hardcover.app, the plugin polls for a token). It works with `requestUrl` and needs no local web server. But it
  needs a registered Hardcover "developer app" (public client ID, no secret) **[Q6]**.

### Dataview (read in its source, v0.5.68; you have 0.5.67) *(test in Phase 2)*
- A property value `"[[x.jpg]]"` becomes a link; `"![[x.jpg]]"` becomes an embedded link, drawn as an
  **image** in a table. `embed(link)` turns any link into an image; `link("text")` accepts text, a link, or empty.
- Links are resolved with Obsidian's resolver: `Book Title.jpg` is found by name anywhere in the vault,
  `Assets/Book Title.jpg` by path suffix, but **`/Book Title.jpg` (leading slash) is not found**.
- Field names are matched case-insensitively (`status` finds `Status`).
- **If an expression errors on a row, Dataview silently drops that row from the table.** So the cover column
  must be written so it can't error on any value (see §7).
- Obsidian tracks (and updates on rename) property links only when the value **starts with `[[`**. A value
  starting with `![[` is just text to Obsidian.

### Obsidian rules (developer docs, last change 2026-08-11)
- ID: lowercase letters and hyphens, can't end with `plugin`, can't contain `obsidian`, unique.
- Name: no "Obsidian", no "Plugin", Basic Latin, unique. Description ≤ 250 characters, ends with a period.
- README must disclose network use (which services and why) and that an account is needed for optional sources.
- Guidelines that apply here: Vault API over Adapter API (`vault.createBinary` for covers),
  `FileManager.processFrontMatter` for the read toggle, `normalizePath` for every user path, no default
  hotkeys, `checkCallback` for commands that need an open book note, no `innerHTML`, sentence case.
- Submission: community.obsidian.md dashboard + automated review (re-checked again in Phase 6).
- No official API to detect another plugin; Dataview's own developer helper uses
  `app.plugins.enabledPlugins.has("dataview")`. I'll use that behind a small typed wrapper.

---

## 3. Name and ID **[Q1]**

All checked on 2026-10-05 against the 8,445 listed plugins **and** the 175 removed IDs, plus your GitHub account:

| # | Name | ID | Repo | Why |
| --- | --- | --- | --- | --- |
| 1 | **Library Notes** ✅ *chosen* | `library-notes` | `obsidian-library-notes` | Matches "Dictionary Notes"; it maintains a library (folder + MOC), not just search |
| 2 | Bookshelf Notes | `bookshelf-notes` | `obsidian-bookshelf-notes` | Friendly; but "Bookshelf" and "Bookshelf Base" exist, so possible confusion |
| 3 | Book Library Notes | `book-library-notes` | `obsidian-book-library-notes` | Most explicit; longer |

All free. Dropped "Book Notes": an existing plugin is called "Book Note". The **ID can never change** after
release; the name can.

Related plugins exist (closest: **Tome**: Google Books/Open Library/OpenAlex with fallback and local covers).
None has the library MOC + Dataview table + read toggle + your property names + Hardcover. Obsidian only asks
developers to *consider* contributing to existing projects, so this isn't a blocker.

---

## 4. Architecture

Same layout idea as Dictionary Notes: shared code in `core/`, one module per data source behind one interface.

```
src/
├── main.ts                  commands, ribbon icon, settings tab
├── settings.ts              settings + declarative settings tab
├── core/
│   ├── http.ts              requestUrl wrapper (timeouts, offline, 429, 5xx)      ← from Dictionary Notes
│   ├── throttle.ts          per-host spacing (Open Library ≤ 3/s, Hardcover ≤ 1/s)
│   ├── cache.ts             small in-memory cache (searches, work details; 30 min, 50 entries)
│   ├── errors.ts            BookError kinds                                         ← from Dictionary Notes
│   ├── render.ts            template rendering                                      ← from Dictionary Notes
│   ├── paths.ts             root/books/covers/MOC paths from settings (normalizePath, nested roots)
│   ├── notes.ts             safe names, folders, existing-note check               ← from Dictionary Notes
│   ├── covers.ts            download, validate, save with vault.createBinary
│   └── dataview.ts          is Dataview installed / enabled
├── sources/
│   ├── types.ts             BookSource interface + Book model
│   ├── index.ts             registry, "configured" check, fallback order
│   ├── open-library.ts
│   ├── google-books.ts
│   └── hardcover/           isolated: everything Hardcover-specific lives here
│       ├── client.ts        GraphQL request + error mapping
│       ├── search.ts        query text + defensive response parsing
│       └── auth.ts          token or device sign-in [Q6]
├── library/
│   ├── moc.ts               create / regenerate the Library MOC
│   └── read-status.ts       toggle read command
└── ui/
    ├── search-modal.ts      query box + source buttons                              ← from Dictionary Notes
    ├── pick-modal.ts        results with cover thumbnails                           ← from Dictionary Notes
    ├── exists-modal.ts      Open existing / Create copy / Cancel
    └── confirm-modal.ts     confirm MOC regeneration
```

### Source interface
```ts
interface BookSource {
  id: 'open-library' | 'google-books' | 'hardcover';
  name: string;                                          // "Open Library"
  isConfigured(plugin): boolean;                         // Open Library: always; others: key/token present
  search(query: string, ctx): Promise<BookResult[]>;     // [] = no results; throws BookError on failure
  details(result: BookResult, ctx): Promise<Book>;       // extra lookups after you pick (Open Library: description, subjects)
  check(ctx): Promise<string>;                           // "API check" button: a tiny real request
}
```
Adding a source later = one new file + one line in the registry.

### Requests per book (Open Library)
1 search + 1 work request (description, subjects) + 1 cover = 3 requests, spaced ≥ 350 ms apart
(≈ 2.8/s, under the 3/s identified limit; 1/s if the User-Agent check fails). Searches and work details are
cached for the session, so searching the same thing again costs nothing.

---

## 5. Fallback logic

- **Order:** the default source first, then the other **configured** sources in the order
  Open Library → Google Books → Hardcover. Unconfigured sources are skipped.
- **Setting "Try the next source if the default one fails or finds nothing"** (default **on**).
  When on, the next source is tried if the current one returns **no results** or **fails** (network error,
  timeout, rate limit, server error, unreadable response, invalid key/token).
- **Never** when you're offline (every source would fail the same way).
- If a backup source answers, a notice says so: *"Open Library found nothing for "…". Showing results from
  Google Books."*
- If every source fails: the **default source's** error is shown in the search window (that's the one you can
  act on), with "Also tried: Google Books (invalid API key)".
- **Source buttons in the search window** appear only when 2+ sources are configured. The window starts on
  the default source; picking another button searches that source first (fallback still applies).

---

## 6. Book notes

### File name, location, duplicates
- `{Books folder}/{title}.md`, with characters that break files or links removed (same as your old
  `{{title}}` format).
- If that note exists → a window: **Open existing** / **Create copy** (`Title 2.md`) / **Cancel**. Nothing
  is ever overwritten.

### Cover files
- Name: `{title} - {id}.{ext}`, e.g. `Project Hail Mary - 9780593135204.jpg`. `id` = ISBN-13 if known,
  otherwise the source's ID (`OL21745884W`, Google volume ID, `hc-12345`). Title shortened to 80 characters.
  Extension from the actual image type (jpg/png/webp).
- Validated before saving: status 200, image content type, real image bytes (JPEG/PNG/WebP/GIF header), and
  larger than 1 KB, so placeholder images are rejected even if `default=false` ever stopped working.
- Saved with `vault.createBinary` into the Covers folder. If that exact file already exists (same book again),
  it's **reused**, never overwritten.
- No cover → `cover` and `localCover` are left empty, the note is still created, and a short notice says so.

### `localCover` format (decided)
`localCover: "[[Library/Covers/Project Hail Mary - 9780593135204.jpg]]"`
- A real link: clickable in Properties, **updated by Obsidian if you rename or move the image**, usable in
  Bases.
- Dataview shows it as an image with `embed(...)`, which the generated MOC query does.
- Alternative: `"![[…]]"` shows as an image even in plain `localCover as cover` queries, but Obsidian doesn't
  track it (no rename updates) and Properties shows it as text.

### Properties (built-in template) **[Q3] [Q4] [Q5]**
Decided: new notes use **`publishDate`, `pageCount`, `isbn`** (old notes keep `publish`, `total`, `isbn10/13`;
nothing in them changes, and the MOC table doesn't use those columns).

| Property | Example | Note |
| --- | --- | --- |
| `tags` | `[📚Book]` | as in your notes |
| `title` | `Project Hail Mary` | **kept** |
| `subtitle` | | existing |
| `author` | `[Andy Weir]` | **kept**, list |
| `category` | `[Science fiction]` | **kept**, list; up to 3 genres (Open Library subjects with the noise filtered out) |
| `publisher` | `Ballantine Books` | existing [publisher] |
| `publishDate` | `2021-05-04` / `2021` | new name (old notes: `publish`) |
| `pageCount` | `496` | new name (old notes: `total`) |
| `isbn` | `9780593135204` | ISBN-13 if known, else ISBN-10 (old notes: `isbn10`, `isbn13`) |
| `description` | | new |
| `cover` | `https://covers.openlibrary.org/…` | existing (remote image URL) |
| `localCover` | `"[[…/Covers/….jpg]]"` | **kept** |
| `read` | `false` | **new**, checkbox; toggled by the command |
| `rating` | `N/A` | existing |
| `AudioBook`, `EBook` | `N/A` | **kept** (decided) |
| `source` | `Open Library` | new |
| `sourceUrl` | `https://openlibrary.org/works/OL21745884W` | new (not `link`, see §1) |
| `created` | `2026-10-05 14:02:11` | existing |
| `link` | `["[[Library MOC]]"]` | **kept**, back-link to the MOC (uses the MOC name setting) |

Not carried over: `updated` (the plugin wouldn't maintain it) and `Status`/`status` (replaced by `read`;
existing values are left untouched, and the table doesn't read them).

Built-in template (the body copies your current notes):
```markdown
---
tags:
  - 📚Book
title: {{title}}
subtitle: {{subtitle}}
author: {{author}}
category: {{category}}
publisher: {{publisher}}
publishDate: {{publishDate}}
pageCount: {{pageCount}}
isbn: {{isbn}}
description: {{description}}
cover: {{coverUrl}}
localCover: {{localCover}}
read: false
rating: N/A
AudioBook: N/A
EBook: N/A
source: {{source}}
sourceUrl: {{sourceUrl}}
created: {{date:YYYY-MM-DD HH:mm:ss}}
link:
  - {{libraryLink}}
---
# Summary:

# Notes:

# Quotes:
```

### Template variables
| Variable | Contents |
| --- | --- |
| `{{title}}`, `{{subtitle}}` | |
| `{{author}}` | All authors: a list property in frontmatter, "A, B" in the body |
| `{{category}}` | Genres/categories (same list behavior) |
| `{{publisher}}`, `{{publishDate}}`, `{{year}}` | |
| `{{pageCount}}` | |
| `{{isbn10}}`, `{{isbn13}}`, `{{isbn}}` | `{{isbn}}` = ISBN-13 if known, else ISBN-10 |
| `{{description}}` | |
| `{{language}}` | e.g. `eng` |
| `{{coverUrl}}` | Remote cover image URL |
| `{{localCover}}` | Link to the saved cover, `[[path]]`; empty if none |
| `{{localCoverPath}}` | Plain path to the saved cover |
| `{{source}}`, `{{sourceUrl}}` | Source name and the book's page there |
| `{{libraryLink}}` | `[[Library MOC]]` (follows the MOC name setting) |
| `{{date}}`, `{{time}}`, `{{date:FORMAT}}` | Creation time; Moment.js formats |

Book Search compatibility aliases, so an old Book Search template mostly works: `{{authors}}`,
`{{categories}}`, `{{totalPage}}`, `{{localCoverImage}}` (plain path, as in Book Search).

---

## 7. Library MOC

- Created as `{root}/{MOC name}.md` on first use if missing. **Never overwritten.**
- Command **"Regenerate library note"** (also a settings button), with a confirmation window. It replaces
  **only** the generated block between two markers, so your banner, tags, and text stay. If the note has no
  markers (like your current `LIbrary MOC.md`), the confirmation offers to **add** the table at the end;
  nothing of yours is deleted.
- Dataview check when the MOC is created or regenerated, plus a status line in settings: *"The table in
  Library MOC needs the Dataview plugin. Install and enable it from Community plugins."* (or "…is installed
  but turned off. Enable it in Community plugins."). The plugin never installs anything.

### Generated query (with default settings; FROM follows the folder settings)
````markdown
%% library-notes:start (generated: "Regenerate library note" replaces only this part) %%
```dataview
TABLE WITHOUT ID
  choice(localCover, embed(link(regexreplace(string(localCover), "^!?\[\[|\|.*$|\]\]$|^/", ""), "80")), "") AS Cover,
  default(title, file.name) AS Title,
  author AS Author,
  category AS Category,
  file.link AS Note,
  choice(read, "🟩", "🟥") AS Read,
  AudioBook AS AudioBook,
  EBook AS EBook
FROM "Library/Books"
SORT default(title, file.name) ASC
```
%% library-notes:end %%
````

What the Cover column does, in plain words: take whatever `localCover` holds (new link, old text path, or
`![[…]]`), turn it into text, strip `[[`, `]]`, `!`, `|name`, and a leading `/`, turn that back into a link at
width 80 px, and embed it as an image. If `localCover` is empty, show nothing. Every function used accepts any
value, so no row can error and silently disappear. Your old `/Book Title.jpg` becomes `Book Title.jpg`, which
Obsidian finds in `Synced Notes/Assets/`.

- `AudioBook`/`EBook` columns kept (decided). Read column uses only `read` (decided: old `Status` ignored).

### Read-status toggle
Command **"Toggle read status"**, available only when the open note is in the Books folder (`checkCallback`).
Flips `read` (missing → `true`) with `FileManager.processFrontMatter`, which only touches that one property, and
shows "Marked as read" / "Marked as unread". Works on your old notes too (adds `read`).

---

## 8. Folders and paths
- Settings: **Library folder** (default `Library`), **Books subfolder** (`Books`), **Covers subfolder**
  (`Covers`), **Library note name** (`Library MOC`).
- Every path goes through `normalizePath`. Nested roots work: `Synced Notes/Library` → books in
  `Synced Notes/Library/Books`, FROM `"Synced Notes/Library/Books"`.
- Missing folders are created on first use (nested too). Nothing is ever renamed, moved, or deleted.
- For your real library you'd set: Library folder `Synced Notes/Library`, Books `All Books`, Covers `Covers`,
  note name `LIbrary MOC` (or rename the file yourself).

---

## 9. Settings layout

No heading (general):
- Library folder · Books subfolder · Covers subfolder · Library note name
- Template file · Create an editable template (saves the built-in one to `Templates/Book note.md`)
- Open note after creating it (on)
- Library note: **Regenerate** button · Dataview status line

**Sources**
- Default source (dropdown: only configured sources)
- Try the next source if the default one fails or finds nothing (on)
- Preferred language (`en`; Open Library `lang`, Google `langRestrict`)

**Google Books**
- API key (stored in Obsidian's keychain) · how to get a free key · **Check API key** button

**Hardcover**
- **Sign in with Hardcover** / **Sign out** (device flow) · **Check connection** button
- Note that Hardcover's API is in beta and may change

Google Books and Hardcover don't appear in the source dropdown or the search window until a key/token is set.

---

## 10. Error messages (all shown in plain language, in the search window when possible)
Offline · can't reach the source · timed out · rate limited ("try again in N minutes" from `Retry-After`) ·
server error · unreadable response ("Hardcover's API may have changed") · invalid Google API key · Hardcover
token invalid/expired/missing scope · no results · cover download failed (note still created) · template file
missing (built-in used) · Dataview missing (MOC notice).

---

## 11. Decisions (answered 2026-10-05)
| # | Decision |
| --- | --- |
| Q1 | Name **Library Notes**, ID **`library-notes`** (repo name / visibility confirmed in Phase 5) |
| Q2 | **No contact email for now**: User-Agent `LibraryNotes/<version> (+repo URL)`, requests spaced 1 s apart. Dedicated address: future release |
| Q3 | Keep **AudioBook / EBook** columns; template default `N/A` |
| Q4 | New notes use **`publishDate`, `pageCount`, `isbn`** |
| Q5 | **`read`** true/false; table ignores old `Status` |
| Q6 | Hardcover in 1.0 via **"Sign in with Hardcover"** (device flow); user creates a free account before that milestone |
| Q7 | Default MOC name **`Library MOC`** |
| Q8 | `localCover` stored as **`"[[…]]"`** |
| Q9 | Best-matching edition automatically in 1.0; **"choose an edition" step in a future release** |
