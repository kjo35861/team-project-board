-- 2.15: Restrict board renaming and deletion to the authenticated board owner.
-- Elevated functions use a fixed search_path and fully-qualified objects; the
-- caller cannot supply an owner identity or write directly to the boards table.

create function public.rename_board(p_board_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  normalized_name text;
  updated_board_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to rename a board.'
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

  update public.boards as b
     set name = normalized_name
   where b.id = p_board_id
     and b.owner_id = current_user_id
     and public.is_board_owner(b.id)
  returning b.id into updated_board_id;

  if updated_board_id is null then
    raise exception 'Only the board owner may rename this board.'
      using errcode = '42501';
  end if;

  return updated_board_id;
end;
$function$;

comment on function public.rename_board(uuid, text) is
  'Renames a board only for its authenticated owner. The name is trimmed and validated; callers cannot update board metadata directly.';

create function public.delete_board(p_board_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  current_user_id uuid;
  deleted_board_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'A signed-in user is required to delete a board.'
      using errcode = '28000';
  end if;

  delete from public.boards as b
   where b.id = p_board_id
     and b.owner_id = current_user_id
     and public.is_board_owner(b.id)
  returning b.id into deleted_board_id;

  if deleted_board_id is null then
    raise exception 'Only the board owner may delete this board.'
      using errcode = '42501';
  end if;

  return deleted_board_id;
end;
$function$;

comment on function public.delete_board(uuid) is
  'Permanently deletes a board only for its authenticated owner. Existing foreign keys remove its tasks, memberships, and invitations atomically.';

revoke all on function public.rename_board(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_board(uuid) from public, anon, authenticated;
grant execute on function public.rename_board(uuid, text) to authenticated;
grant execute on function public.delete_board(uuid) to authenticated;
