begin;

select plan(28);

select has_function('public', 'list_board_member_profiles', array['uuid'], 'scoped roster profile RPC exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.list_board_member_profiles(uuid)'::regprocedure),
  'scoped roster profile RPC uses definer privileges for protected profile reads'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.list_board_member_profiles(uuid)'::regprocedure),
  'scoped roster profile RPC pins search_path'
);
select ok(
  has_function_privilege('authenticated', 'public.list_board_member_profiles(uuid)', 'EXECUTE'),
  'authenticated users can execute scoped roster profile RPC'
);
select ok(
  not has_function_privilege('anon', 'public.list_board_member_profiles(uuid)', 'EXECUTE'),
  'anonymous users cannot execute scoped roster profile RPC'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.boards'::regclass),
  'RLS remains enabled on boards'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS remains enabled on profiles'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'boards' and policyname = 'boards_select_member'),
  'member-only board SELECT policy exists'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT'),
  'profile SELECT policies remain closed; roster data is exposed only through the scoped RPC'
);

select ok(has_table_privilege('authenticated', 'public.boards', 'SELECT'), 'authenticated role has board SELECT grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated role has no direct profile SELECT grant');
select ok(not has_table_privilege('authenticated', 'public.boards', 'INSERT'), 'authenticated role has no direct board INSERT grant');
select ok(not has_table_privilege('authenticated', 'public.boards', 'UPDATE'), 'authenticated role has no direct board UPDATE grant');
select ok(not has_table_privilege('authenticated', 'public.boards', 'DELETE'), 'authenticated role has no direct board DELETE grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated role has no direct profile INSERT grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated role has no direct profile UPDATE grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated role has no direct profile DELETE grant');
select ok(not has_table_privilege('anon', 'public.boards', 'SELECT'), 'anonymous role cannot select boards');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous role cannot select profiles');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('28000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-8@example.test', '', now(), now(), now()),
  ('28000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-8@example.test', '', now(), now(), now()),
  ('28000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-8@example.test', '', now(), now(), now());

insert into public.profiles (id, display_name) values
  ('28000000-0000-4000-8000-000000000001', 'Owner'),
  ('28000000-0000-4000-8000-000000000002', 'Member'),
  ('28000000-0000-4000-8000-000000000003', 'Outsider');

insert into public.boards (id, name, owner_id) values
  ('28000000-0000-4000-8000-000000000010', 'Shared board', '28000000-0000-4000-8000-000000000001'),
  ('28000000-0000-4000-8000-000000000020', 'Private board', '28000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('28000000-0000-4000-8000-000000000010', '28000000-0000-4000-8000-000000000001', 'owner'),
  ('28000000-0000-4000-8000-000000000010', '28000000-0000-4000-8000-000000000002', 'member'),
  ('28000000-0000-4000-8000-000000000020', '28000000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.boards), 1, 'member sees only the board they belong to');
select ok((select id = '28000000-0000-4000-8000-000000000010'::uuid from public.boards), 'member can read the shared board');
select is((select count(*)::integer from public.list_board_member_profiles('28000000-0000-4000-8000-000000000010')), 2, 'member sees only profiles in the shared-board roster');
select ok(exists (select 1 from public.list_board_member_profiles('28000000-0000-4000-8000-000000000010') where user_id = '28000000-0000-4000-8000-000000000001'), 'member can see the shared board owner profile');
select ok(not exists (select 1 from public.list_board_member_profiles('28000000-0000-4000-8000-000000000010') where user_id = '28000000-0000-4000-8000-000000000003'), 'member cannot see unrelated profile');

select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.boards), 1, 'owner sees their board');
select is((select count(*)::integer from public.list_board_member_profiles('28000000-0000-4000-8000-000000000010')), 2, 'owner sees profiles sharing their board');

select set_config('request.jwt.claim.sub', '28000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.boards), 1, 'outsider sees only their own separate board');
select is((select count(*)::integer from public.list_board_member_profiles('28000000-0000-4000-8000-000000000020')), 1, 'outsider sees only their own roster profile');

reset role;
select * from finish();
rollback;
