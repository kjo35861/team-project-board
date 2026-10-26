-- 2.14: Create a board and its matching owner membership atomically.
-- The caller receives no direct INSERT grant on either table; this narrowly
-- granted SECURITY DEFINER function is the only creation path for this step.

create function public.create_board(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  normalized_name text;
  created_board_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to create a board.'
      using errcode = '28000';
  end if;

  if p_name is null then
    raise exception 'Board name must contain 1 to 60 non-whitespace characters.'
      using errcode = '22023';
  end if;

  normalized_name := btrim(p_name);
  if char_length(normalized_name) < 1
     or char_length(normalized_name) > 60
     or normalized_name !~ '[^[:space:]]' then
    raise exception 'Board name must contain 1 to 60 non-whitespace characters.'
      using errcode = '22023';
  end if;

  insert into public.boards (name, owner_id)
  values (normalized_name, current_user_id)
  returning id into created_board_id;

  -- A deferred database constraint verifies this matching owner membership at
  -- transaction end. If either insert fails, PostgreSQL rolls back both.
  insert into public.board_members (board_id, user_id, role)
  values (created_board_id, current_user_id, 'owner');

  return created_board_id;
end;
$function$;

comment on function public.create_board(text) is
  'Atomically creates a board owned by auth.uid() and its matching owner membership. Board names are trimmed and validated; only authenticated callers may execute this RPC.';

revoke all on function public.create_board(text) from public, anon, authenticated;
grant execute on function public.create_board(text) to authenticated;
