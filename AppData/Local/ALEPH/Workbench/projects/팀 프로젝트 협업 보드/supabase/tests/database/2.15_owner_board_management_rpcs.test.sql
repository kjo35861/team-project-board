begin;

select plan(39);

select has_function('public', 'rename_board', array['uuid', 'text'], 'rename_board(uuid, text) RPC exists');
select has_function('public', 'delete_board', array['uuid'], 'delete_board(uuid) RPC exists');
select ok((select prosecdef from pg_proc where oid = 'public.rename_board(uuid, text)'::regprocedure), 'rename RPC runs as SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.delete_board(uuid)'::regprocedure), 'delete RPC runs as SECURITY DEFINER');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.rename_board(uuid, text)'::regprocedure), 'rename RPC pins search_path');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.delete_board(uuid)'::regprocedure), 'delete RPC pins search_path');
select ok(has_function_privilege('authenticated', 'public.rename_board(uuid, text)', 'EXECUTE'), 'authenticated users can execute rename RPC');
select ok(has_function_privilege('authenticated', 'public.delete_board(uuid)', 'EXECUTE'), 'authenticated users can execute delete RPC');
select ok(not has_function_privilege('anon', 'public.rename_board(uuid, text)', 'EXECUTE'), 'anonymous users cannot execute rename RPC');
select ok(not has_function_privilege('anon', 'public.delete_board(uuid)', 'EXECUTE'), 'anonymous users cannot execute delete RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.rename_board(uuid, text)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute rename RPC'
);
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.delete_board(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute delete RPC'
);
select ok(not has_table_privilege('authenticated', 'public.boards', 'UPDATE'), 'authenticated users cannot update boards directly');
select ok(not has_table_privilege('authenticated', 'public.boards', 'DELETE'), 'authenticated users cannot delete boards directly');
select ok(not has_table_privilege('anon', 'public.boards', 'UPDATE'), 'anonymous users cannot update boards');
select ok(not has_table_privilege('anon', 'public.boards', 'DELETE'), 'anonymous users cannot delete boards');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-15@example.test', '', now(), now(), now()),
  ('2c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-15@example.test', '', now(), now(), now()),
  ('2c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-15@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2c000000-0000-4000-8000-000000000010', 'Shared management board', '2c000000-0000-4000-8000-000000000001'),
  ('2c000000-0000-4000-8000-000000000020', 'Outsider private board', '2c000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2c000000-0000-4000-8000-000000000010', '2c000000-0000-4000-8000-000000000001', 'owner'),
  ('2c000000-0000-4000-8000-000000000010', '2c000000-0000-4000-8000-000000000002', 'member'),
  ('2c000000-0000-4000-8000-000000000020', '2c000000-0000-4000-8000-000000000003', 'owner');

insert into public.tasks (id, board_id, title, created_by) values
  ('2c000000-0000-4000-8000-000000000101', '2c000000-0000-4000-8000-000000000010', 'Shared board task', '2c000000-0000-4000-8000-000000000002'),
  ('2c000000-0000-4000-8000-000000000201', '2c000000-0000-4000-8000-000000000020', 'Private board task', '2c000000-0000-4000-8000-000000000003');

insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at
) values (
  '2c000000-0000-4000-8000-000000000301',
  '2c000000-0000-4000-8000-000000000010',
  repeat('a', 64),
  '2c000000-0000-4000-8000-000000000001',
  '2026-07-03 00:00:00+00',
  '2026-07-10 00:00:00+00'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000001', true);

select is(
  public.rename_board('2c000000-0000-4000-8000-000000000010', '  Renamed board  '),
  '2c000000-0000-4000-8000-000000000010'::uuid,
  'owner can rename their board and receives its id'
);
select is(
  (select name from public.boards where id = '2c000000-0000-4000-8000-000000000010'),
  'Renamed board',
  'rename RPC trims surrounding whitespace'
);
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', '   ')$$, '22023', null, 'rename rejects whitespace-only names');
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', null::text)$$, '22023', null, 'rename rejects a NULL name');
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', repeat('x', 61))$$, '22023', null, 'rename rejects names longer than 60 characters');
select lives_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', repeat('x', 60))$$, 'rename accepts a name at the 60-character limit');
select is((select char_length(name)::integer from public.boards where id = '2c000000-0000-4000-8000-000000000010'), 60, 'rename persists the valid maximum-length name');
select lives_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', 'Renamed board')$$, 'owner can rename the board after boundary validation');

select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', 'Member rename')$$, '42501', null, 'team member cannot rename the board');
select throws_ok($$select public.delete_board('2c000000-0000-4000-8000-000000000010')$$, '42501', null, 'team member cannot delete the board');
select ok(exists (select 1 from public.boards where id = '2c000000-0000-4000-8000-000000000010'), 'board remains after member management attempts');

select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', 'Outsider rename')$$, '42501', null, 'non-member cannot rename another board');
select throws_ok($$select public.delete_board('2c000000-0000-4000-8000-000000000010')$$, '42501', null, 'non-member cannot delete another board');
select ok(exists (select 1 from public.boards where id = '2c000000-0000-4000-8000-000000000010'), 'board remains after non-member management attempts');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.rename_board('2c000000-0000-4000-8000-000000000010', 'No identity')$$, '28000', null, 'rename rejects a missing authenticated identity');
select throws_ok($$select public.delete_board('2c000000-0000-4000-8000-000000000010')$$, '28000', null, 'delete rejects a missing authenticated identity');

select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.delete_board('2c000000-0000-4000-8000-000000000010')$$, 'owner can delete their board');
reset role;
select ok(not exists (select 1 from public.boards where id = '2c000000-0000-4000-8000-000000000010'), 'owner-deleted board is gone');
select ok(not exists (select 1 from public.tasks where board_id = '2c000000-0000-4000-8000-000000000010'), 'board deletion cascades to its tasks');
select ok(not exists (select 1 from public.board_members where board_id = '2c000000-0000-4000-8000-000000000010'), 'board deletion cascades to its memberships');
select ok(not exists (select 1 from public.board_invites where board_id = '2c000000-0000-4000-8000-000000000010'), 'board deletion cascades to its invitations');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000003', true);
select lives_ok($$select public.delete_board('2c000000-0000-4000-8000-000000000020')$$, 'owner can delete their separate board');
reset role;
select ok(not exists (select 1 from public.boards where id = '2c000000-0000-4000-8000-000000000020'), 'separate owner-deleted board is gone');
select ok(not exists (select 1 from public.tasks where board_id = '2c000000-0000-4000-8000-000000000020'), 'second board deletion also cascades to its tasks');

select * from finish();
rollback;
