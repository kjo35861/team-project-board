begin;

select plan(40);

select has_function('public', 'list_board_invites', array['uuid'], 'list_board_invites(uuid) RPC exists');
select has_function('public', 'cancel_board_invite', array['uuid'], 'cancel_board_invite(uuid) RPC exists');
select ok((select prosecdef from pg_proc where oid = 'public.list_board_invites(uuid)'::regprocedure), 'list RPC runs as SECURITY DEFINER');
select ok((select prosecdef from pg_proc where oid = 'public.cancel_board_invite(uuid)'::regprocedure), 'cancel RPC runs as SECURITY DEFINER');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.list_board_invites(uuid)'::regprocedure), 'list RPC pins search_path');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.cancel_board_invite(uuid)'::regprocedure), 'cancel RPC pins search_path');
select ok(has_function_privilege('authenticated', 'public.list_board_invites(uuid)', 'EXECUTE'), 'authenticated users can execute list RPC');
select ok(has_function_privilege('authenticated', 'public.cancel_board_invite(uuid)', 'EXECUTE'), 'authenticated users can execute cancel RPC');
select ok(not has_function_privilege('anon', 'public.list_board_invites(uuid)', 'EXECUTE'), 'anonymous users cannot execute list RPC');
select ok(not has_function_privilege('anon', 'public.cancel_board_invite(uuid)', 'EXECUTE'), 'anonymous users cannot execute cancel RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.list_board_invites(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute list RPC'
);
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.cancel_board_invite(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute cancel RPC'
);
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'), 'authenticated users cannot read invitation rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE'), 'authenticated users cannot update invitation rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'), 'authenticated users cannot delete invitation rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'SELECT'), 'anonymous users cannot read invitation rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'UPDATE'), 'anonymous users cannot update invitation rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'DELETE'), 'anonymous users cannot delete invitation rows directly');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2f000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-18@example.test', '', now(), now(), now()),
  ('2f000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-18@example.test', '', now(), now(), now()),
  ('2f000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-18@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2f000000-0000-4000-8000-000000000010', 'Invitation management board', '2f000000-0000-4000-8000-000000000001'),
  ('2f000000-0000-4000-8000-000000000020', 'Other private board', '2f000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2f000000-0000-4000-8000-000000000010', '2f000000-0000-4000-8000-000000000001', 'owner'),
  ('2f000000-0000-4000-8000-000000000010', '2f000000-0000-4000-8000-000000000002', 'member'),
  ('2f000000-0000-4000-8000-000000000020', '2f000000-0000-4000-8000-000000000003', 'owner');

insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by, canceled_at
) values
  ('2f000000-0000-4000-8000-000000000101', '2f000000-0000-4000-8000-000000000010', repeat('1', 64), '2f000000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', null, null, null),
  ('2f000000-0000-4000-8000-000000000102', '2f000000-0000-4000-8000-000000000010', repeat('2', 64), '2f000000-0000-4000-8000-000000000001', now() - interval '2 days', now() + interval '5 days', now() - interval '1 day', '2f000000-0000-4000-8000-000000000002', null),
  ('2f000000-0000-4000-8000-000000000103', '2f000000-0000-4000-8000-000000000010', repeat('3', 64), '2f000000-0000-4000-8000-000000000001', now() - interval '2 days', now() + interval '5 days', null, null, now() - interval '1 day'),
  ('2f000000-0000-4000-8000-000000000104', '2f000000-0000-4000-8000-000000000010', repeat('4', 64), '2f000000-0000-4000-8000-000000000001', now() - interval '10 days', now() - interval '3 days', null, null, null),
  ('2f000000-0000-4000-8000-000000000201', '2f000000-0000-4000-8000-000000000020', repeat('5', 64), '2f000000-0000-4000-8000-000000000003', now() - interval '1 day', now() + interval '6 days', null, null, null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '2f000000-0000-4000-8000-000000000001', true);

select is((select count(*)::integer from public.list_board_invites('2f000000-0000-4000-8000-000000000010')), 4, 'owner can list all invitations for their board');
select is((select count(*)::integer from public.list_board_invites('2f000000-0000-4000-8000-000000000010') where status = 'pending'), 1, 'list derives pending status for a live unused invitation');
select is((select count(*)::integer from public.list_board_invites('2f000000-0000-4000-8000-000000000010') where status = 'accepted'), 1, 'list derives accepted status');
select is((select count(*)::integer from public.list_board_invites('2f000000-0000-4000-8000-000000000010') where status = 'canceled'), 1, 'list derives canceled status');
select is((select count(*)::integer from public.list_board_invites('2f000000-0000-4000-8000-000000000010') where status = 'expired'), 1, 'list derives expired status from the current time');
select ok(pg_get_function_result('public.list_board_invites(uuid)'::regprocedure) !~* '(token|hash)', 'list RPC result omits raw tokens and stored token hashes');
select throws_ok($$select * from public.list_board_invites('2f000000-0000-4000-8000-000000000020')$$, '42501', null, 'owner cannot list invitations for a board they do not own');

select set_config('request.jwt.claim.sub', '2f000000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.list_board_invites('2f000000-0000-4000-8000-000000000010')$$, '42501', null, 'regular member cannot list board invitations');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000101')$$, '42501', null, 'regular member cannot cancel a board invitation');

select set_config('request.jwt.claim.sub', '2f000000-0000-4000-8000-000000000003', true);
select throws_ok($$select * from public.list_board_invites('2f000000-0000-4000-8000-000000000010')$$, '42501', null, 'non-member cannot list another board invitations');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000101')$$, '42501', null, 'non-member cannot cancel another board invitation');

select set_config('request.jwt.claim.sub', '2f000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000101')$$, 'owner can cancel a pending, unexpired invitation');
reset role;
select ok((select canceled_at is not null from public.board_invites where id = '2f000000-0000-4000-8000-000000000101'), 'cancellation records a timestamp');
set local role authenticated;
select is((select status from public.list_board_invites('2f000000-0000-4000-8000-000000000010') where invite_id = '2f000000-0000-4000-8000-000000000101'), 'canceled', 'canceled invitation is reported as canceled');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000101')$$, '22023', null, 'owner cannot cancel the same invitation twice');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000102')$$, '22023', null, 'owner cannot cancel an accepted invitation');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000103')$$, '22023', null, 'owner cannot cancel an already canceled invitation');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000104')$$, '22023', null, 'owner cannot cancel an expired invitation');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000201')$$, '42501', null, 'owner cannot cancel an invitation belonging to another board');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000999')$$, '42501', null, 'cancel RPC rejects an unknown invitation');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.list_board_invites('2f000000-0000-4000-8000-000000000010')$$, '28000', null, 'list RPC rejects a missing authenticated identity');
select throws_ok($$select public.cancel_board_invite('2f000000-0000-4000-8000-000000000101')$$, '28000', null, 'cancel RPC rejects a missing authenticated identity');

reset role;
select * from finish();
rollback;
