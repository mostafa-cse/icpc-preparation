-- ============================================================================
-- ICPC Tracker — complete database schema (Supabase / PostgreSQL)
--
-- Run once:  Dashboard -> SQL Editor -> New query -> paste -> Run
-- Safe to re-run: every statement is idempotent.
--
-- Covers everything the app stores per user:
--   profiles           identity shown in the header and Profile tab
--   user_settings      one row per user: start date, theme, notebook meta,
--                      contest lead time, personal clist.by credentials
--   problem_progress   solved / attempted / skipped, one row per problem
--   templates          the onsite-contest notebook
--   contest_reminders  which upcoming contests the user wants pinged about
--
-- Auth itself (sign-up, login, password reset, sessions, email confirmation)
-- is handled by Supabase's built-in auth.users table — never create your own
-- password table. Everything below hangs off auth.users(id).
--
-- Row Level Security is enabled on every table with owner-only policies, so a
-- signed-in user can only ever read or write their own rows. That is what makes
-- it safe to ship the anon key in the browser.
-- ============================================================================


-- ============================================================================
-- 0. Shared helpers
-- ============================================================================

-- Keeps updated_at honest without the client having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Marks how a problem stands for a user. Absence of a row means "untouched",
-- which is why 4,427 problems cost zero rows until the user actually acts.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'problem_status') then
    create type public.problem_status as enum ('solved', 'attempted', 'skipped');
  end if;
end
$$;


-- ============================================================================
-- 1. profiles — public-facing identity, 1:1 with auth.users
-- ============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  handle       text unique,
  avatar_emoji text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint handle_format check (
    handle is null or handle ~ '^[a-zA-Z0-9_-]{3,30}$'
  )
);

comment on table public.profiles is 'Display identity for each account. Created automatically on signup.';

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner can read"   on public.profiles;
drop policy if exists "profiles: owner can insert" on public.profiles;
drop policy if exists "profiles: owner can update" on public.profiles;

create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can insert"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 2. user_settings — one row per user, all preferences
-- ============================================================================
create table if not exists public.user_settings (
  user_id             uuid primary key references auth.users on delete cascade,
  -- Routine tab
  start_date          date,
  -- Appearance: 'auto' follows the OS
  theme               text not null default 'auto'
                      check (theme in ('auto', 'light', 'dark')),
  -- Templates tab: printed notebook cover
  notebook_title      text not null default 'ICPC Team Notebook',
  notebook_authors    text not null default '',
  print_font_size     smallint not null default 10
                      check (print_font_size between 6 and 16),
  export_notes        boolean not null default false,
  -- Contests tab
  contest_lead_min    smallint not null default 30
                      check (contest_lead_min between 1 and 10080),
  contest_platforms   text[] not null default array['cf','cc','ac','lc'],
  -- Each user may supply their own clist.by credentials ("username:api_key").
  -- Per-user, so nobody shares a rate limit and no key ships in the repo.
  clist_credentials   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.user_settings is 'Per-user preferences; one row per account.';
comment on column public.user_settings.clist_credentials is
  'The user''s own clist.by "username:api_key". RLS keeps it private to them.';

alter table public.user_settings enable row level security;

drop policy if exists "settings: owner can read"   on public.user_settings;
drop policy if exists "settings: owner can insert" on public.user_settings;
drop policy if exists "settings: owner can update" on public.user_settings;
drop policy if exists "settings: owner can delete" on public.user_settings;

create policy "settings: owner can read"
  on public.user_settings for select using (auth.uid() = user_id);
create policy "settings: owner can insert"
  on public.user_settings for insert with check (auth.uid() = user_id);
create policy "settings: owner can update"
  on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "settings: owner can delete"
  on public.user_settings for delete using (auth.uid() = user_id);

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 3. problem_progress — solved / attempted / skipped
--
-- problem_id is the tracker's own id ("CSES-1083", "UVA-10055", "CodeForces-4A"),
-- not a foreign key: the problem catalogue lives in script.js, not the DB, so
-- there is nothing to reference. The composite PK makes each (user, problem)
-- pair unique and gives the lookup index for free.
-- ============================================================================
create table if not exists public.problem_progress (
  user_id     uuid not null references auth.users on delete cascade,
  problem_id  text not null check (length(problem_id) between 1 and 128),
  status      public.problem_status not null default 'solved',
  note        text,
  solved_at   timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, problem_id)
);

comment on table public.problem_progress is
  'One row per problem the user has touched. No row = not attempted.';

-- Fast "everything for this user", and fast "only the solved ones".
create index if not exists problem_progress_user_idx
  on public.problem_progress (user_id);
create index if not exists problem_progress_user_status_idx
  on public.problem_progress (user_id, status);
-- Supports activity / streak queries on the Profile tab.
create index if not exists problem_progress_user_solved_at_idx
  on public.problem_progress (user_id, solved_at desc);

alter table public.problem_progress enable row level security;

drop policy if exists "progress: owner can read"   on public.problem_progress;
drop policy if exists "progress: owner can insert" on public.problem_progress;
drop policy if exists "progress: owner can update" on public.problem_progress;
drop policy if exists "progress: owner can delete" on public.problem_progress;

create policy "progress: owner can read"
  on public.problem_progress for select using (auth.uid() = user_id);
create policy "progress: owner can insert"
  on public.problem_progress for insert with check (auth.uid() = user_id);
create policy "progress: owner can update"
  on public.problem_progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress: owner can delete"
  on public.problem_progress for delete using (auth.uid() = user_id);

drop trigger if exists problem_progress_touch on public.problem_progress;
create trigger problem_progress_touch before update on public.problem_progress
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 4. templates — the onsite-contest notebook
-- ============================================================================
create table if not exists public.templates (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  category         text not null default 'Misc',
  description      text not null default '',
  time_complexity  text not null default '',
  space_complexity text not null default '',
  code             text not null default '',
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.templates is
  'C++ templates for the printed notebook. Line count and the [N lines] - hash
   signature are derived from code at render time, so they are not stored.';

create index if not exists templates_user_idx
  on public.templates (user_id, category, position);

alter table public.templates enable row level security;

drop policy if exists "templates: owner can read"   on public.templates;
drop policy if exists "templates: owner can insert" on public.templates;
drop policy if exists "templates: owner can update" on public.templates;
drop policy if exists "templates: owner can delete" on public.templates;

create policy "templates: owner can read"
  on public.templates for select using (auth.uid() = user_id);
create policy "templates: owner can insert"
  on public.templates for insert with check (auth.uid() = user_id);
create policy "templates: owner can update"
  on public.templates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates: owner can delete"
  on public.templates for delete using (auth.uid() = user_id);

drop trigger if exists templates_touch on public.templates;
create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();


-- ============================================================================
-- 5. contest_reminders — which upcoming contests to ping about
--
-- contest_id is the tracker's composite id ("cf-2254", "cc-START250"), stable
-- for as long as the contest is upcoming, which is all the reminder needs.
-- ============================================================================
create table if not exists public.contest_reminders (
  user_id      uuid not null references auth.users on delete cascade,
  contest_id   text not null check (length(contest_id) between 1 and 200),
  platform     text check (platform in ('cf', 'cc', 'ac', 'lc')),
  contest_name text,
  starts_at    timestamptz,
  created_at   timestamptz not null default now(),
  primary key (user_id, contest_id)
);

comment on table public.contest_reminders is
  'Reminder opt-ins. Rows for contests already past can be pruned at any time.';

create index if not exists contest_reminders_user_starts_idx
  on public.contest_reminders (user_id, starts_at);

alter table public.contest_reminders enable row level security;

drop policy if exists "reminders: owner can read"   on public.contest_reminders;
drop policy if exists "reminders: owner can insert" on public.contest_reminders;
drop policy if exists "reminders: owner can delete" on public.contest_reminders;

create policy "reminders: owner can read"
  on public.contest_reminders for select using (auth.uid() = user_id);
create policy "reminders: owner can insert"
  on public.contest_reminders for insert with check (auth.uid() = user_id);
create policy "reminders: owner can delete"
  on public.contest_reminders for delete using (auth.uid() = user_id);


-- ============================================================================
-- 6. Signup wiring
--
-- Supabase inserts into auth.users when someone signs up. This trigger gives
-- that new user their profile and settings rows immediately, so the app never
-- has to handle a "user exists but has no profile" state.
-- security definer: the trigger runs as the table owner, because the signing-up
-- user has no session yet and would otherwise be blocked by RLS.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 7. Convenience view — per-user totals for the Profile tab
--
-- Only counts what the user has touched; the denominator (4,427) comes from the
-- catalogue in script.js, so the percentage is computed client-side.
-- security_invoker makes the view honour the querying user's RLS.
-- ============================================================================
create or replace view public.progress_summary as
select
  user_id,
  count(*) filter (where status = 'solved')    as solved_count,
  count(*) filter (where status = 'attempted') as attempted_count,
  count(*) filter (where status = 'skipped')   as skipped_count,
  max(solved_at) filter (where status = 'solved') as last_solved_at
from public.problem_progress
-- Filter explicitly rather than leaning on security_invoker alone: a view runs
-- as its owner on PostgreSQL < 15, which would let one user read another's
-- aggregate counts straight through RLS.
where user_id = auth.uid()
group by user_id;

-- security_invoker makes the view run as the querying user so RLS still applies.
-- It needs PostgreSQL 15+; Supabase is well past that, but guard it so this file
-- also runs on older servers.
do $$
begin
  if current_setting('server_version_num')::int >= 150000 then
    execute 'alter view public.progress_summary set (security_invoker = true)';
  end if;
end
$$;


-- ============================================================================
-- 8. Grants
--
-- Supabase already grants these by default privilege, so this is belt-and-
-- braces: it keeps the file self-contained if you ever run it elsewhere.
-- RLS is what restricts rows; these only open the door to the tables at all.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on
      public.profiles, public.user_settings, public.problem_progress,
      public.templates, public.contest_reminders
      to authenticated;
    grant select on public.progress_summary to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema public to anon;
  end if;
end
$$;


-- ============================================================================
-- 9. Migration from the earlier schema (safe no-op on a fresh project)
--
-- The first version of this file shipped a solved_problems table. If it exists,
-- fold its rows into problem_progress and drop it.
-- ============================================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'solved_problems'
  ) then
    insert into public.problem_progress (user_id, problem_id, status, solved_at)
    select user_id, problem_id, 'solved', coalesce(solved_at, now())
    from public.solved_problems
    on conflict (user_id, problem_id) do nothing;

    drop table public.solved_problems;
  end if;
end
$$;
