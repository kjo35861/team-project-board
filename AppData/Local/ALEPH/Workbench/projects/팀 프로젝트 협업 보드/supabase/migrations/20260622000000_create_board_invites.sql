-- 2.4: One-time board invitations. Only a SHA-256 hex digest is stored;
-- the raw token is generated and retained by the client, never this table.
-- Invitations stay inaccessible through the Data API until the later RPC/RLS work.

create table public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  token_hash text not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete restrict,
  canceled_at timestamptz,
  constraint board_invites_token_hash_check check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint board_invites_expires_after_7_days_check check (
    extract(epoch from (expires_at - created_at)) = 604800
  ),
  constraint board_invites_acceptor_matches_timestamp_check check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  ),
  constraint board_invites_accepted_before_expiry_check check (
    accepted_at is null
    or (accepted_at >= created_at and accepted_at < expires_at)
  ),
  constraint board_invites_canceled_after_creation_check check (
    canceled_at is null or canceled_at >= created_at
  ),
  constraint board_invites_not_both_accepted_and_canceled_check check (
    accepted_at is null or canceled_at is null
  ),
  constraint board_invites_token_hash_key unique (token_hash)
);

comment on table public.board_invites is
  'One-time board invitation records. Store only the lowercase SHA-256 hex digest, never the raw invitation token.';
comment on column public.board_invites.token_hash is
  'Lowercase 64-character SHA-256 hex digest of the raw invitation token; unique across all boards.';
comment on column public.board_invites.expires_at is
  'Exactly 168 hours after created_at. Expiration is derived from this timestamp and is not persisted as a separate status.';
comment on column public.board_invites.accepted_by is
  'Authenticated account that accepted the invitation; the reference prevents deleting acceptance history and token reuse.';

-- Support an owner's invitation list while keeping token lookups unique.
create index board_invites_board_created_idx
  on public.board_invites (board_id, created_at desc);

alter table public.board_invites enable row level security;
revoke all on table public.board_invites from anon, authenticated;
