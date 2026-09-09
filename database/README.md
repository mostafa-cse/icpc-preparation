# Database Architecture & Schemas

This directory contains the database definitions, migration scripts, and Row-Level Security (RLS) policies for the ICPC Preparation platform.

## Infrastructure

The project uses **PostgreSQL hosted on Supabase**:
- **Database Engine**: PostgreSQL 15+
- **Authentication**: `auth.users` integrated directly with `public.profiles`
- **Security**: Strict Row-Level Security (RLS) on all user-owned tables
- **Idempotency**: All migration statements in `supabase-schema.sql` can be safely executed repeatedly without data loss

---

## Schema Overview

### Core Tables

1. **`public.profiles`**:
   - Stores user metadata: display name, avatar, account role (`admin` / `user`), account approval status (`approved`, `pending`, `declined`, `banned`), Codeforces handle, and bio.
   - Tied directly to `auth.users(id)` via foreign key constraint.

2. **`public.user_settings`**:
   - Stores user preferences, selected training program duration (e.g., 26 weeks, 16 weeks), dark/light theme choice, active notification settings, and personal clist.by API credentials.

3. **`public.problem_progress`**:
   - Stores problem status (`solved`, `in-progress`, `ignore`) and starred bookmarks per user.
   - Employs an efficient sparse row model: problems cost zero rows until the user actually solves, bookmarks, or attempts them.

4. **`public.templates`**:
   - Code snippet notebook storing algorithms, C++ / Python templates, data structures, and math snippets synchronized across devices.

5. **`public.contest_reminders`**:
   - Custom reminders and bookmarked upcoming competitive programming contests.

---

## Setup & Deployment Instructions

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your project and navigate to **SQL Editor** → **New query**.
3. Open [`supabase-schema.sql`](./supabase-schema.sql), copy its entire contents, paste into the query editor, and click **Run**.
4. To grant admin access to a specific email, run the provided admin promotion helper in the SQL editor:
   ```sql
   SELECT public.promote_admin_by_email('your-email@example.com');
   ```
