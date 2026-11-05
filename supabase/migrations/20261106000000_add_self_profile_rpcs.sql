-- Self-only profile RPCs. Direct table access remains closed.
create function public.get_my_profile()
returns table(user_id uuid, display_name text)
language sql stable security definer set search_path = pg_catalog
as $function$
  select u.id, p.display_name from (select auth.uid() as id) u
  left join public.profiles p on p.id=u.id where u.id is not null;
$function$;
create function public.set_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path = pg_catalog
as $function$
declare v_user uuid := auth.uid(); v_name text := btrim(p_display_name);
begin
  if v_user is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if v_name is null or char_length(v_name) not between 1 and 80 or v_name !~ '[^[:space:]]' then
    raise exception 'Display name must contain 1 to 80 characters' using errcode='22023';
  end if;
  insert into public.profiles(id,display_name) values(v_user,v_name)
  on conflict(id) do update set display_name=excluded.display_name;
  return v_name;
end; $function$;
revoke all on function public.get_my_profile(),public.set_my_display_name(text) from public,anon,authenticated;
grant execute on function public.get_my_profile(),public.set_my_display_name(text) to authenticated;
