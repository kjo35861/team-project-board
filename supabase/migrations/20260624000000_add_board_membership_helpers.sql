-- 2.6: Non-recursive membership/owner predicates for later RLS policies.
-- These SECURITY DEFINER helpers read board_members as the migration owner,
-- avoiding a board_members policy recursively querying board_members itself.

create function public.is_board_member(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
      from public.board_members as bm
     where bm.board_id = target_board_id
       and bm.user_id = auth.uid()
  );
$function$;

comment on function public.is_board_member(uuid) is
  'Returns whether the current authenticated user belongs to the specified board. SECURITY DEFINER helper for membership-based RLS policies.';

create function public.is_board_owner(target_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
      from public.boards as b
      join public.board_members as bm
        on bm.board_id = b.id
       and bm.user_id = b.owner_id
       and bm.role = 'owner'
     where b.id = target_board_id
       and b.owner_id = auth.uid()
  );
$function$;

comment on function public.is_board_owner(uuid) is
  'Returns whether the current authenticated user is the matching owner member of the specified board. SECURITY DEFINER helper for owner-only RLS policies.';

-- A fixed pg_catalog-only path and fully-qualified object references prevent
-- caller-controlled name resolution inside these elevated functions.
revoke all on function public.is_board_member(uuid) from public, anon, authenticated;
revoke all on function public.is_board_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_board_member(uuid) to authenticated;
grant execute on function public.is_board_owner(uuid) to authenticated;
