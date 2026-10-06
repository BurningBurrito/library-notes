# Status: Library Notes (`library-notes`)
**Current phase:** Phase 2 — Scaffold: **complete** (one check-only fix to confirm on the next run);
next: Phase 3
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

## In progress
- [ ] Next run of the developer checks should show 31/31 (check-only fix)

## Next
- [ ] Phase 3: build the approved design (milestones: core + Open Library → notes/covers/MOC/read toggle →
      Google Books → Hardcover sign-in, after the user creates a free Hardcover account)
- [ ] Phase 4: test · Phase 5: GitHub repo · Phase 6: release and submission

## Future releases (not in 1.0)
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
- **Hardcover in 1.0 via "Sign in with Hardcover"** (OAuth device flow, scope `read:catalog:search`) (user).
  User creates a free Hardcover account before that milestone and registers the developer app
- Write all code fresh; reuse only Dictionary Notes code (user's own). Why: Obsidian's fork policy
- Covers by Open Library **Cover ID** with `?default=false`, plus image validation
- Book URL goes in a new `sourceUrl` property. Why: the user's `link` property is a back-link to the MOC
- MOC regeneration replaces only a marked block. Why: never lose the user's banner/tags/text
- Developer checks behind a build-time flag rather than a hidden setting. Why: they never ship to users
- Docs use generic examples ("Book Title"), not titles from the user's library. Why: the repo will be public

## Open questions / blockers
- Phase 4: testing Google Books needs a free Google Cloud API key; Hardcover needs the user's account
- Before Phase 5 push: confirm DESIGN.md and STATUS.md may be public (they describe the user's folder and
  property names, no personal data)
- Risk: mobile not testable here (isDesktopOnly will be false)
- Risk: Hardcover API is in beta and changes often (isolated module, defensive parsing)
