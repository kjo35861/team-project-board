-- 2.7: Establish a deny-by-default access baseline for application tables.
-- Membership-aware policies and the minimum required grants are added in
-- subsequent steps. Until then, neither anonymous nor authenticated clients
-- should have direct Data API privileges on these tables.

alter table public.profiles enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.tasks enable row level security;
alter table public.board_invites enable row level security;

revoke all privileges on table
  public.profiles,
  public.boards,
  public.board_members,
  public.tasks,
  public.board_invites
from public, anon, authenticated;

comment on table public.profiles is
  'Minimal public profile data; RLS is enabled and Data API access is denied until an explicit policy and grant are added.';
comment on table public.boards is
  'Private team board metadata; RLS is enabled and Data API access is denied until an explicit policy and grant are added.';
comment on table public.board_members is
  'Board membership and role; RLS is enabled and Data API access is denied until an explicit policy and grant are added.';
comment on table public.tasks is
  'Shared board tasks; RLS is enabled and Data API access is denied until an explicit policy and grant are added.';
comment on table public.board_invites is
  'One-time board invitation records; RLS is enabled and direct Data API access is denied in favor of later controlled RPCs.';
