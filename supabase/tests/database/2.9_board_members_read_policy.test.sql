begin;

select plan(16);

select has_table('public', 'board_members', 'board_members table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_members'::regclass),
  'RLS remains enabled on board_members'
);
select ok(
  exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'board_members'
       and policyname = 'board_members_select_members'
       and cmd = 'SELECT'
  ),
  'board roster SELECT policy exists'
);
select ok(has_table_privilege('authenticated', 'public.board_members', 'SELECT'), 'authenticated role has roster SELECT grant');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'INSERT'), 'authenticated role cannot insert memberships directly');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'UPDATE'), 'authenticated role cannot update memberships directly');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'DELETE'), 'authenticated role cannot delete memberships directly');
select ok(not has_table_privilege('anon', 'public.board_members', 'SELECT'), 'anonymous role cannot read memberships');
select ok(has_function_privilege('authenticated', 'public.is_board_member(uuid)', 'EXECUTE'), 'authenticated role can evaluate membership policy');
select ok(not has_function_privilege('anon', 'public.is_board_member(uuid)', 'EXECUTE'), 'anonymous role cannot execute membership helper');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('29000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-9@example.test', '', now(), now(), now()),
  ('29000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-9@example.test', '', now(), now(), now()),
  ('29000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-9@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('29000000-0000-4000-8000-000000000010', 'Shared roster board', '29000000-0000-4000-8000-000000000001'),
  ('29000000-0000-4000-8000-000000000020', 'Separate roster board', '29000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('29000000-0000-4000-8000-000000000010', '29000000-0000-4000-8000-000000000001', 'owner'),
  ('29000000-0000-4000-8000-000000000010', '29000000-0000-4000-8000-000000000002', 'member'),
  ('29000000-0000-4000-8000-000000000020', '29000000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.board_members), 2, 'member sees the roster for their board');
select ok(exists (
  select 1 from public.board_members
   where board_id = '29000000-0000-4000-8000-000000000010'
     and user_id = '29000000-0000-4000-8000-000000000001'
     and role = 'owner'
), 'member can see the owner and role on their board');
select ok(not exists (
  select 1 from public.board_members
   where user_id = '29000000-0000-4000-8000-000000000003'
), 'member cannot see a separate board roster');

select set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.board_members), 2, 'owner sees the roster for their board');

select set_config('request.jwt.claim.sub', '29000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.board_members), 1, 'separate board owner sees only their own roster');
select ok(not exists (
  select 1 from public.board_members
   where board_id = '29000000-0000-4000-8000-000000000010'
), 'separate board owner cannot see another board roster');

reset role;
select * from finish();
rollback;
