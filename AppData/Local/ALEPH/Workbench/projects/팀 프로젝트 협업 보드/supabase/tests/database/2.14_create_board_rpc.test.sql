begin;

select plan(23);

select has_function('public', 'create_board', array['text'], 'create_board(text) RPC exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.create_board(text)'::regprocedure),
  'board creation RPC runs as SECURITY DEFINER'
);
select ok(
  (select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog']
     from pg_proc where oid = 'public.create_board(text)'::regprocedure),
  'board creation RPC uses a fixed pg_catalog search_path'
);
select ok(has_function_privilege('authenticated', 'public.create_board(text)', 'EXECUTE'), 'authenticated users can execute the board creation RPC');
select ok(not has_function_privilege('anon', 'public.create_board(text)', 'EXECUTE'), 'anonymous users cannot execute the board creation RPC');
select ok(
  not exists (
    select 1
      from pg_proc as p
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
     where p.oid = 'public.create_board(text)'::regprocedure
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute the board creation RPC'
);
select ok(not has_table_privilege('authenticated', 'public.boards', 'INSERT'), 'authenticated users cannot insert boards directly');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'INSERT'), 'authenticated users cannot insert memberships directly');
select ok(has_table_privilege('authenticated', 'public.boards', 'SELECT'), 'authenticated users retain policy-protected board reads');
select ok(has_table_privilege('authenticated', 'public.board_members', 'SELECT'), 'authenticated users retain policy-protected membership reads');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values (
  '2b000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'owner-2-14@example.test', '', now(), now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select set_config('test.created_board_id', public.create_board('  Sprint Board  ')::text, true)$$,
  'authenticated user can create a board through the RPC'
);
select is(
  (select name from public.boards where id = current_setting('test.created_board_id')::uuid),
  'Sprint Board',
  'RPC trims surrounding whitespace from the board name'
);
select is(
  (select owner_id from public.boards where id = current_setting('test.created_board_id')::uuid),
  '2b000000-0000-4000-8000-000000000001'::uuid,
  'RPC always assigns the authenticated user as board owner'
);
select is(
  (select role from public.board_members where board_id = current_setting('test.created_board_id')::uuid
     and user_id = '2b000000-0000-4000-8000-000000000001'),
  'owner',
  'RPC creates the matching owner membership'
);
select is(
  (select count(*)::integer from public.board_members where board_id = current_setting('test.created_board_id')::uuid),
  1,
  'new board has exactly one initial membership'
);

select throws_ok(
  $$select public.create_board('   ')$$,
  '22023', null,
  'rejects a board name containing only whitespace'
);
select throws_ok(
  $$select public.create_board(null::text)$$,
  '22023', null,
  'rejects a null board name'
);
select throws_ok(
  $$select public.create_board(repeat('x', 61))$$,
  '22023', null,
  'rejects a board name longer than 60 characters'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_board('Unauthenticated board')$$,
  '28000', null,
  'rejects an authenticated-role call with no signed-in user identity'
);
select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000001', true);

-- Force the deferred owner-membership invariant to run immediately after the
-- board INSERT. The expected constraint failure must roll back the whole RPC
-- statement, including the board row inserted earlier in the function.
set constraints all immediate;
select throws_ok(
  $$select public.create_board('Atomic failure board')$$,
  '23514', null,
  'a failure between board and membership inserts aborts the RPC atomically'
);
select is(
  (select count(*)::integer from public.boards where name = 'Atomic failure board'),
  0,
  'failed RPC leaves no orphan board behind'
);
set constraints all deferred;

select lives_ok(
  $$select set_config('test.boundary_board_id', public.create_board(repeat('x', 60))::text, true)$$,
  'accepts a board name at the 60-character limit'
);
select is(
  (select char_length(name)::integer from public.boards where id = current_setting('test.boundary_board_id')::uuid),
  60,
  'persists the valid maximum-length board name'
);

reset role;
select * from finish();
rollback;
