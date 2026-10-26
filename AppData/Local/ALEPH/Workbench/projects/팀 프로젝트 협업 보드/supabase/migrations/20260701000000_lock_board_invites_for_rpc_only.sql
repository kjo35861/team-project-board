-- 2.13: Keep invitation records inaccessible through direct Data API table
-- operations. Future controlled SECURITY DEFINER RPCs receive EXECUTE grants
-- in their own migrations; no invitation RPC is exposed by this step.

alter table public.board_invites enable row level security;

revoke all privileges on table public.board_invites
  from public, anon, authenticated;

comment on table public.board_invites is
  'One-time board invitation records. Direct Data API access is revoked for PUBLIC, anon, and authenticated; future invite operations must use narrowly granted RPCs.';
