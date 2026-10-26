-- 2.16: Allow a regular member to leave a board and its owner to remove a member.
-- Membership changes are performed only through these narrowly granted RPCs.

create function public.leave_board(p_board_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  board_owner_id uuid;
  departed_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to leave a board.'
      using errcode = '28000';
  end if;

  -- Lock the board to serialize leaving/removal against owner management.
  select b.owner_id
    into board_owner_id
    from public.boards as b
   where b.id = p_board_id
   for update;

  if board_owner_id = current_user_id then
    raise exception 'The board owner cannot leave their board.'
      using errcode = '42501';
  end if;

  delete from public.board_members as bm
   where bm.board_id = p_board_id
     and bm.user_id = current_user_id
     and bm.role = 'member'
  returning bm.user_id into departed_user_id;

  if departed_user_id is null then
    raise exception 'Only a current board member may leave this board.'
      using errcode = '42501';
  end if;

  -- The tasks composite FK clears only assignee_id, preserving each task.
  return p_board_id;
end;
$function$;

comment on function public.leave_board(uuid) is
  'Removes the authenticated regular member from a board. Owners cannot leave; assigned tasks remain and become unassigned through the membership foreign key.';

create function public.remove_board_member(p_board_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  board_owner_id uuid;
  removed_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to remove a board member.'
      using errcode = '28000';
  end if;

  -- Lock the board so membership management is serialized for this board.
  select b.owner_id
    into board_owner_id
    from public.boards as b
   where b.id = p_board_id
   for update;

  if board_owner_id is distinct from current_user_id then
    raise exception 'Only the board owner may remove a member.'
      using errcode = '42501';
  end if;

  -- The owner row and self-removal are both excluded. Missing/non-member
  -- targets intentionally share the same response to avoid exposing roster data.
  delete from public.board_members as bm
   where bm.board_id = p_board_id
     and bm.user_id = p_user_id
     and bm.role = 'member'
     and bm.user_id <> current_user_id
  returning bm.user_id into removed_user_id;

  if removed_user_id is null then
    raise exception 'The target is not a removable member of this board.'
      using errcode = '42501';
  end if;

  -- The tasks composite FK clears only assignee_id, preserving each task.
  return removed_user_id;
end;
$function$;

comment on function public.remove_board_member(uuid, uuid) is
  'Allows the authenticated board owner to remove another regular member. The owner cannot be removed; assigned tasks remain and become unassigned through the membership foreign key.';

revoke all on function public.leave_board(uuid) from public, anon, authenticated;
revoke all on function public.remove_board_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_board(uuid) to authenticated;
grant execute on function public.remove_board_member(uuid, uuid) to authenticated;
