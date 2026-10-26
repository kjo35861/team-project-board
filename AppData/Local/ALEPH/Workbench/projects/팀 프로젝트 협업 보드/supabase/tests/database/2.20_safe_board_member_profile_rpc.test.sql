begin;

select plan(20);

select has_function('public', 'list_board_member_profiles', array['uuid'], 'safe roster profile RPC exists');
select is(
  pg_get_function_result('public.list_board_member_profiles(uuid)'::regprocedure),
  'TABLE(user_id uuid, display_name text, role text)',
  'RPC returns only user id, display name, and board role'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.list_board_member_profiles(uuid)'::regprocedure),
  'roster profile RPC uses SECURITY DEFINER for protected table reads'
);
select ok(
  (select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.list_board_member_profiles(uuid)'::regprocedure),
  'roster profile RPC pins search_path'
);
select ok(has_function_privilege('authenticated', 'public.list_board_member_profiles(uuid)', 'EXECUTE'), 'authenticated users can execute roster profile RPC');
select ok(not has_function_privilege('anon', 'public.list_board_member_profiles(uuid)', 'EXECUTE'), 'anonymous users cannot execute roster profile RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.list_board_member_profiles(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute roster profile RPC'
);
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profile table RLS remains enabled');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated users cannot select profile rows directly');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous users cannot select profile rows directly');
select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'
  ), 'direct profile SELECT policies are removed'
);
select ok(not exists (
  select 1 from pg_proc where oid = to_regprocedure('public.can_view_profile(uuid)')
), 'the obsolete broad profile-visibility helper is removed');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2f200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-20@example.test', '', now(), now(), now()),
  ('2f200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-20@example.test', '', now(), now(), now()),
  ('2f200000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'separate-2-20@example.test', '', now(), now(), now()),
  ('2f200000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'unrelated-2-20@example.test', '', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('2f200000-0000-4000-8000-000000000001', 'Board Owner'),
  ('2f200000-0000-4000-8000-000000000002', 'Board Member'),
  ('2f200000-0000-4000-8000-000000000003', 'Separate Owner'),
  ('2f200000-0000-4000-8000-000000000004', null);

insert into public.boards (id, name, owner_id) values
  ('2f200000-0000-4000-8000-000000000010', 'Shared roster', '2f200000-0000-4000-8000-000000000001'),
  ('2f200000-0000-4000-8000-000000000020', 'Separate roster', '2f200000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2f200000-0000-4000-8000-000000000010', '2f200000-0000-4000-8000-000000000001', 'owner'),
  ('2f200000-0000-4000-8000-000000000010', '2f200000-0000-4000-8000-000000000002', 'member'),
  ('2f200000-0000-4000-8000-000000000020', '2f200000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2f200000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')),
  2,
  'member receives only profiles in their own board roster'
);
select ok(exists (
  select 1 from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')
   where user_id = '2f200000-0000-4000-8000-000000000001'
     and display_name = 'Board Owner'
     and role = 'owner'
), 'roster response includes the owner display name and role');
select ok(exists (
  select 1 from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')
   where user_id = '2f200000-0000-4000-8000-000000000002'
     and display_name = 'Board Member'
     and role = 'member'
), 'roster response includes the caller profile and role');
select ok(not exists (
  select 1 from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')
   where user_id = '2f200000-0000-4000-8000-000000000003'
), 'profile from another board is not exposed');

select set_config('request.jwt.claim.sub', '2f200000-0000-4000-8000-000000000003', true);
select is(
  (select count(*)::integer from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000020')),
  1,
  'another board owner receives only their own roster'
);
select is(
  (select count(*)::integer from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')),
  0,
  'a nonmember receives no profiles for a different board'
);

select set_config('request.jwt.claim.sub', '2f200000-0000-4000-8000-000000000004', true);
select is(
  (select count(*)::integer from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')),
  0,
  'a user with no board membership receives no roster profiles'
);

select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::integer from public.list_board_member_profiles('2f200000-0000-4000-8000-000000000010')),
  0,
  'an unauthenticated request receives no roster profiles'
);

reset role;
select * from finish();
rollback;
