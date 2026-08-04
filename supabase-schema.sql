-- ============================================================================
-- ICPC Tracker — Supabase schema
--
-- Run this once in your Supabase project:
--   Dashboard -> SQL Editor -> New query -> paste -> Run
--
-- Row Level Security is on for both tables, so a signed-in user can only ever
-- read or write their own rows. That is what makes it safe to ship the anon
-- key in the browser.
-- ============================================================================

-- ---------------------------------------------------------------- profiles --
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  handle       text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by owner" on public.profiles;
create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are insertable by owner" on public.profiles;
create policy "profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles are updatable by owner" on public.profiles;
create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- --------------------------------------------------------- solved problems --
create table if not exists public.solved_problems (
  user_id    uuid not null references auth.users on delete cascade,
  problem_id text not null,
  solved_at  timestamptz not null default now(),
  primary key (user_id, problem_id)
);

create index if not exists solved_problems_user_idx
  on public.solved_problems (user_id);

alter table public.solved_problems enable row level security;

drop policy if exists "solved rows are readable by owner" on public.solved_problems;
create policy "solved rows are readable by owner"
  on public.solved_problems for select
  using (auth.uid() = user_id);

drop policy if exists "solved rows are insertable by owner" on public.solved_problems;
create policy "solved rows are insertable by owner"
  on public.solved_problems for insert
  with check (auth.uid() = user_id);

drop policy if exists "solved rows are deletable by owner" on public.solved_problems;
create policy "solved rows are deletable by owner"
  on public.solved_problems for delete
  using (auth.uid() = user_id);

-- ------------------------------------------- auto-create a profile on signup --
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
