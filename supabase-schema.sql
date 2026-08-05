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
set search_path = public
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
do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('pending', 'approved', 'declined', 'banned');
  end if;
end
$$;

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  handle       text unique,
  avatar_emoji text,
  -- Copied from auth.users at signup. auth.users is not reachable through
  -- PostgREST, so without this an admin has no way to tell one pending
  -- signup from another.
  email        text,
  -- New accounts wait for an admin. Every data policy below tests this, so a
  -- pending or banned account is refused by the database itself rather than by
  -- the UI — the anon key is public and anyone can call PostgREST directly.
  status       public.account_status not null default 'pending',
  role         text not null default 'member' check (role in ('member', 'admin')),
  status_reason     text,
  status_changed_at timestamptz,
  status_changed_by uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint handle_format check (
    handle is null or handle ~ '^[a-zA-Z0-9_-]{3,30}$'
  )
);

-- `create table if not exists` above is a no-op on an existing project, so the
-- moderation columns are added explicitly. This must run before the functions
-- below: they are `language sql` and are validated against these columns the
-- moment they are created.
--
-- The grandfathering is deliberately tied to whether `status` had to be added
-- on this run. Accounts that predate approval must not be locked out, but the
-- backfill must never fire again — re-running this file with a queue of
-- pending signups would otherwise approve every one of them silently.
do $$
declare
  fresh_column boolean;
  first_id uuid;
begin
  fresh_column := not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'status'
  );

  alter table public.profiles add column if not exists email             text;
  alter table public.profiles add column if not exists status            public.account_status not null default 'pending';
  alter table public.profiles add column if not exists role              text not null default 'member';
  alter table public.profiles add column if not exists status_reason     text;
  alter table public.profiles add column if not exists status_changed_at timestamptz;
  alter table public.profiles add column if not exists status_changed_by uuid;

  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('member', 'admin'));
  end if;

  if fresh_column then
    update public.profiles
       set status = 'approved', status_changed_at = now()
     where status = 'pending';

    if not exists (select 1 from public.profiles where role = 'admin') then
      select id into first_id from public.profiles order by created_at limit 1;
      if first_id is not null then
        update public.profiles set role = 'admin' where id = first_id;
      end if;
    end if;
  end if;
end
$$;

create index if not exists profiles_status_idx on public.profiles (status, created_at desc);

comment on table public.profiles is 'Display identity for each account. Created automatically on signup.';

-- A policy on profiles that reads profiles would recurse forever, so both
-- helpers are security definer: they run as the owner and skip RLS. Both are
-- also the single definition of "may use this site", used by every table below.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- Execute privileges are set in one place, at the end of this file.

alter table public.profiles enable row level security;

drop policy if exists "profiles: owner can read"   on public.profiles;
drop policy if exists "profiles: owner can insert" on public.profiles;
drop policy if exists "profiles: owner can update" on public.profiles;
drop policy if exists "profiles: admin can read"   on public.profiles;
drop policy if exists "profiles: admin can update" on public.profiles;

-- Readable even while pending: the app has to be able to tell the user why it
-- is not letting them in.
create policy "profiles: owner can read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can insert"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner can update"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles: admin can read"
  on public.profiles for select using (public.is_admin());
create policy "profiles: admin can update"
  on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- RLS is row-level, not column-level: the owner-update policy above would
-- otherwise let any user set their own status to 'approved' or role to 'admin'
-- with a single PostgREST call. Privileged columns are therefore frozen here
-- and only moved by admin_set_status()/admin_set_role(), which audit the change.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Set by admin_set_status()/admin_set_role() for the length of their
  -- transaction; nothing else can turn it on.
  if current_setting('app.privileged_write', true) = 'on' then
    return new;
  end if;
  -- No JWT means this is not a browser request — the SQL editor, psql, a
  -- migration. Those are already trusted: an anonymous client cannot reach
  -- this row at all, because the owner-update policy requires auth.uid() = id.
  -- Without this the documented bootstrap UPDATE fails, since a trigger fires
  -- for the table owner too.
  if auth.uid() is null then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.role is distinct from old.role
     or new.status_reason is distinct from old.status_reason
     or new.status_changed_by is distinct from old.status_changed_by then
    raise exception 'status and role are managed by admin functions';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

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
  -- When the training day begins, in minutes past local midnight (360 = 06:00).
  -- Stored as a plain integer, not `time`, so it carries no timezone of its own:
  -- the Routine tab lays every block out against the user's own wall clock.
  day_start_min       smallint not null default 360
                      check (day_start_min between 0 and 1439),
  -- Appearance: 'auto' follows the OS
  theme               text not null default 'auto'
                      check (theme in ('auto', 'light', 'dark')),
  -- Templates tab: printed notebook cover
  notebook_title      text not null default 'ICPC Team Notebook',
  notebook_authors    text not null default '',
  print_font_size     smallint not null default 10
                      check (print_font_size between 6 and 16),
  export_notes        boolean not null default false,
  -- Routine tab: the user's own prayer times, as {"Fajr":"05:30",...} in local
  -- wall-clock. These are jamaat times, not astronomical ones — the calculated
  -- times only seed the defaults.
  prayer_times        jsonb not null default '{}'::jsonb,
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
  on public.user_settings for select using (auth.uid() = user_id and public.is_approved());
create policy "settings: owner can insert"
  on public.user_settings for insert with check (auth.uid() = user_id and public.is_approved());
create policy "settings: owner can update"
  on public.user_settings for update using (auth.uid() = user_id and public.is_approved()) with check (auth.uid() = user_id and public.is_approved());
create policy "settings: owner can delete"
  on public.user_settings for delete using (auth.uid() = user_id and public.is_approved());

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
  on public.problem_progress for select using (auth.uid() = user_id and public.is_approved());
create policy "progress: owner can insert"
  on public.problem_progress for insert with check (auth.uid() = user_id and public.is_approved());
create policy "progress: owner can update"
  on public.problem_progress for update using (auth.uid() = user_id and public.is_approved()) with check (auth.uid() = user_id and public.is_approved());
create policy "progress: owner can delete"
  on public.problem_progress for delete using (auth.uid() = user_id and public.is_approved());

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
  on public.templates for select using (auth.uid() = user_id and public.is_approved());
create policy "templates: owner can insert"
  on public.templates for insert with check (auth.uid() = user_id and public.is_approved());
create policy "templates: owner can update"
  on public.templates for update using (auth.uid() = user_id and public.is_approved()) with check (auth.uid() = user_id and public.is_approved());
create policy "templates: owner can delete"
  on public.templates for delete using (auth.uid() = user_id and public.is_approved());

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
  on public.contest_reminders for select using (auth.uid() = user_id and public.is_approved());
create policy "reminders: owner can insert"
  on public.contest_reminders for insert with check (auth.uid() = user_id and public.is_approved());
create policy "reminders: owner can delete"
  on public.contest_reminders for delete using (auth.uid() = user_id and public.is_approved());


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
declare
  first_admin boolean;
begin
  -- Bootstrap: whoever creates the very first account owns the site, otherwise
  -- a fresh project has a queue of pending users and nobody able to approve
  -- them. Every signup after that waits for review.
  select not exists (select 1 from public.profiles where role = 'admin')
    into first_admin;

  insert into public.profiles (id, display_name, email, status, role, status_changed_at)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email,
    case when first_admin then 'approved' else 'pending' end::public.account_status,
    case when first_admin then 'admin'    else 'member'  end,
    case when first_admin then now() end
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

-- `create table if not exists` above leaves an already-created user_settings
-- untouched, so columns added after a project was first set up need their own
-- alter. Idempotent: re-running the whole file is always safe.
alter table public.user_settings
  add column if not exists day_start_min smallint not null default 360;

alter table public.user_settings
  add column if not exists prayer_times jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_day_start_min_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_day_start_min_check
      check (day_start_min between 0 and 1439);
  end if;
end
$$;


-- ============================================================================
-- 10. Moderation — admin review of new accounts
--
-- Approval is enforced by the policies above (every data table tests
-- is_approved()), not by the UI. The anon key ships in the browser, so a
-- rejected user can always call PostgREST by hand; the database is the only
-- place a "no" actually holds.
--
-- Status changes go through the two functions below rather than a direct
-- update, so that every decision is recorded and the guards below cannot be
-- skipped by writing to the table.
-- ============================================================================

create table if not exists public.moderation_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users on delete set null,
  target_id  uuid references auth.users on delete cascade,
  action     text not null,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_log_target_idx on public.moderation_log (target_id, created_at desc);
create index if not exists moderation_log_created_idx on public.moderation_log (created_at desc);

alter table public.moderation_log enable row level security;

drop policy if exists "modlog: admin can read" on public.moderation_log;
create policy "modlog: admin can read"
  on public.moderation_log for select using (public.is_admin());
-- No insert/update/delete policy on purpose: rows are only ever written by the
-- security-definer functions below, so the audit trail cannot be forged or
-- rewritten from the client.

comment on table public.moderation_log is
  'Append-only record of who changed whose account status, and why.';

-- Section 8's grants run before this table exists. Only select is granted:
-- writes come from the security-definer functions, never from a client.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.moderation_log to authenticated;
  end if;
end
$$;


-- ---------------------------------------------------------------- set status
create or replace function public.admin_set_status(
  target uuid,
  new_status public.account_status,
  reason text default null
)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  row_out public.profiles;
  admins_left integer;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;

  -- Losing your own access mid-session is never what you meant to click, and
  -- an admin who bans themselves cannot undo it from the UI.
  if target = auth.uid() and new_status <> 'approved' then
    raise exception 'you cannot decline or ban your own account';
  end if;

  -- Never leave the site with no one who can approve anybody.
  if new_status <> 'approved' then
    select count(*) into admins_left
    from public.profiles
    where role = 'admin' and status = 'approved' and id <> target;
    if admins_left = 0 then
      raise exception 'that is the last active admin';
    end if;
  end if;

  perform set_config('app.privileged_write', 'on', true);
  update public.profiles
     set status            = new_status,
         status_reason     = nullif(trim(coalesce(reason, '')), ''),
         status_changed_at = now(),
         status_changed_by = auth.uid()
   where id = target
  returning * into row_out;
  perform set_config('app.privileged_write', 'off', true);

  if row_out.id is null then
    raise exception 'no such user';
  end if;

  insert into public.moderation_log (actor_id, target_id, action, reason)
  values (auth.uid(), target, 'status:' || new_status, reason);

  return row_out;
end;
$$;


-- ------------------------------------------------------------------ set role
create or replace function public.admin_set_role(target uuid, new_role text)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare
  row_out public.profiles;
  admins_left integer;
begin
  if not public.is_admin() then
    raise exception 'not authorised';
  end if;
  if new_role not in ('member', 'admin') then
    raise exception 'unknown role %', new_role;
  end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'you cannot remove your own admin access';
  end if;

  if new_role = 'member' then
    select count(*) into admins_left
    from public.profiles
    where role = 'admin' and status = 'approved' and id <> target;
    if admins_left = 0 then
      raise exception 'that is the last active admin';
    end if;
  end if;

  perform set_config('app.privileged_write', 'on', true);
  update public.profiles set role = new_role where id = target
  returning * into row_out;
  perform set_config('app.privileged_write', 'off', true);

  if row_out.id is null then
    raise exception 'no such user';
  end if;

  insert into public.moderation_log (actor_id, target_id, action)
  values (auth.uid(), target, 'role:' || new_role);

  return row_out;
end;
$$;


-- -------------------------------------------------------------- the user list
-- Returns the queue with a solved count per user. A plain view would expose
-- one user's totals to another (see the note on progress_summary), so this is
-- a function that refuses to answer anyone who is not an admin.
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  status public.account_status,
  role text,
  status_reason text,
  status_changed_at timestamptz,
  created_at timestamptz,
  solved_count bigint
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.email, p.display_name, p.status, p.role, p.status_reason,
         p.status_changed_at, p.created_at,
         (select count(*) from public.problem_progress pp
           where pp.user_id = p.id and pp.status = 'solved')
  from public.profiles p
  where public.is_admin()
  order by
    case p.status when 'pending' then 0 when 'approved' then 1 else 2 end,
    p.created_at desc;
$$;

-- Execute privileges are set in one place, at the end of this file.


-- Grandfathering of pre-existing accounts happens in section 1, at the moment
-- the status column is introduced — not here, so that re-running this file
-- never approves a queue of waiting signups.

-- Emails are only captured from signup onwards, so fill in the ones already
-- created. auth.users is readable here because the file runs as the owner.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;


-- ============================================================================
-- 11. Execute privileges on functions
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC, and Supabase's default
-- privileges additionally grant it to anon and authenticated by name. Revoking
-- from PUBLIC alone therefore leaves the named grants in place, which is what
-- made every function here callable at /rest/v1/rpc/... without signing in.
--
-- Everything is revoked first, then execute is handed back only to the roles
-- that genuinely need it.
-- ============================================================================
do $$
declare
  fn text;
  -- Reachable from the browser on purpose. The admin_* three carry their own
  -- is_admin() check; the two helpers are called by RLS policies, which are
  -- evaluated as the querying role and so need execute on them.
  api text[] := array[
    'public.is_admin()',
    'public.is_approved()',
    'public.admin_list_users()',
    'public.admin_set_role(uuid, text)',
    'public.admin_set_status(uuid, public.account_status, text)'
  ];
  -- Trigger functions. Nothing should ever call these directly; the trigger
  -- mechanism does not consult EXECUTE when it fires them.
  internal text[] := array[
    'public.touch_updated_at()',
    'public.guard_profile_privileges()',
    'public.handle_new_user()'
  ];
  role_name text;
begin
  foreach fn in array api || internal loop
    execute format('revoke all on function %s from public', fn);
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name) then
        execute format('revoke all on function %s from %I', fn, role_name);
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach fn in array api loop
      execute format('grant execute on function %s to authenticated', fn);
    end loop;
  end if;
end
$$;
