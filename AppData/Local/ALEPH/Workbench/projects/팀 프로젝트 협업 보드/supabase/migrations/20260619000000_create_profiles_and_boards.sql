-- 2.1: Minimal profile and board schema.
-- Access stays closed until the dedicated grants and RLS policies are added.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_check check (
    display_name is null
    or (
      char_length(display_name) between 1 and 80
      and display_name = btrim(display_name)
      and display_name ~ '[^[:space:]]'
    )
  )
);

comment on table public.profiles is
  'Minimal public profile data; authentication credentials and email remain in Supabase Auth.';

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boards_name_check check (
    char_length(name) between 1 and 60
    and name = btrim(name)
    and name ~ '[^[:space:]]'
  )
);

comment on table public.boards is
  'Private team board metadata. Membership and access policies are defined in subsequent migrations.';

-- Do not leave the new public tables readable through default API grants before
-- their membership-based policies are in place. Later migrations grant only the
-- operations required by authenticated users.
alter table public.profiles enable row level security;
alter table public.boards enable row level security;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.boards from anon, authenticated;
