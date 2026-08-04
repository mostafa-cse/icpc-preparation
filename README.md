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

## Accounts and data (Supabase)

Sign-in is required. Each account's solved problems live in Supabase, so
progress follows you across devices. **Profile** shows totals, per-block and
per-source-file breakdowns, and sign-out.

Set it up once:

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor -> New query** -> paste `supabase-schema.sql` -> **Run**. That
   creates `profiles` and `solved_problems`, switches on Row Level Security so
   each user can only touch their own rows, and adds a trigger that creates a
   profile row on signup.
3. **Project Settings -> API** -> copy the **Project URL** and the **anon
   public** key into `supabase-config.js`.

The anon key is meant to ship in the browser — RLS is what protects the data.
Never put the `service_role` key there; it bypasses RLS.

If email confirmation is on (the Supabase default), new accounts must click the
link in their inbox before signing in. Turn it off under
**Authentication -> Providers -> Email** for instant signup.

With `supabase-config.js` left blank the app runs in **offline mode**: the
tracker works and progress is kept in this browser, but there are no accounts
and nothing syncs.

Note the gate protects *data*, not *source*: on a static site anyone can fetch
`script.js` and the rest directly, so don't put secrets in this folder.

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
