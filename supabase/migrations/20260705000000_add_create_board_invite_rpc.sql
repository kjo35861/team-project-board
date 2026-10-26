-- 2.17: Issue a one-time invitation token through a narrowly granted RPC.
-- The token is generated from four cryptographically random UUIDs (URL-safe
-- lowercase hex) and only its SHA-256 digest is persisted. The raw token is
-- returned once to the authenticated owner so the client can form the link.

create function public.create_board_invite(p_board_id uuid)
returns table (
  invite_id uuid,
  token text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  board_owner_id uuid;
  user_email_confirmed_at timestamptz;
  raw_token text;
  token_digest text;
  issued_at timestamptz;
  invitation_expires_at timestamptz;
  created_invite_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to create an invitation.'
      using errcode = '28000';
  end if;

  select u.email_confirmed_at
    into user_email_confirmed_at
    from auth.users as u
   where u.id = current_user_id;

  if user_email_confirmed_at is null then
    raise exception 'A confirmed email address is required to create an invitation.'
      using errcode = '42501';
  end if;

  -- Serialize issuance against board deletion and other owner management RPCs.
  select b.owner_id
    into board_owner_id
    from public.boards as b
   where b.id = p_board_id
   for update;

  if not found or board_owner_id is distinct from current_user_id then
    raise exception 'Only the board owner may create an invitation.'
      using errcode = '42501';
  end if;

  -- UUIDv4 provides 122 random bits each. Concatenating four independent
  -- values gives a 128-character URL-safe token with 488 unpredictable bits.
  raw_token := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
            || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
            || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')
            || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  token_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(raw_token, 'UTF8')),
    'hex'
  );

  issued_at := pg_catalog.statement_timestamp();
  invitation_expires_at := issued_at + interval '168 hours';

  insert into public.board_invites (
    board_id,
    token_hash,
    created_by,
    created_at,
    expires_at
  ) values (
    p_board_id,
    token_digest,
    current_user_id,
    issued_at,
    invitation_expires_at
  )
  returning id into created_invite_id;

  -- The raw token is only in this one RPC response; it is never stored in DB.
  return query
    select created_invite_id, raw_token, invitation_expires_at;
end;
$function$;

comment on function public.create_board_invite(uuid) is
  'Creates a seven-day, one-time board invitation for the confirmed-email owner. Stores only SHA-256(token); returns the high-entropy raw token once so the client can construct a share link. The client must not log or persist the raw token.';

revoke all on function public.create_board_invite(uuid) from public, anon, authenticated;
grant execute on function public.create_board_invite(uuid) to authenticated;
