-- 2.8: Allow authenticated users to read only boards they belong to and
-- minimal profiles that are either their own or share a board with them.
-- All writes remain denied until later, narrowly-scoped steps.

create function public.can_view_profile(p_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select auth.uid() is not null
     and (
       p_target_user_id = auth.uid()
       or exists (
         select 1
           from public.board_members as viewer_membership
           join public.board_members as target_membership
             on target_membership.board_id = viewer_membership.board_id
          where viewer_membership.user_id = auth.uid()
            and target_membership.user_id = p_target_user_id
       )
     );
$function$;

comment on function public.can_view_profile(uuid) is
  'Returns whether the current authenticated user may read a minimal profile: their own, or a user sharing at least one board. SECURITY DEFINER helper for profiles RLS.';

revoke all on function public.can_view_profile(uuid) from public, anon, authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- Explicitly retain deny-by-default writes while granting only the reads
-- protected by the policies below.
revoke all privileges on table public.boards, public.profiles
  from public, anon, authenticated;
grant select on table public.boards, public.profiles to authenticated;

create policy boards_select_member
  on public.boards
  for select
  to authenticated
  using (public.is_board_member(id));

create policy profiles_select_visible
  on public.profiles
  for select
  to authenticated
  using (public.can_view_profile(id));

comment on policy boards_select_member on public.boards is
  'Authenticated users may read boards only when they are members of the board.';
comment on policy profiles_select_visible on public.profiles is
  'Authenticated users may read their own minimal profile and profiles of users sharing a board with them.';
