-- 2.19: Accept a one-time invitation atomically. The raw bearer token is
-- hashed for lookup and is never persisted. Lock order is board -> invitation,
-- matching cancellation and the other board-management RPCs.

create function public.accept_board_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  user_email_confirmed_at timestamptz;
  token_digest text;
  matched_invite_id uuid;
  invite_board_id uuid;
  locked_board_id uuid;
  invite_expires_at timestamptz;
  invite_accepted_at timestamptz;
  invite_canceled_at timestamptz;
  acceptance_time timestamptz;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to accept an invitation.'
      using errcode = '28000';
  end if;

  select u.email_confirmed_at
    into user_email_confirmed_at
    from auth.users as u
   where u.id = current_user_id;

  if user_email_confirmed_at is null then
    raise exception 'A confirmed email address is required to accept an invitation.'
      using errcode = '42501';
  end if;

  -- The issued token is 128 lowercase hex characters. Reject malformed input
  -- before hashing, and never expose whether a digest belongs to an invitation.
  if p_token is null or p_token !~ '^[0-9a-f]{128}$' then
    raise exception 'This invitation is invalid, expired, canceled, or already used.'
      using errcode = '22023';
  end if;

  token_digest := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')),
    'hex'
  );

  -- Discover the parent without taking the invitation lock first. All state
  -- changes then acquire locks in the shared board -> invitation order.
  select i.id, i.board_id
    into matched_invite_id, invite_board_id
    from public.board_invites as i
   where i.token_hash = token_digest;

  if not found then
    raise exception 'This invitation is invalid, expired, canceled, or already used.'
      using errcode = '22023';
  end if;

  select b.id
    into locked_board_id
    from public.boards as b
   where b.id = invite_board_id
   for update;

  if not found then
    raise exception 'This invitation is invalid, expired, canceled, or already used.'
      using errcode = '22023';
  end if;

  -- Re-read and lock the invitation after its parent is locked. This makes
  -- concurrent acceptance/cancellation serialize and observe the final state.
  select i.expires_at, i.accepted_at, i.canceled_at
    into invite_expires_at, invite_accepted_at, invite_canceled_at
    from public.board_invites as i
   where i.id = matched_invite_id
     and i.board_id = locked_board_id
     and i.token_hash = token_digest
   for update;

  -- Capture wall-clock time after obtaining both locks. statement_timestamp()
  -- would be stale if this call waited across the expiration boundary.
  acceptance_time := pg_catalog.clock_timestamp();

  if not found
     or invite_accepted_at is not null
     or invite_canceled_at is not null
     or invite_expires_at <= acceptance_time then
    raise exception 'This invitation is invalid, expired, canceled, or already used.'
      using errcode = '22023';
  end if;

  -- Existing membership is intentionally a no-op: opening a valid link for an
  -- account already on the board must not create a duplicate membership row.
  insert into public.board_members (board_id, user_id, role)
  values (locked_board_id, current_user_id, 'member')
  on conflict (board_id, user_id) do nothing;

  update public.board_invites as i
     set accepted_at = acceptance_time,
         accepted_by = current_user_id
   where i.id = matched_invite_id
     and i.board_id = locked_board_id;

  return locked_board_id;
end;
$function$;

comment on function public.accept_board_invite(text) is
  'Accepts a valid, unexpired, uncanceled one-time invitation for a signed-in user with a confirmed email. Looks up only the SHA-256 digest of the 128-character token, serializes board then invitation locks, inserts membership without duplicating existing membership, and records the accepting user atomically.';

revoke all on function public.accept_board_invite(text) from public, anon, authenticated;
grant execute on function public.accept_board_invite(text) to authenticated;
