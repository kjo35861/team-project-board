-- 2.20: Expose only the profile fields needed to identify members on a board.
-- Direct profile-table reads could reveal implementation metadata such as
-- created_at/updated_at, so profile data is available only through this scoped
-- roster function.

revoke all privileges on table public.profiles
  from public, anon, authenticated;

drop policy if exists profiles_select_visible on public.profiles;
drop function if exists public.can_view_profile(uuid);

create function public.list_board_member_profiles(p_board_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select bm.user_id, p.display_name, bm.role
    from public.board_members as bm
    left join public.profiles as p
      on p.id = bm.user_id
   where bm.board_id = p_board_id
     and auth.uid() is not null
     and public.is_board_member(p_board_id)
   order by bm.role, bm.user_id;
$function$;

comment on function public.list_board_member_profiles(uuid) is
  'Returns only user_id, display_name, and board role for the current authenticated member’s own board. Does not expose profile timestamps, authentication email, or profiles from unrelated boards.';

revoke all on function public.list_board_member_profiles(uuid) from public, anon, authenticated;
grant execute on function public.list_board_member_profiles(uuid) to authenticated;
