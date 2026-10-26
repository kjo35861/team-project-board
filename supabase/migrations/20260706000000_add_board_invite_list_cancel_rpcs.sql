-- 2.18: Let board owners inspect safe invitation metadata and cancel a
-- still-pending invitation. Raw tokens and token digests are never returned.
-- Board-first locking gives cancellation a stable order relative to board
-- management and the later invitation-acceptance RPC.

create function public.list_board_invites(p_board_id uuid)
returns table (
  invite_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  canceled_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  board_owner_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to list board invitations.'
      using errcode = '28000';
  end if;

  select b.owner_id
    into board_owner_id
    from public.boards as b
   where b.id = p_board_id;

  if board_owner_id is distinct from current_user_id then
    raise exception 'Only the board owner may list its invitations.'
      using errcode = '42501';
  end if;

  return query
    select i.id,
           i.created_at,
           i.expires_at,
           i.accepted_at,
           i.accepted_by,
           i.canceled_at,
           case
             when i.accepted_at is not null then 'accepted'
             when i.canceled_at is not null then 'canceled'
             when i.expires_at <= pg_catalog.statement_timestamp() then 'expired'
             else 'pending'
           end
      from public.board_invites as i
     where i.board_id = p_board_id
     order by i.created_at desc, i.id;
end;
$function$;

comment on function public.list_board_invites(uuid) is
  'Lists invitation metadata for the authenticated board owner. Exposes neither raw invitation tokens nor their stored hashes; expiration status is derived at read time.';

create function public.cancel_board_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  invite_board_id uuid;
  board_owner_id uuid;
  invite_expires_at timestamptz;
  invite_accepted_at timestamptz;
  invite_canceled_at timestamptz;
  canceled_invite_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to cancel an invitation.'
      using errcode = '28000';
  end if;

  -- Discover the parent, then acquire locks in board -> invitation order.
  -- The parent ownership is rechecked after locking the board row.
  select i.board_id
    into invite_board_id
    from public.board_invites as i
   where i.id = p_invite_id;

  if not found then
    raise exception 'Only the board owner may cancel this invitation.'
      using errcode = '42501';
  end if;

  select b.owner_id
    into board_owner_id
    from public.boards as b
   where b.id = invite_board_id
   for update;

  if not found or board_owner_id is distinct from current_user_id then
    raise exception 'Only the board owner may cancel this invitation.'
      using errcode = '42501';
  end if;

  select i.expires_at, i.accepted_at, i.canceled_at
    into invite_expires_at, invite_accepted_at, invite_canceled_at
    from public.board_invites as i
   where i.id = p_invite_id
     and i.board_id = invite_board_id
   for update;

  if not found then
    raise exception 'Only the board owner may cancel this invitation.'
      using errcode = '42501';
  end if;

  if invite_accepted_at is not null
     or invite_canceled_at is not null
     or invite_expires_at <= pg_catalog.statement_timestamp() then
    raise exception 'Only a pending, unexpired invitation can be canceled.'
      using errcode = '22023';
  end if;

  update public.board_invites as i
     set canceled_at = pg_catalog.statement_timestamp()
   where i.id = p_invite_id
     and i.board_id = invite_board_id
  returning i.id into canceled_invite_id;

  return canceled_invite_id;
end;
$function$;

comment on function public.cancel_board_invite(uuid) is
  'Cancels an unused, unexpired invitation only for its authenticated board owner. Locks the board before the invitation so cancellation can be serialized with acceptance and board management.';

revoke all on function public.list_board_invites(uuid) from public, anon, authenticated;
revoke all on function public.cancel_board_invite(uuid) from public, anon, authenticated;
grant execute on function public.list_board_invites(uuid) to authenticated;
grant execute on function public.cancel_board_invite(uuid) to authenticated;
