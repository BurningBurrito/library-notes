# Library Notes

Search for books, save each one as a note with its cover, and keep a library overview note. Works with Open Library without an API key.

Type a title, an author, or an ISBN, pick the book, and Library Notes creates a note from your template, saves the cover image in your vault, and lists the book in a library note with a table of all your books.

## Features

- **No setup needed:** searches [Open Library](https://openlibrary.org) out of the box, with no account or API key.
- **Optional Google Books:** add your own free API key to search Google Books too, and switch between sources in the search window.
- **Backup source:** if your default source fails or finds nothing, Library Notes can try the next one and tells you it did.
- **Covers saved in your vault:** each book's cover is downloaded once into a covers folder, so your notes show it offline. Books without a cover still get a note.
- **A library note with a table of your books:** cover, title, author, category, a link to the note, and whether you've read it (🟩 / 🟥). It's created the first time you add a book and never overwritten.
- **Read status:** one command marks the open book as read or unread.
- **Notes from templates:** use the built-in template or your own, with the properties you choose.
- **Safe with existing notes:** if a book already has a note, you choose to open it, create a copy, or cancel. Nothing is ever overwritten, renamed, or deleted.
- **Clear errors:** you get a plain message when you're offline, nothing is found, a service is busy or down, or your API key is wrong.

Requires Obsidian 1.13.0 or later. The library table needs the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin.

## Installation

### From Community plugins

1. Open **Settings → Community plugins** and turn off **Restricted mode** if it's on.
2. Select **Browse**, search for **Library Notes**, then select **Install** and **Enable**.
3. For the library table, also install and enable **Dataview**.

### Manually

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/BurningBurrito/obsidian-library-notes/releases/latest).
2. In your vault folder, create the folder `.obsidian/plugins/library-notes/` and copy the three files into it.
3. Reload Obsidian, then enable **Library Notes** in **Settings → Community plugins**.

## Usage

Select the library icon in the ribbon, or open the command palette (<kbd>Ctrl/Cmd</kbd>+<kbd>P</kbd>) and run one of these commands:

| Command | What it does |
| --- | --- |
| **Library Notes: Create new book note** | Search for a book and create its note. |
| **Library Notes: Toggle read status** | Mark the open book note as read or unread. Available when a note in your books folder is open. |
| **Library Notes: Regenerate library note** | Rebuild the library table, or add it to a library note you made yourself. You confirm first. |

### Adding a book

1. Run **Create new book note**. If you have text selected in a note, it's used as the search text.
2. Type a title, an author, or an ISBN (with or without dashes) and press <kbd>Enter</kbd>. If you've set up Google Books, choose the source with the buttons at the top.
3. Choose a book from the list. The list shows covers, authors, and years, and you can type to filter it. An ISBN usually finds one exact book, and the list is skipped.
4. The note is created in your books folder and opened, with the cover saved in your covers folder.

If a note for that book already exists (small differences such as capital letters or ’ vs ' don't count), you're asked whether to **Open existing**, **Create copy** (such as `Dune 2`), or **Cancel**.

### Which edition?

Open Library groups all editions of a book. When you search by title or author, the note describes the edition whose cover is shown in the list, so the cover, page count, and ISBN belong to the same book. When you search by ISBN, the note describes exactly that edition.

### Tips

- Assign hotkeys in **Settings → Hotkeys** by searching for "Library Notes".
- To hide the ribbon icon, right-click the ribbon and turn it off. The commands keep working.
- To change what a note contains, select **Create an editable template** in the settings and edit `Templates/Book note.md`.

## Folder structure

Library Notes keeps everything in one library folder, which can be inside another folder (such as `Synced Notes/Library`):

```
Library/
├── Library MOC.md   ← the library note, with the table of all your books
├── Books/           ← one note per book
└── Covers/          ← cover images
```

All four names are settings. Missing folders are created the first time you add a book. Existing folders and notes are never renamed, moved, or deleted.

Cover images are named after the book and its ISBN (or the source's ID when there's no ISBN), such as `Dune - 9780441013593.jpg`, so two books with the same title never share a cover.

## The library note and Dataview

The library note shows a table of every note in your books folder:

| Cover | Title | Author | Category | Note | Read | AudioBook | EBook |
| --- | --- | --- | --- | --- | --- | --- | --- |

The table is a [Dataview](https://github.com/blacksmithgu/obsidian-dataview) query, so **Dataview must be installed and enabled** for it to show. Library Notes doesn't install it for you; if it's missing or turned off, you get a notice explaining what to do, and the settings show its status.

The library note is created with `cssclasses: library-notes-moc`, which makes that note use the full width of the window so the table fits. To keep the normal width, remove that class from the note's properties.

The generated query, with the default folders:

````markdown
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
````

The cover column shows covers stored in any of these forms: a link (`"[[Covers/Dune.jpg]]"`, what Library Notes writes), an embed (`"![[Covers/Dune.jpg]]"`), or a plain path (`/Dune.jpg`, as written by some other book plugins). If a cover image file is missing, the cell is left empty.

### Regenerating

**Regenerate library note** rebuilds the table from your current folder settings. It always asks first, and only changes the table:

- In a library note that Library Notes created, it replaces the table between its `%% library-notes:start %%` and `%% library-notes:end %%` markers.
- In a library note you made yourself that has one Dataview table, you can **Replace that table** or **Add at the end**.
- Otherwise, the table is added at the end.

Your properties (such as a banner) and any other text stay as they are. If your library note's name differs from the setting only in capital letters (`LIbrary MOC` and `Library MOC`), Library Notes uses your note instead of creating a second one.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Library folder | `Library` | Holds the library note and the books and covers folders. Can be inside another folder. |
| Books folder | `Books` | Inside the library folder. One note per book. |
| Covers folder | `Covers` | Inside the library folder. Cover images are saved here. |
| Template file | _(empty)_ | A note to use as the template. Leave empty to use the built-in template. |
| Create an editable template | | Saves the built-in template to `Templates/Book note.md` and selects it, so you can change it. |
| Open note after creating it | On | Opens the new note in the current tab. |

**Library note**

| Setting | Default | Description |
| --- | --- | --- |
| Library note name | `Library MOC` | The overview note in the library folder. |
| Dataview | | Shows whether Dataview is installed and enabled. |
| Regenerate library note | | Same as the command. |

**Sources**

| Setting | Default | Description |
| --- | --- | --- |
| Default source | Open Library | Where searches go first. Google Books appears once its API key is set. |
| Try the next source if the default one fails or finds nothing | On | Uses your other sources, in order. A notice says when another source answered. |
| Preferred language | `en` | Two-letter code. Open Library shows editions in this language first; Google Books shows only books in this language. Leave empty for no preference. |
| Open Library → Check | | Makes one small request to check that Open Library can be reached. |

**Google Books**

| Setting | Default | Description |
| --- | --- | --- |
| API key | | Your Google Books API key. It's kept in Obsidian's keychain, not in the plugin's settings file. |
| Check API key | | Makes one small request to Google Books with your key. Shown once a key is set. |

### Getting a Google Books API key

Google Books no longer answers requests without a key. A key is free:

1. Go to the [Google Cloud console](https://console.cloud.google.com/) and sign in with a Google account. Create a project if you don't have one.
2. Open **APIs & Services → Library**, search for **Books API**, and select **Enable**.
3. Open **APIs & Services → Credentials**, select **Create credentials → API key**, and restrict the key to the **Books API**.
4. Copy the key. In Obsidian, open **Settings → Library Notes → Google Books → API key**, and add it.
5. Select **Check API key**.

Google sets a daily limit on requests for each key; if you reach it, Library Notes says so and you can search Open Library instead.

## Templates

A template is a normal note containing `{{variables}}`. When a book note is created, each variable is replaced with information about the book. Variables Library Notes doesn't recognize are left as they are, so syntax from other template plugins keeps working.

When a variable is the whole value of a property, such as `author: {{author}}`, Library Notes formats it so the properties stay valid: lists become list properties, page counts become numbers, and text is quoted when needed. Don't add your own quotes around these variables.

| Variable | Contents |
| --- | --- |
| `{{title}}`, `{{subtitle}}` | Title and subtitle |
| `{{author}}` | Authors (a list property; "A, B" in the note body) |
| `{{category}}` | Genres, up to three, such as `Science fiction` (a list property) |
| `{{publisher}}` | Publisher |
| `{{publishDate}}` | Publication date, as precise as the source knows: `2021-05-04`, `2021-05`, or `2021` |
| `{{year}}` | Publication year |
| `{{pageCount}}` | Number of pages |
| `{{isbn}}` | ISBN-13, or ISBN-10 if there's no ISBN-13 |
| `{{isbn10}}`, `{{isbn13}}` | Each ISBN separately |
| `{{description}}` | Description |
| `{{language}}` | Language code, as the source gives it (such as `eng` or `en`) |
| `{{coverUrl}}` | Web address of the cover image |
| `{{localCover}}` | Link to the saved cover, such as `[[Library/Covers/Dune - 9780441013593.jpg]]`; empty when there's no cover |
| `{{localCoverPath}}` | Path of the saved cover, without the link brackets |
| `{{source}}` | Where the information came from (`Open Library` or `Google Books`) |
| `{{sourceUrl}}` | The book's page on that site |
| `{{libraryLink}}` | Link to the library note, such as `[[Library MOC]]` |
| `{{date}}`, `{{time}}` | When the note was created (`YYYY-MM-DD`, `HH:mm`) |
| `{{date:FORMAT}}`, `{{time:FORMAT}}` | Same, in a [Moment.js format](https://momentjs.com/docs/#/displaying/format/), such as `{{date:YYYY-MM-DD HH:mm:ss}}` |

Templates from the Book Search plugin mostly keep working: `{{authors}}`, `{{categories}}`, `{{totalPage}}`, and `{{localCoverImage}}` are also available.

Not every source provides every field; an unavailable field is left empty.

### Built-in template

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

`localCover` is stored as a link, so Obsidian updates it if you rename or move the image. `read` is the property that **Toggle read status** changes and the library table shows. `link` points back to the library note.

## Coming from the Book Search plugin

Library Notes can work with a library you started with [Book Search](https://github.com/anpigon/obsidian-book-search-plugin):

- Set **Library folder**, **Books folder**, and **Library note name** to match your existing folders and note.
- Run **Regenerate library note** and choose **Replace that table** to swap your old table for the new one. Your banner, tags, and other text stay.
- Older notes keep working in the table: `localCover` values such as `/Book.jpg` still show their cover when the image is anywhere in your vault, and notes without a `read` property show 🟥 until you mark them read.
- New notes use the built-in template's property names. If your older notes use other names (such as `publish` or `total`), copy the built-in template and rename its properties to match.

## Network use and privacy

Library Notes needs an internet connection to search for books. It sends **only what you type in the search window** to the services below, plus your API key to Google Books if you use it. Its requests identify Library Notes with a link to this repository; the cover thumbnails in the results list are loaded by Obsidian like any image.

| Service | Used for | Account needed |
| --- | --- | --- |
| [Open Library](https://openlibrary.org) (`openlibrary.org`), run by the [Internet Archive](https://archive.org/about/terms.php) | Searching (default source) and book details | No |
| Open Library Covers (`covers.openlibrary.org`, which redirects to `archive.org`) | Cover thumbnails in the results list, and the cover saved with each note | No |
| [Google Books](https://books.google.com) (`www.googleapis.com`, cover images from `books.google.com`) | Searching and book details, only if you add an API key | Yes. A Google account and a free API key. Use is subject to the [Google APIs Terms of Service](https://developers.google.com/terms). |

Adding a book sends a few requests: one search, then (for Open Library) one each for the book and the edition, and one for the cover. Requests to Open Library are spaced one second apart, as Open Library asks. Open Library searches and details are remembered for 30 minutes (until Obsidian closes), so repeating a search doesn't ask again.

Library Notes has no telemetry or analytics, and it doesn't read or send your notes. Each service may log requests under its own policies.

## Content and licensing

- **Book information from Open Library:** the Internet Archive [does not assert any new copyright](https://openlibrary.org/developers/licensing) over the Open Library database, though some contributions may carry existing rights. Each note links back to the book on Open Library.
- **Book information from Google Books** is provided under the [Google APIs Terms of Service](https://developers.google.com/terms).
- **Cover images** belong to their rights holders. Library Notes saves a copy for use in your own notes. If you publish notes, keep in mind that Open Library asks websites to show covers from `covers.openlibrary.org` rather than from copies.

## Troubleshooting

| Message | What to do |
| --- | --- |
| You appear to be offline | Check your internet connection. Open Library searches from the last 30 minutes still work. |
| No books found | Try fewer words, the author's name, or the ISBN. |
| … has received too many requests | Wait a few minutes, or turn on **Try the next source…** in the settings. |
| … is having problems / took too long to respond | The service is down or slow. Try again later, or switch source in the search window. |
| … has no cover for "…" | The note was created without a cover; add an image yourself if you like. |
| Google Books rejected the API key | Check the key in **Settings → Library Notes → Google Books**. |
| The Books API isn't turned on for your key's Google Cloud project | In the Google Cloud console, enable **Books API** for the project the key belongs to. |
| Your Google Books API key has used up today's quota | Try again tomorrow, or search Open Library. |
| The table in "Library MOC" needs the Dataview plugin | Install Dataview from **Community plugins** and enable it. |
| Template "…" was not found | The template file was moved or deleted. Choose it again in the settings. |
| "…" is a file, not a folder | A file has the name of one of the library folders. Rename it or choose another folder. |

## Development

```bash
npm install
npm run dev         # rebuild on every change
npm run build       # type-check and production build
npm run lint        # Obsidian's official ESLint rules
npm test            # offline test suite
npm run test:record # make real requests and save new recordings for the tests
```

If a `test-vault/` folder exists in the project, `npm run dev` copies `main.js`, `manifest.json`, and `styles.css` into `test-vault/.obsidian/plugins/library-notes/` after every build. Open `test-vault/` as a vault to try changes without touching your real notes; the [Hot Reload](https://github.com/pjeby/hot-reload) plugin reloads the plugin automatically. `test-vault/` is gitignored. Development builds also have a **Run developer checks (dev build only)** command, which release builds leave out.

The code is organized by job: `src/core/` (network, files, templates, covers), `src/sources/` (one module per book source, behind the `BookSource` interface in `src/sources/types.ts`), `src/books/` (creating a book note), `src/library/` (the library note and read status), and `src/ui/` (windows). The tests in `tests/` run the real code with stand-ins for Obsidian (`tests/support/`) and recorded answers from Open Library (`tests/fixtures/http/`).

### Releasing

1. Run `npm version patch` (or `minor` / `major`). This updates `package.json`, `manifest.json`, and `versions.json`, commits, and creates a tag such as `1.0.1` (no `v` prefix).
2. Run `git push --follow-tags`.
3. The **Release Obsidian plugin** workflow builds the plugin and creates a draft GitHub release with `main.js`, `manifest.json`, and `styles.css`. Review it on GitHub, then publish it.

## Credits

- Inspired by [Book Search](https://github.com/anpigon/obsidian-book-search-plugin) by anpigon (MIT License). Library Notes follows its idea of book notes from templates, but doesn't include its code.
- Built from the [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin).
- Book information and covers from [Open Library](https://openlibrary.org) (Internet Archive) and [Google Books](https://books.google.com).
- The library table uses [Dataview](https://github.com/blacksmithgu/obsidian-dataview) by Michael Brenan.

## License

[MIT](LICENSE)
