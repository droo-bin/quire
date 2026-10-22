<p align="center"><img src="src/icons/icon.svg" width="96" height="96" alt=""></p>

<h1 align="center">Quire</h1>

A CV builder that runs entirely in your browser. Bring in the CV you already have (PDF, Word, JSON Resume or a LinkedIn export), pick a template, tighten the writing with checks that explain themselves, match it to a job advert and download a proper PDF. There's no server, no account and no upload, and it keeps working offline.

**Use it now:** <https://droo-bin.github.io/quire/>

## What it does

- **Imports what you have.**
  - **Structured files come in exactly:** JSON Resume, FRESH, Reactive Resume exports and LinkedIn's "Get a copy of your data" zip.
  - **PDF and Word files are read as well as they can be.** Quire rebuilds lines from the PDF, reading two-column layouts a column at a time. It then works out the name, contact details, sections (from about 140 common headings), jobs, dates, bullet points, qualifications and grades.
  - **You get a report.** It says what was found and what's worth checking.
  - **Text works too.** Pasted text, `.txt`, `.md`, `.rtf` and OpenDocument files can also be imported.
- **Editing that gets out of the way.**
  - **Entries.** Every job or qualification folds up to one line. Sections, entries and bullet points can be dragged (or moved with the arrow keys) into order.
  - **Hiding.** Anything can be hidden from the CV without deleting it.
  - **Bullet points.** Enter starts a new point, Backspace joins two, and pasting a list makes one point per line.
  - **Dates.** Write them however you like ("Sept 2019", "03/2018", "2016 – Present"). Quire stores them properly.
  - **Undo, saving and versions.** There's undo and redo, everything saves as you type, and earlier versions are kept so a bad edit can be rolled back days later.
- **Six templates, drawn with your own CV.**
  - **Modern, Classic, Sidebar, Compact, Banner and Timeline**, with six bundled typefaces and any colour.
  - **Settings:** text size, spacing and margins, A4 or US Letter, and date style.
  - **Real pages.** The preview is laid out on actual pages. A long job splits between its bullet points, and a heading never sits alone at the bottom of a page.
  - **Fit to 1 or 2 pages.** This shrinks the type and spacing just enough, and no further than stays readable.
  - **Click to edit.** Clicking anything in the preview jumps to it in the editor.
- **Checks that explain themselves.** Each check says where the problem is, why it matters and, when the fix is mechanical, offers to make it. It looks for:
  - weak openers like "Responsible for…" and "I" in bullet points;
  - roles with no numbers in them;
  - present tense in jobs that have ended (with a one-click fix);
  - inconsistent full stops;
  - clichés ("team player");
  - tool names written the unofficial way ("Javascript", "Github");
  - mixed British and American spelling;
  - personal details that don't belong on a UK CV;
  - missing contact details;
  - date gaps, overlaps and order;
  - repeated skills;
  - length.
- **Job matching.** Paste a job advert and Quire picks out the skills, tools and qualifications it asks for, weighting the "essential" ones more. It shows which your CV mentions, allowing for synonyms and word forms ("JS" counts as JavaScript, "mentored" as mentoring). Missing ones can be added to your skills in a click (if they're true). **Make a copy for this job** keeps a tailored version alongside your main CV.
- **A second opinion, if you want one.** A small language model (Qwen2.5 Instruct) can run on your device. It reviews the CV, suggests a stronger version of any bullet point and drafts a summary aimed at the job. It's optional and slow: a one-off download of 1.1 GB (or 400 MB for the smaller model), then a minute or two per review on a typical laptop. Nothing it suggests is applied without you choosing it.
- **Downloads.**
  - **PDF.** Generated directly, not via the print dialog. Text stays text, so it can be selected and searched and applicant tracking systems can read it. Links work, the fonts are embedded and subset (a one-page CV is around 25 KB), and the CV's JSON is attached inside. Importing a PDF that Quire made brings back the whole CV exactly, including hidden entries and the design.
  - **Word (.docx).** Real headings, bullet lists and right-aligned dates, in Calibri or Cambria so it looks right in any copy of Word.
  - **JSON Resume**, with Quire's layout under `meta.quire`.
  - **Plain text and Markdown**, plus "Copy as text" for application forms.
  - **Print.**
- **Private by design.** CVs live in this browser's storage (IndexedDB). Nothing is uploaded. The only network request Quire ever makes is the optional model download from Hugging Face, and the Content Security Policy enforces that.

## Run it yourself

```sh
node scripts/build.mjs        # copies src/ to dist/ and writes the offline service worker
python3 -m http.server 8010 --directory dist
```

Then open <http://localhost:8010>. There are no dependencies to install: the libraries Quire uses (pdf.js, wllama) and its fonts are committed under `src/vendor/`. Add `?nosw` to the address to skip the service worker while developing.

## Tests

```sh
node scripts/build.mjs
node --test test/*.test.mjs                        # dates, CV reading, formats, checks, job matching, fonts and the PDF writer
cd test && python3 -m unittest test_app -v         # the app in Chromium (needs: pip install playwright)
cd test && python3 -m unittest test_corpus -v      # what Quire reads from awkward CV layouts
```

The browser tests cover:
- editing, bullet points, drag and keyboard reordering, hiding, undo and dates;
- templates, fitting to a page and sidebar columns;
- page breaks;
- checks and their fixes, job matching and tailored copies;
- the language-model features, using a stand-in model;
- importing every fixture (a Word CV, a two-column PDF, a LinkedIn export, FRESH, Reactive Resume and plain text);
- PDF export (real text, and an exact round trip) and the Word, JSON and text exports;
- the phone layout, and working offline.

`test/make_fixtures.py` regenerates the import fixtures, all of them made-up people.

`test/fixtures/corpus` holds CVs laid out the awkward ways real ones are: a sidebar that runs onto the next page, contact details behind icon-font pictures, bullets that are only an indent, Symbol-font bullets, dates in their own column, running headers and footers, contacts in a Word page header or text box, a table used for the page layout, and plain text with capitals headings, letter-spaced headings, dates first, roles grouped under one employer, personal-details blocks or no headings at all. `test_corpus.py` checks what lands where for each; `test/make_corpus.py` regenerates them (needs python-docx, reportlab and fontTools). Add a file there whenever a real CV comes in wrong, with made-up details.

## How it fits together

| Path | What it does |
| --- | --- |
| `src/app.js` | State, undo and redo, saving, the live preview, importing and exporting |
| `src/lib/model.js` | The CV as JSON Resume, plus Quire's extras (layout, custom sections, hidden entries) |
| `src/lib/dates.js` | Reading and showing dates the way people write them |
| `src/import/` | `text.js` reads a CV written for people; `pdf.js` and `docx.js` turn files into lines for it; `formats.js` handles JSON Resume, FRESH, Reactive Resume and LinkedIn |
| `src/render/` | Templates (`templates.js`, `cv.css`), page layout and fitting (`paginate.js`), fonts |
| `src/export/` | The PDF writer (`pdfwriter.js`, `ttf.js` for font subsetting, `pdf.js` to draw from the laid-out pages), Word (`docx.js`) and text |
| `src/check/` | Writing checks (`checks.js`), job matching (`match.js`) and their word lists |
| `src/ui/` | The Content, Design and Review tabs, the start screen and small shared helpers |

## Publishing

`.github/workflows/publish.yml` builds and tests every push and pull request.
- **Pushes to `main`** publish `dist/` to GitHub Pages, at droo-bin.github.io/quire/ for a repository named `quire`.
- **Tags like `v1.0.0`** also attach a zip of the built app to a release.

One-time setup: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Known limits

- **Reading a PDF or Word CV is guesswork.** Most come in well, and the import report says what to check. Unusual layouts (text boxes in odd orders, tables used for everything, scanned images) need tidying by hand.
- **Old files need converting.** Old `.doc` files aren't supported: save them as `.docx` or PDF first.
- **Fonts and scripts.** The bundled typefaces cover the Latin alphabet (all the European languages that use it). Carlito also covers Greek and Cyrillic, and Lora and IBM Plex Serif cover Cyrillic. Other scripts would need another font.
- **Storage stays in this browser.** CVs are kept in this browser only. Download the JSON to back up or move to another device.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`, which lists the bundled libraries and fonts and their licences.
