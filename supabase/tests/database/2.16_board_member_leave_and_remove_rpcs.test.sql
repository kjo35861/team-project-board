begin;

select plan(37);

select has_function('public', 'leave_board', array['uuid'], 'leave_board(uuid) RPC exists');
select has_function('public', 'remove_board_member', array['uuid', 'uuid'], 'remove_board_member(uuid, uuid) RPC exists');
select ok((select prosecdef from pg_proc where oid = 'public.leave_board(uuid)'::regprocedure), 'leave RPC runs as SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.remove_board_member(uuid, uuid)'::regprocedure), 'remove-member RPC runs as SECURITY DEFINER');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.leave_board(uuid)'::regprocedure), 'leave RPC pins search_path');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.remove_board_member(uuid, uuid)'::regprocedure), 'remove-member RPC pins search_path');
select ok(has_function_privilege('authenticated', 'public.leave_board(uuid)', 'EXECUTE'), 'authenticated users can execute leave RPC');
select ok(has_function_privilege('authenticated', 'public.remove_board_member(uuid, uuid)', 'EXECUTE'), 'authenticated users can execute remove-member RPC');
select ok(not has_function_privilege('anon', 'public.leave_board(uuid)', 'EXECUTE'), 'anonymous users cannot execute leave RPC');
select ok(not has_function_privilege('anon', 'public.remove_board_member(uuid, uuid)', 'EXECUTE'), 'anonymous users cannot execute remove-member RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.leave_board(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute leave RPC'
);
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.remove_board_member(uuid, uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute remove-member RPC'
);
select ok(not has_table_privilege('authenticated', 'public.board_members', 'INSERT'), 'authenticated users cannot insert memberships directly');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'UPDATE'), 'authenticated users cannot update memberships directly');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'DELETE'), 'authenticated users cannot delete memberships directly');
select ok(not has_table_privilege('anon', 'public.board_members', 'DELETE'), 'anonymous users cannot delete memberships');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2d000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-16@example.test', '', now(), now(), now()),
  ('2d000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'leaving-member-2-16@example.test', '', now(), now(), now()),
  ('2d000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'removed-member-2-16@example.test', '', now(), now(), now()),
  ('2d000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'outsider-2-16@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2d000000-0000-4000-8000-000000000010', 'Member management board', '2d000000-0000-4000-8000-000000000001'),
  ('2d000000-0000-4000-8000-000000000020', 'Outsider private board', '2d000000-0000-4000-8000-000000000004');

insert into public.board_members (board_id, user_id, role) values
  ('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000001', 'owner'),
  ('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000002', 'member'),
  ('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003', 'member'),
  ('2d000000-0000-4000-8000-000000000020', '2d000000-0000-4000-8000-000000000004', 'owner');

insert into public.tasks (id, board_id, title, assignee_id, created_by) values
  ('2d000000-0000-4000-8000-000000000101', '2d000000-0000-4000-8000-000000000010', 'Task assigned to leaving member', '2d000000-0000-4000-8000-000000000002', '2d000000-0000-4000-8000-000000000001'),
  ('2d000000-0000-4000-8000-000000000102', '2d000000-0000-4000-8000-000000000010', 'Task assigned to removed member', '2d000000-0000-4000-8000-000000000003', '2d000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2d000000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.leave_board('2d000000-0000-4000-8000-000000000010')$$, 'regular member can leave their board');
select ok(not exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000002'), 'leaving member membership is removed');
select ok(exists (select 1 from public.tasks where id = '2d000000-0000-4000-8000-000000000101'), 'task assigned to a leaving member is preserved');
select is((select assignee_id from public.tasks where id = '2d000000-0000-4000-8000-000000000101'), null::uuid, 'task assigned to a leaving member becomes unassigned');
select throws_ok($$select public.leave_board('2d000000-0000-4000-8000-000000000010')$$, '42501', null, 'former member cannot leave the same board a second time');
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003')$$, '42501', null, 'regular member cannot remove another member');
select ok(exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000003'), 'target membership remains after a member removal attempt');

select set_config('request.jwt.claim.sub', '2d000000-0000-4000-8000-000000000004', true);
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003')$$, '42501', null, 'non-member cannot remove a member from another board');
select ok(exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000003'), 'membership remains after an outsider removal attempt');

select set_config('request.jwt.claim.sub', '2d000000-0000-4000-8000-000000000001', true);
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000001')$$, '42501', null, 'owner cannot remove their own owner membership');
select ok(exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000001' and role = 'owner'), 'owner membership remains after self-removal attempt');
select is(public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003'), '2d000000-0000-4000-8000-000000000003'::uuid, 'owner can remove a regular member and receives the removed user id');
select ok(not exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000003'), 'owner-removed member membership is deleted');
select ok(exists (select 1 from public.tasks where id = '2d000000-0000-4000-8000-000000000102'), 'task assigned to an owner-removed member is preserved');
select is((select assignee_id from public.tasks where id = '2d000000-0000-4000-8000-000000000102'), null::uuid, 'task assigned to an owner-removed member becomes unassigned');
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003')$$, '42501', null, 'owner cannot remove the same member twice');
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000004')$$, '42501', null, 'owner cannot remove a user who is not a board member');
select throws_ok($$select public.leave_board('2d000000-0000-4000-8000-000000000010')$$, '42501', null, 'board owner cannot leave their own board');
select ok(exists (select 1 from public.board_members where board_id = '2d000000-0000-4000-8000-000000000010' and user_id = '2d000000-0000-4000-8000-000000000001' and role = 'owner'), 'owner membership remains after leave attempt');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.leave_board('2d000000-0000-4000-8000-000000000010')$$, '28000', null, 'leave RPC rejects a missing authenticated identity');
select throws_ok($$select public.remove_board_member('2d000000-0000-4000-8000-000000000010', '2d000000-0000-4000-8000-000000000003')$$, '28000', null, 'remove-member RPC rejects a missing authenticated identity');

reset role;
select * from finish();
rollback;
