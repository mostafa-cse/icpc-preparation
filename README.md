# ICPC Final Sprint — Training Tracker

A single-page training tracker for ICPC preparation. No backend, no database —
everything is static files and browser storage.

## What's in it

- **Routine** — the training plan at either pace: daily rhythm, weekly contest calendar, and 10 training blocks with live progress bars.
- **Checklist** — 5,089 unique problems across 593 sections, parsed from six source files. Click to tick one off; **right-click or Alt+click to flag it for revision**, then filter to *Flagged only* to get the revision queue the plan keeps referring to. Combine it with *Hide solved* for "flagged and still unsolved".
- **Templates** — an onsite-contest notebook. Store C++ templates with description and complexity, then export the library as LaTeX, Markdown, a single `.cpp`, JSON, or print straight to PDF. Each entry carries a `[N lines] - hash` signature (MD5 of the comment- and whitespace-stripped code) so you can retype a template at a contest and verify you typed it correctly.
- **Contests** — the next upcoming round across Codeforces, CodeChef, AtCoder and LeetCode, with a countdown, browser reminders, and `.ics` calendar export.

## Keyboard

| Key | Does |
|-----|------|
| <kbd>/</kbd> or <kbd>s</kbd> | Jump to Checklist and focus the search box |
| <kbd>Esc</kbd> | Clear the search and leave the box |
| <kbd>1</kbd>–<kbd>5</kbd> | Routine · Checklist · Templates · Contests · Profile |
| <kbd>e</kbd> / <kbd>E</kbd> | Expand / collapse every section |
| <kbd>f</kbd> | Toggle *Flagged only* |
| <kbd>n</kbd> | Jump to a random unsolved problem in view |
| <kbd>t</kbd> / <kbd>T</kbd> | Start-pause / reset the time-box timer |
| <kbd>?</kbd> | Show or hide the shortcut list |

Shortcuts stay out of the way while you are typing in a field, and never
override a browser shortcut (anything with Ctrl, Cmd or Alt held).

## Time-box timer

The ground rules say to cap yourself at 45-60 minutes on a problem before
taking a hint. The timer in the bottom-left corner measures that: it turns
amber at 45 minutes and red at 60, and otherwise stays out of the way. It
stores a start timestamp rather than a running count, so reloading or closing
the tab mid-problem neither loses nor inflates the time.

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
   creates every table, switches on Row Level Security so each user can only
   touch their own rows, and adds a trigger that creates a profile row on
   signup. The file is idempotent — re-run it after pulling to pick up new
   columns.
3. **Project Settings -> API** -> copy the **Project URL** and the **anon
   public** key into `supabase-config.js`.

The anon key is meant to ship in the browser — RLS is what protects the data.
Never put the `service_role` key there; it bypasses RLS.

If email confirmation is on (the Supabase default), new accounts must click the
link in their inbox before signing in. Turn it off under
**Authentication -> Providers -> Email** for instant signup.

### Who may create an account

Signup is restricted to **Gmail** (`@gmail.com` and its `@googlemail.com`
alias). Disposable-mailbox domains are refused separately, so the rule still
holds if the allow-list is ever widened.

Both checks live in a `before insert` trigger on `auth.users`, not in the
browser. The anon key is public, so anyone can POST to `/auth/v1/signup` with
any address they like — `account.js` only repeats the rule to give a readable
message. The domain is taken from the last `@`, so `x@gmail.com.evil.co` is
refused.

The trigger fires on insert only. Accounts that already exist on other domains
keep working, and this also applies to **Authentication -> Users -> Add user**
in the dashboard.

To change the rule, edit `signup_domain_allowed()` (or the disposable list in
`signup_domain_disposable()`) and re-run the file. Keep `SIGNUP_DOMAINS` in
`account.js` in step, or the browser will reject an address the database would
have taken.

### Verifying email addresses

Turn on **Authentication -> Providers -> Email -> Confirm email**. New accounts
then have to click a link before they can sign in, and the signup form already
tells them to expect one. Note this is separate from admin approval: a user
confirms their address first, and an admin still has to approve them after.

### Forgot password

**Forgot password?** on the sign-in card mails a reset link. Following it opens
a *Set a new password* screen; the app will not let you in until you finish it.
A signed-in user can also change their password under **Profile -> Password**.

Two settings decide whether the mail ever arrives:

- **Authentication -> URL Configuration -> Redirect URLs** must list the exact
  page the app is served from, e.g. `https://you.github.io/icpc-preparation/`.
  Supabase silently ignores a `redirect_to` that is not on this list and falls
  back to the Site URL.
- Supabase's built-in mail is rate limited to a few messages an hour and often
  lands in spam. For anything beyond testing, set your own SMTP under
  **Project Settings -> Auth -> SMTP**.

With `supabase-config.js` left blank the app runs in **offline mode**: the
tracker works and progress is kept in this browser, but there are no accounts
and nothing syncs.

Note the gate protects *data*, not *source*: on a static site anyone can fetch
`script.js` and the rest directly, so don't put secrets in this folder.

## Next problem

Deciding *what* to attempt is its own time sink, and the answer is nearly
always "anything unsolved in this block". **Next problem** (or <kbd>n</kbd>)
picks one at random from whatever is currently in view — so the block, file,
search and flag filters all narrow it — opens the section it lives in and
scrolls to it.

## Pace

A strip above the block tiles, showing where you should be by now against
where you are:

- how many problems a day are left to finish the current block on time
- the block's progress and which day of it you are on
- the gap to the expected curve, coloured green/amber/red

All derived from the start date and the plan, so it costs no stored history
and works offline.

## Plan length: 16 or 26 weeks

The same ten blocks, at two paces. The switch sits in the header strip next to
the start date:

| | Weeks | Shape |
|---|---|---|
| Sprint | 16 (≈4 months) | 2, 2, 2, 2, 2, 1, 1, 1, 1, 2 |
| Extended | 26 (≈6 months) | 3, 3, 3, 3, 3, 2, 2, 2, 2, 3 |

Weeks are allocated by how much work each block actually holds. Block 1 carries
904 problems — 18% of the catalogue, because every source file opens with its
own basics — so one week for it was four times the load of any other block.
Geometry gives that week up: it is 451 problems, but a regional set contains
exactly one geometry problem, so depth there is a stretch goal rather than the
critical path. Per-week load went from a 4.0x spread to 1.4x. The final block
keeps its two/three weeks in both plans — it is mock contests, and cutting it
is the one change that would actually cost rating.

Switching re-labels every week range, moves which block "this week" points at,
and re-titles the page. It never touches progress: solved and flagged sets are
keyed by problem id, not by week. The week labels and the week-to-block map are
both derived from those span arrays, so they cannot drift apart.

Stored in `user_settings.plan_weeks`, and in localStorage when offline.

## Prayer times

The Routine tab builds the day around prayer times, which are **jamaat times,
not astronomical ones** — you pray when the mosque prays, which is why Zuhr sits
at 1:30 pm and not at the calculated 12:09.

All five are editable, and whatever you type is kept exactly as typed. Editing
one rebuilds the whole day, so every block after it moves.

The starting values, before you touch anything:

| Prayer  | Default |
|---------|---------|
| Fajr    | today's calculated time, pulled into 5:00–6:00 am |
| Zuhr    | 1:30 pm |
| Asr     | today's calculated time, pulled into 4:00–5:00 pm |
| Maghrib | today's calculated time, pulled into 6:00–7:00 pm |
| Isha    | 8:00 pm |

So Maghrib tracks sunset across the season on its own, while Zuhr and Isha stay
where the mosque puts them. **Reset prayer times** clears your overrides and
returns to those defaults.

Calculated times come from `api.aladhan.com` (Karachi method, Hanafi Asr), via
browser location then an IP lookup, cached per day. If every lookup fails, the
defaults alone still produce a working schedule.

Stored in `user_settings.prayer_times`, and in localStorage when offline.

## Approving accounts (Admin tab)

New signups land in a **pending** queue and cannot reach any data until an admin
approves them. The **Admin** tab appears only for admins and lets you approve,
decline, ban, reinstate, and grant or revoke admin.

The **first account created on a fresh project becomes the admin** automatically
— otherwise nobody could approve anyone. On an existing project, re-running
`supabase-schema.sql` grandfathers every current account to *approved* and makes
the earliest one the admin. That backfill is tied to the moment the `status`
column is added, so re-running the file later never approves a waiting queue.

What the database enforces, regardless of what the UI does:

- Data policies test `is_approved()`, so a pending, declined or banned account is
  refused by Postgres itself. Hiding the tab is cosmetic; this is the real gate.
- `status` and `role` are frozen by a trigger. A user cannot approve or promote
  themselves by calling PostgREST directly, which the public anon key would
  otherwise allow.
- Status changes only happen through `admin_set_status()` / `admin_set_role()`,
  which refuse non-admins, refuse self-ban and self-demotion, refuse removing the
  last admin, and append to `moderation_log`.
- `moderation_log` has no insert or update policy, so the audit trail cannot be
  forged or rewritten from a browser.

### Database linter

Re-running this file clears the linter's `function_search_path_mutable` and
`anon_security_definer_function_executable` findings: every function pins
`search_path`, and `anon` is left with execute on nothing.

Five `authenticated_security_definer_function_executable` warnings remain and
are meant to. `admin_list_users`, `admin_set_status` and `admin_set_role` are
the admin panel's API and carry their own `is_admin()` check; `is_admin` and
`is_approved` are called from RLS policies, which are evaluated as the querying
role — revoke that grant and every policy using them starts failing with
*permission denied*.

One finding cannot be fixed from SQL: **Leaked Password Protection**. Turn it on
under **Authentication -> Providers -> Password**; it checks new passwords
against HaveIBeenPwned.

To make someone an admin by hand, from the Supabase **SQL Editor**:

```sql
update public.profiles set role = 'admin', status = 'approved'
 where email = 'them@example.com';
```

This works because the guard trigger stands aside when there is no JWT — the
SQL editor, `psql`, a migration. It is not a hole: an unauthenticated client
cannot match a row anyway, since the owner-update policy requires
`auth.uid() = id`, and `anon` has no update grant on the table at all. From a
browser the same statement changes nothing.

If your project still has the earlier trigger, that `update` fails with
*"status and role are managed by admin functions"*. Either re-run this file, or
use the flag the admin functions set, in one transaction:

```sql
do $$
begin
  perform set_config('app.privileged_write', 'on', true);
  update public.profiles set role = 'admin', status = 'approved'
   where email = 'them@example.com';
end
$$;
```

## Printing the notebook

Pick **LaTeX (.tex)** on the Templates tab and compile:

```bash
pdflatex notebook.tex   # run twice so the table of contents resolves
```

Needs `extsizes`, `geometry`, `multicol`, `listings`, `xcolor`, `titlesec`,
`tocloft`, `eso-pic` and `hyperref` — Overleaf has all of them.

## Source data

Problem sets are parsed from `CSES.md`, `Cp-books.md`, `LightOJ.md`,
`Lougu-Training.md`, `USACO-Guide.md` and `cp-algo.md`.

`cp-algo.md` is the cp-algorithms.com practice list: 89 topics across 12
chapters, 846 references of which 662 are new to the catalogue. Its chapters map
onto the ten training blocks by subject, and the Graphs chapter is split —
traversal, shortest paths and MST land in the core graphs block, while flows,
2-SAT, matching and SCC go to the advanced one, and LCA to advanced data
structures.
