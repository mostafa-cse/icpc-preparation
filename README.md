# ICPC Final Sprint — 16-Week Training Tracker

A single-page training tracker for ICPC preparation. No backend, no database —
everything is static files and browser storage.

## What's in it

- **Routine** — the 16-week plan: daily rhythm, weekly contest calendar, and 10 training blocks with live progress bars.
- **Checklist** — 4,427 unique problems across 504 sections, parsed from five source files. Tick problems off; progress is stored in your browser.
- **Templates** — an onsite-contest notebook. Store C++ templates with description and complexity, then export the library as LaTeX, Markdown, a single `.cpp`, JSON, or print straight to PDF. Each entry carries a `[N lines] - hash` signature (MD5 of the comment- and whitespace-stripped code) so you can retype a template at a contest and verify you typed it correctly.
- **Contests** — the next upcoming round across Codeforces, CodeChef, AtCoder and LeetCode, with a countdown, browser reminders, and `.ics` calendar export.

## Running it

It's static — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

Serving over `http://` is preferred: opening via `file://` makes browsers block
the contest API requests as cross-origin.

## Access

The page is behind a password gate (`auth.js`). Only a PBKDF2-SHA256 derivation
of the password is stored, never the password itself. Change it with the
"Change password" link on the lock screen, which prints a hash to paste over
`PASSWORD_HASH`.

Note this is a deterrent, not real security: on a static site anyone can fetch
`script.js` and the other files directly, so don't put anything sensitive here.

## Printing the notebook

Pick **LaTeX (.tex)** on the Templates tab and compile:

```bash
pdflatex notebook.tex   # run twice so the table of contents resolves
```

Needs `extsizes`, `geometry`, `multicol`, `listings`, `xcolor`, `titlesec`,
`tocloft`, `eso-pic` and `hyperref` — Overleaf has all of them.

## Source data

Problem sets are parsed from `CSES.md`, `Cp-books.md`, `LightOJ.md`,
`Lougu-Training.md` and `USACO-Guide.md`.
