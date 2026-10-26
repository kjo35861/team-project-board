-- 2.9: Let authenticated board members read only their own board's roster.
-- Membership mutations remain closed; later atomic RPCs enforce invite,
-- removal, and leave rules without allowing clients to edit this table directly.

revoke all privileges on table public.board_members
  from public, anon, authenticated;
grant select on table public.board_members to authenticated;

create policy board_members_select_members
  on public.board_members
  for select
  to authenticated
  using (public.is_board_member(board_id));

comment on policy board_members_select_members on public.board_members is
  'A signed-in user can read membership rows only for boards they belong to; membership changes are reserved for controlled database operations.';
