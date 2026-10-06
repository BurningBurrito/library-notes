# Status: Library Notes (`library-notes`)
**Current phase:** Phase 6 — Release and submission: **1.0.0 published; submitted** (waiting for the directory's re-scan)
**Last updated:** 2026-10-05

## Done

### Phase 1 — Research and design (complete)
- [x] Reviewed Dictionary Notes (1.2.0) and anpigon/obsidian-book-search-plugin (MIT, © 2020 Jake Runzer;
      last commit 2024-10-16). No code copied from Book Search (Obsidian fork policy); credited as inspiration
- [x] Read the real vault's library **read-only**: `link` = back-link to the MOC; `localCover` = unresolvable
      plain paths (`/Book Title.jpg`, images actually in `Synced Notes/Assets/`); AudioBook/EBook use 🟩/🟥/N/A
- [x] Verified live/in source: Open Library (search, works, editions, covers, `default=false` → 404, limits),
      Google Books (key required), Hardcover (OAuth device flow, `read:catalog:search`), Dataview 0.5.68/0.5.70
      (`[[…]]`/`![[…]]` parsing, `embed(link(…))`, erroring rows dropped), Obsidian rules and submission
- [x] DESIGN.md written; user answered all decisions (DESIGN.md §11)

### Phase 2 — Scaffold
- [x] Official obsidian-sample-plugin (07ceb81, 2026-08-02) compared with Dictionary Notes: Dictionary Notes =
      sample + test-vault copy in esbuild, lint ignores, tag/manifest check and private-repo attestation guard in
      release.yml, Node 22/24 + tests + "lint without moment types" in lint.yml. Config taken from Dictionary
      Notes; sample's AGENTS.md and sample code not included
- [x] Project files: manifest (`library-notes`, 0.1.0, minAppVersion 1.13.0), package.json, versions.json `{}`
      (only released versions go in), MIT LICENSE, .gitignore (+ `.claude/`, `test-vault/`), workflows, styles.css
- [x] Build-time flag `DEV_BUILD` (esbuild `define`): developer checks only in `npm run dev`; verified the
      release `main.js` (702 bytes) contains none of that code
- [x] `npm run build`, `npm run lint`, and lint without moment types: all clean. Note: npm 12 blocks esbuild's
      postinstall script; the build works without it (platform binary comes from the optional dependency)
- [x] Attribution off for this project: `.claude/settings.local.json` (`commit: ""`, `pr: ""`,
      `sessionUrl: false`), same as the user-level settings; `.claude/` is gitignored
- [x] Test vault `test-vault/` (gitignored): Hot Reload 0.3.1 (upstream 2026-07-05), Dataview 0.5.70 release
      (its manifest says 0.5.68), dev build of the plugin with `.hotreload`
- [x] Test content: **copies** of 4 real notes (`/Title.jpg` and `/Assets/Title.jpg` styles) + their covers +
      a copy of the current MOC; new-format note with a real Open Library cover; test notes for `![[…]]`,
      `|alias`, empty cover, no property, missing image file; `Checks/Cover table.md` with the proposed query
- [x] Developer check command (dev builds only): User-Agent echo (with and without our header), Open Library
      cover found/missing through requestUrl, Dataview table inspected row by row (image loaded? rows dropped?)
- [x] git: local repo, identity = GitHub noreply address (as in Dictionary Notes), first commit (local only)

- [x] First run of the developer checks (user, 2026-10-05 21:23): **15/15 passed**. Custom User-Agent arrives
      unchanged at httpbin.org (default would be Chrome/Electron with `obsidian/1.13.7`); Open Library cover via
      archive.org redirect = 200, image/jpeg, 46,167 bytes, real JPEG; missing cover = 404; all old-style
      covers render (`/Title.jpg`, `/Assets/Title.jpg`), new `[[…]]`, `![[…]]`, `|alias`; 10/10 rows (none dropped)
- [x] User feedback from that run: (1) the missing-image row shows "80"; (2) the table is wider than the note
      and needs sideways scrolling. Cause (1): Dataview falls back to the embed `![[…|80]]` when the file is
      missing; Obsidian shows its label. Cause (2): Obsidian's readable line length (`--file-line-width`, 700px)
- [x] Fix: MOC note gets `cssclasses: library-notes-moc`; `styles.css` makes it full pane width and hides image
      embeds in its Dataview tables (found covers are `<img>`, so only missing ones are hidden). Developer check
      now also measures table vs pane width and the visible text in no-cover cells. DESIGN.md §7 updated

- [x] Second run (21:46): "80" still reported and "table fits" passed at 0px width. Both were **check bugs**: the
      check measured the hidden editor copy of the table (a note's tab renders Dataview in both views; on hidden
      elements `innerText` ignores CSS). Check rewritten to inspect reading view and Live Preview separately and
      only tables on screen
- [x] Third run (user, 2026-10-05 21:52): **30/31 passed** in both views. Missing-cover cell empty; table 1500px in
      a 1576px pane (normal limit 700px), no sideways scrolling; 10/10 rows; all covers. The one ❌ ("class
      missing", reading view) was the check looking at the wrapper instead of `.markdown-preview-view` (the
      1500px width proves the class works). Check fixed (21:55); confirm 31/31 on the next run
- [x] User: "the cover table looks amazing" — this is the table the Library MOC will get
- [x] User asked whether their existing MOC (copy in the test vault, old query) will change: designed
      "Regenerate library note" for hand-made MOCs (DESIGN.md §7): replaces their single Dataview table on
      confirmation, keeps properties/banner/text, adds the full-width class

### Phase 3 — Build
- [x] Milestone 1 (Open Library end to end), local commit:
  - core: BookError, requestUrl wrapper (User-Agent on every request, 15 s timeout, offline/429/5xx), per-service
    throttle (Open Library 1 request/s: no contact email), 30-min in-memory cache for searches and details,
    template engine (numbers stay numbers, ISBNs stay text), nested folder creation, library paths from settings
  - covers: download, accept only real image bytes > 1 KB (JPEG/PNG/WebP/GIF), save with `vault.createBinary`,
    reuse an existing file, name `Title - ISBN-or-ID.ext`
  - Open Library source: search (ISBN detected → exact edition), details (work: description, subjects; edition:
    pages, date, publisher, ISBNs), description cleanup, date normalization, `?default=false` covers
  - Fixed while smoke-testing live: keyword searches used Open Library's "best-matching" edition (Project Hail
    Mary → a Large Print edition, 794 pages, while showing the standard cover). Now the edition that owns the
    work's main cover (`cover_edition_key`) is used, so cover, pages, and ISBN match; ISBN searches keep the exact
    edition. Genres ranked by how often subjects mention them (The Hobbit was "Science fiction, Fantasy,
    Horror", now "Fantasy, Children's, Fiction")
  - source registry + fallback order (only Open Library so far); search window (source buttons ready), results
    with cover thumbnails, Open existing / Create copy / Cancel for duplicates
  - library note: created on first use (never overwritten), query from folder settings, full-width class;
    "Regenerate library note" (command + settings button) with confirmation: markers → replace block; one
    hand-made Dataview table → replace it or add at the end; otherwise add at the end. Smoke-tested on the copy
    of the user's MOC: plan "single-table", properties/banner kept, second run changes nothing
  - read toggle (`checkCallback`: only in the Books folder; `processFrontMatter`)
  - settings: folders, library note name, template + editable copy, open after create, Dataview status line,
    regenerate, default source, fallback, language, Open Library check button
  - build, lint, lint without moment types: clean; release main.js 29,978 bytes, no developer-check code

- [x] Milestone 1 tested by the user ("looks good"). Files show: notes for Dirk Gently, Dune (default `Library/`),
      The Long Dark Tea-Time (in `Synced Notes/Library/All Books`), covers saved with distinct names, notes in the
      planned format. Two problems found in the files:
  - **A second MOC was created**: library note name stayed `Library MOC`, the user's file is `LIbrary MOC.md`
    (Linux is case-sensitive), so `Synced Notes/Library/Library MOC.md` was created beside it and "Replace that
    table" never ran. **Fix:** the library note is found regardless of capitals (same folder); a notice says
    which file is used; new notes link to its real name. Removed the plugin-made duplicate from the test vault
  - **Curly vs straight apostrophes**: Open Library's `Dirk Gently’s` ≠ the user's `Dirk Gently's.md`, so the
    duplicate check would miss it. **Fix:** duplicates matched ignoring capitals, quote and dash styles, extra
    spaces (Books folder and subfolders); new file names use straight apostrophes
- [x] Milestone 2 (Google Books), local commit:
  - key in Obsidian's keychain (SecretComponent; settings store only the secret's name), sent in the
    `X-goog-api-key` header (verified live: Google reads the key from the header), never in URLs
  - search (ISBN → `isbn:`), details from the single-volume answer (full description HTML → text, largest
    cover, `https`, no page curl), categories through the same genre names as Open Library
  - plain-language errors from Google's reason codes: invalid key, Books API not enabled, key restricted to
    other APIs, daily quota used up (verified against Google's real answers)
  - Google Books appears in the source dropdown and as a search-window button only when a key is set
  - smoke-tested: all fallback cases (fails → next source with notice; fallback off → default's error; empty →
    next; offline → no fallback; nothing anywhere → one message); name matching; file names
  - developer check: Google Books search + details with the user's key, writing only parsed fields

- [x] Milestone 2 live test **skipped at the user's request** (2026-10-06: "assume it works"; the Google Books test
      goes on the future list). Not verified in Obsidian: Google Books with a real key (real-data parsing, cover
      sizes, source buttons, fallback notice), and the two Milestone 1 fixes in the app. Logic is smoke-tested
- [x] Milestone 3 (Sign in with Hardcover), local commit:
  - checked first: discovery document (device, token with refresh_token, revoke endpoints; `read:catalog:search`
    scope); `books` schema fields (title, subtitle, description, pages, release_date/year, slug, image.url,
    contributions.author.name, default_physical_edition isbn/publisher); Obsidian's keychain stores secrets
    encrypted with the OS (Electron safeStorage) in app storage, **not in vault files**, so it never syncs:
    each device signs in on its own (required: Hardcover revokes a renewal token that's used twice)
  - `src/sources/hardcover/` (isolated): auth (device flow, tokens in one keychain entry, renewal 5 min early,
    one renewal at a time, no automatic retry of a renewal, sign out = revoke + forget), GraphQL client (401 →
    renew once and retry; plain messages for missing scope, 408, 429, GraphQL errors = "API may have changed"),
    source (search → ids, then documented `books` fields; genres read from search results only if present;
    date, pages, ISBN, publisher from the same edition)
  - sign-in window (code, open link, copy code, waits, closes when approved, cancel stops polling); settings:
    Sign in / Check connection / Sign out
  - `HARDCOVER_CLIENT_ID` is empty until the user registers the app; until then the settings say sign-in isn't
    available and Hardcover never appears as a source
  - smoke-tested with simulated answers (renewal, concurrent renewal, rejected renewal, 401 retry, schema
    change, rate limit, missing scope, result order and mapping, device-flow polling, denial, cancel, sign out)
    and one real call (device endpoint without a client ID → "invalid_client")
  - sentence-case lint: reworded strings rather than adding brand exceptions (Obsidian's review uses defaults)

- [x] **Hardcover moved to a future release** (user, 2026-10-06: "skip this too, we'll add it to a future
      release"). The finished work is kept on the local branch **`feature/hardcover`** (commit 6367a5d); `main`
      reverts its code (1.0 has no Hardcover code; release main.js back to 35,897 bytes). The branch only needs
      the app's client ID and a sign-in test

### Phase 4 — Test
- [x] User (2026-10-06): "skip the manual stuff. assume it works". Manual test list not run; covered in the
      automated suite as far as possible (below)
- [x] Automated suite, `npm test`: **67 tests, all pass, offline, ~0.2 s** (esbuild bundles + Node test runner;
      stand-ins for Obsidian, an in-memory vault with real YAML frontmatter edits, scripted windows; Open Library
      answers recorded from the live service, `npm run test:record`). Suites:
  - render (valid YAML for any text, lists, numbers, ISBNs as text, unknown variables kept, built-in template's
    exact properties, Book Search variable names)
  - notes (file names, straight apostrophes, loose name matching, subfolders, nested folder creation, file in
    the way, library paths for nested and root folders)
  - settings (defaults, repair of bad saved values)
  - covers (image bytes, 404/403/placeholder GIF/HTML = no cover, 503/network/offline errors, reuse not overwrite)
  - library (query from settings, columns, markers, regenerate: markers / single hand-made table / several /
    dataviewjs; capitals; never overwritten; cssclasses kept and added; Dataview missing / turned off notices;
    read toggle on books only, leaves other properties)
  - sources (Google Books: key in header not URL, parsing, HTML descriptions, cover clean-up, genres, Google's
    real error answers; fallback: fails → next with reason, empty → next, fallback off, offline, nothing
    anywhere, unconfigured default; cache answers recent searches offline)
  - open-library (recorded: search + User-Agent + language, cover's edition not large print, ISBN = exact
    edition, genres by mentions, nonsense = none, 503; date/ISBN/description/genre clean-up)
  - flow (recorded, whole create-note path: note + cover + library note + open; ISBN skips list; duplicates:
    open existing / create copy (cover reused) / cancel; curly vs straight apostrophe; subfolder + capitals;
    nested library folder with existing `LIbrary MOC` unchanged; no cover / failed download; details failure;
    custom and missing template; offline and no results shown in the search window)
- [x] Deliberate breakage of 12 behaviors: 11 caught. Missed: "fall back even when offline" (equivalent: every
      source checks the connection first, same message, no requests). First run also missed "duplicate check
      by exact name" → added the subfolder/capitals test, now caught
- [x] Found by the tests: the 30-minute cache made two tests pass for the wrong reason → `clearCache()` (also
      called when the plugin is turned off) and cleared before each test; "Personal Growth" now counts as Self-help
- [x] Fixtures: 22 Open Library responses (2 hosts), no personal data (scan matched only base64 image bytes)
- [x] `npm audit`: 3 moderate in `moment` via the `obsidian` types / lint plugin (dev only, not bundled; Obsidian
      provides moment). `npm audit fix --force` would downgrade the Obsidian API to 0.14.5: not applied
- [x] build, lint, lint without moment types: clean; release main.js 35,946 bytes, no developer or test code

**Never checked in the running Obsidian app** (manual tests skipped; logic covered by the automated suite):
Google Books with a real key; source buttons with two sources; fallback notice on screen; settings page after
Milestone 2 (Google Books section, key field, check button); Regenerate on the copy of the user's MOC; the
Dataview-off notice; the duplicate window on screen; offline message on screen; mobile (isDesktopOnly false)

### Phase 5 — GitHub repo
- [x] Already in place from Phase 2: LICENSE (MIT), .gitignore (test-vault, .claude, node_modules, main.js),
      release.yml (tag = manifest version, build, attestation on public repos, **draft** release with main.js,
      manifest.json, styles.css), lint.yml (Node 22/24: build, lint, `npm test`, lint without moment types)
- [x] README written for directory visitors: features, installation, usage, which edition, folder structure,
      library note + Dataview requirement + generated query + regenerating, settings, Google Books API key steps,
      template variables + built-in template, coming from Book Search, network use and privacy (required
      disclosure: services, what's sent, account needed for Google Books), content and licensing, troubleshooting,
      development, releasing, credits (Book Search inspiration, no code; sample plugin; Open Library; Google Books;
      Dataview). Every setting name, command name, and quoted message checked against the code; no placeholders
- [x] Before the first push: git history has no attribution lines (0); pattern scan for personal data and keys
      clean (files and all commits); gitleaks 8.30.1 (checksum verified): no leaks in 8 commits or the working tree
- [x] User decisions (2026-10-06): repo **`BurningBurrito/library-notes`** (not `obsidian-library-notes`),
      **public**, DESIGN.md and STATUS.md **published**, create the repo and push `main`. Repo URL updated in
      README, the User-Agent, developer checks, and tests
- [x] Security check before the push (user: "no api keys and the such should get pushed"), all clean:
  - tracked files listed; not tracked: data.json, main.js, .env, test-vault/, .claude/, node_modules/, tests/.build/
  - gitleaks 8.30.1: no leaks in all commits, in the exact files to be pushed (git archive), or inside the gzipped
    test recordings; no personal data or key-like strings in any commit (only the fake `TEST-KEY` in tests)
  - code: no eval/Function/innerHTML/outerHTML/insertAdjacentHTML/Node or Electron APIs; the Google Books key is
    read in one place and sent only in the `X-goog-api-key` header to Google (never in URLs, files, or logs);
    logs contain only unexpected errors (URLs never hold the key)
  - release build contacts only the README's disclosed hosts; bundle = 23 plugin source files, 0 from
    node_modules, only `obsidian` external; no developer-check code (26 bytes = an import line, no strings)
  - CI: release.yml runs on tags only with the built-in token; lint.yml now declares read-only permissions
  - `npm audit`: moment (dev only, not bundled), as before
- [x] Created **https://github.com/BurningBurrito/library-notes** (public; description = manifest description; topics
      obsidian, obsidian-plugin, obsidian-md, books, book-notes, open-library, google-books, dataview, reading-list)
- [x] Pushed `main` only (11 commits, 0 attribution lines; `feature/hardcover` stays local). CI run 37415679693
      on c8889af: **success** on Node 22 and 24 (build, lint, 67 tests, lint without moment types)

### Phase 6 — Release and submission
- [x] Re-checked the docs on GitHub (2026-10-06): obsidian-developer-docs latest commit c56c7e7 (2026-08-10); release
      and submission pages last changed 2026-08-07, unchanged since Phase 1. obsidian-releases has no
      validate-plugin-entry workflow any more (only mirror-community-json, plugin-stat): submission is via
      community.obsidian.md. Process: sign in with an Obsidian account → connect GitHub → Plugins → New plugin
      (repo URL, owner, agree to the developer policies and to keep supporting it) → automated review (manifest,
      release assets, source code, build verification) → Edit listing (icon, short/long description,
      categories, payment type, screenshots 1200×800)
- [x] minAppVersion 1.13.0 confirmed: newest API used is @since 1.13.0 (setDestructive, declarative settings)
- [x] ID `library-notes` and name still free (8,447 listed, 175 removed)
- [x] Version **1.0.0** (user): `npm version 1.0.0` → commit 1f4ff38 "Release 1.0.0" (package, lock, manifest,
      versions.json `"1.0.0": "1.13.0"`), annotated tag `1.0.0` (noreply tagger); 0 attribution lines
- [x] Local release build after `npm ci` (for comparison): main.js 35,937 bytes, sha256 be2c0ab9…; 67/67 tests
- [x] Pushed main and tag 1.0.0 (user approved). Release workflow run 37416075548: **success** (tag = manifest
      check, build, attestation, draft)
- [x] Draft verified: 3 assets (main.js 35,937 / manifest.json 361 / styles.css 1,630 bytes), **all
      byte-identical to the local build**; manifest = tag's manifest (1.0.0, minAppVersion 1.13.0); attestation
      verified: main.js + styles.css digests match, signed by release.yml@refs/tags/1.0.0, commit 1f4ff38,
      github-hosted runner
- [x] Requirements check: description 135 chars, ends with a period, no emoji; no fundingUrl; isDesktopOnly false
      (no Node/Electron APIs in the build); command IDs without the plugin ID; no sample code; README + LICENSE

- [x] User submitted at community.obsidian.md before the release was published; the review said "No release
      matches your manifest version" (the release was still a draft, invisible to the scanner; tag `1.0.0` was
      already correct, no "v"). Taken as the go-ahead to publish
- [x] **Published 1.0.0** (2026-10-06 05:00 UTC) with the release notes shown in chat, marked latest. Checked from
      outside: public latest-release API = tag 1.0.0 (not draft/pre-release; a first check hit GitHub's 60 s
      cache of the earlier 404); public download URLs for main.js, manifest.json, styles.css return 200 and are
      byte-identical to the local build

## In progress
- [ ] User: on community.obsidian.md, open the entry → **⋯ → Check for new releases** (or **Request review**) so the
      scan runs now; then share the review results (errors / warnings / recommendations)
- [ ] Then: Edit listing (long description drafted in chat, categories, payment type Free)

## Next
- [ ] After submission: fix anything the automated review flags (new patch release), then Edit listing

## Future releases (not in 1.0)
- [ ] **Sign in with Hardcover** — code done on branch `feature/hardcover` (commit 6367a5d, also in `main`'s
      history; bring it back by reverting the commit "Leave Hardcover out of 1.0"). To finish: user creates a free
      Hardcover account, registers the app at hardcover.app/account/developer-apps/new (type "Mobile, desktop,
      or CLI", name "Library Notes", scope `read:catalog:search` only, Device Authorization Grant on, no
      redirect URIs), sends the client ID; set `HARDCOVER_CLIENT_ID`; test sign-in, search, sign out; README
- [ ] Google Books live test in Obsidian with a real key (user, 2026-10-06: skipped for now, "assume it works")
- [ ] Optional "choose an edition" step after picking a book (user, 2026-10-05)
- [ ] Contact email in the Open Library User-Agent, from a dedicated address (user, 2026-10-05). Allows 3 req/s
      instead of 1 and lets Open Library reach the developer. One-line change

## Decisions made
- Name **Library Notes**, ID **`library-notes`** (user). ID can never change after release
- Keep AudioBook / EBook columns, `N/A` in the template (user)
- New notes use `publishDate`, `pageCount`, `isbn` (user); old notes keep their names untouched
- Read status: `read` true/false; table ignores old `Status` (user)
- Default MOC name `Library MOC` (user); `localCover` stored as `"[[…]]"` (user)
- Best-matching edition automatically in 1.0 (user)
- **No contact email for now** (user): User-Agent = plugin name + repo URL; Open Library treated as
  unidentified, so requests are spaced 1 s apart
- Hardcover via "Sign in with Hardcover" (OAuth device flow, scope `read:catalog:search`) (user); built, then
  **moved to a future release** (user, 2026-10-06), kept on branch `feature/hardcover`
- Write all code fresh; reuse only Dictionary Notes code (user's own). Why: Obsidian's fork policy
- Covers by Open Library **Cover ID** with `?default=false`, plus image validation
- Book URL goes in a new `sourceUrl` property. Why: the user's `link` property is a back-link to the MOC
- MOC regeneration replaces only a marked block. Why: never lose the user's banner/tags/text
- Developer checks behind a build-time flag rather than a hidden setting. Why: they never ship to users
- Docs use generic examples ("Book Title"), not titles from the user's library. Why: the repo will be public

## Open questions / blockers
- Minor (development tool only): the developer checks were last run at 30/31; the one ❌ was fixed in the check
  itself (21:55, 2026-10-05) and hasn't been re-run since
- Phase 4: testing Google Books needs a free Google Cloud API key
- Before Phase 5 push: confirm DESIGN.md and STATUS.md may be public (they describe the user's folder and
  property names, no personal data)
- Risk: mobile not testable here (isDesktopOnly will be false)
