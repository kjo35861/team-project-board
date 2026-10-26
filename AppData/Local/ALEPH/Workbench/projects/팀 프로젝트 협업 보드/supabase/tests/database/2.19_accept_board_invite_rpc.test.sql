begin;

select plan(40);

select has_function('public', 'accept_board_invite', array['text'], 'accept_board_invite(text) RPC exists');
select is(pg_get_function_result('public.accept_board_invite(text)'::regprocedure), 'uuid', 'accept RPC returns the joined board UUID');
select ok((select prosecdef from pg_proc where oid = 'public.accept_board_invite(text)'::regprocedure), 'accept RPC runs as SECURITY DEFINER');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.accept_board_invite(text)'::regprocedure), 'accept RPC pins search_path');
select ok(has_function_privilege('authenticated', 'public.accept_board_invite(text)', 'EXECUTE'), 'authenticated users can execute accept RPC');
select ok(not has_function_privilege('anon', 'public.accept_board_invite(text)', 'EXECUTE'), 'anonymous users cannot execute accept RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.accept_board_invite(text)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute accept RPC'
);
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'), 'authenticated users cannot read invitation rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'INSERT'), 'authenticated users cannot insert invitation rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE'), 'authenticated users cannot update invitation rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'), 'authenticated users cannot delete invitation rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'SELECT'), 'anonymous users cannot read invitation rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'INSERT'), 'anonymous users cannot insert invitation rows directly');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2f190000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-19@example.test', '', now(), now(), now()),
  ('2f190000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-19@example.test', '', now(), now(), now()),
  ('2f190000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'link-holder-2-19@example.test', '', now(), now(), now()),
  ('2f190000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'unconfirmed-2-19@example.test', '', null, now(), now());

insert into public.boards (id, name, owner_id) values
  ('2f190000-0000-4000-8000-000000000010', 'Invitation acceptance board', '2f190000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role) values
  ('2f190000-0000-4000-8000-000000000010', '2f190000-0000-4000-8000-000000000001', 'owner'),
  ('2f190000-0000-4000-8000-000000000010', '2f190000-0000-4000-8000-000000000002', 'member');

insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by, canceled_at
) values
  ('2f190000-0000-4000-8000-000000000101', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('a', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', null, null, null),
  ('2f190000-0000-4000-8000-000000000102', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('b', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', null, null, null),
  ('2f190000-0000-4000-8000-000000000103', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('c', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', null, null, null),
  ('2f190000-0000-4000-8000-000000000104', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('d', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '10 days', now() - interval '3 days', null, null, null),
  ('2f190000-0000-4000-8000-000000000105', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('e', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', null, null, now() - interval '1 hour'),
  ('2f190000-0000-4000-8000-000000000106', '2f190000-0000-4000-8000-000000000010', encode(sha256(convert_to(repeat('f', 128), 'UTF8')), 'hex'), '2f190000-0000-4000-8000-000000000001', now() - interval '1 day', now() + interval '6 days', now() - interval '1 hour', '2f190000-0000-4000-8000-000000000002', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '2f190000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.accept_board_invite(repeat('a', 128))$$,
  'confirmed account already on the board can consume a valid link without duplicate membership'
);

select set_config('request.jwt.claim.sub', '2f190000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.accept_board_invite(repeat('b', 128))$$,
  'confirmed account can accept a valid invitation'
);
select throws_ok($$select public.accept_board_invite(repeat('b', 128))$$, '22023', null, 'a consumed invitation cannot be accepted a second time');
select throws_ok($$select public.accept_board_invite(repeat('A', 128))$$, '22023', null, 'malformed uppercase token is rejected');
select throws_ok($$select public.accept_board_invite(repeat('9', 128))$$, '22023', null, 'unknown token is rejected');
select throws_ok($$select public.accept_board_invite(null)$$, '22023', null, 'null token is rejected');
select throws_ok($$select public.accept_board_invite(repeat('1', 127))$$, '22023', null, 'token with an invalid length is rejected');
select throws_ok($$select public.accept_board_invite(repeat('d', 128))$$, '22023', null, 'expired invitation is rejected');
select throws_ok($$select public.accept_board_invite(repeat('e', 128))$$, '22023', null, 'canceled invitation is rejected');
select throws_ok($$select public.accept_board_invite(repeat('f', 128))$$, '22023', null, 'previously accepted invitation is rejected');

select set_config('request.jwt.claim.sub', '2f190000-0000-4000-8000-000000000004', true);
select throws_ok($$select public.accept_board_invite(repeat('b', 128))$$, '42501', null, 'account without confirmed email cannot accept an invitation');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.accept_board_invite(repeat('c', 128))$$, '28000', null, 'accept RPC rejects a missing authenticated identity');

select set_config('request.jwt.claim.sub', '2f190000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.accept_board_invite(repeat('c', 128))$$,
  'confirmed user with the bearer link can join the board'
);
reset role;

select is(
  (select accepted_by from public.board_invites where id = '2f190000-0000-4000-8000-000000000101'),
  '2f190000-0000-4000-8000-000000000001'::uuid,
  'acceptance records the authenticated owner for the already-member case'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and user_id = '2f190000-0000-4000-8000-000000000001'),
  1,
  'accepting as an existing owner does not duplicate membership'
);
select ok(
  (select accepted_at is not null and accepted_at < expires_at from public.board_invites where id = '2f190000-0000-4000-8000-000000000101'),
  'successful acceptance records a timestamp before expiration'
);
select ok(
  (select exists (select 1 from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and user_id = '2f190000-0000-4000-8000-000000000002' and role = 'member')),
  'invited account is added as a regular board member'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and user_id = '2f190000-0000-4000-8000-000000000002'),
  1,
  'membership remains unique after accepting'
);
select is(
  (select accepted_by from public.board_invites where id = '2f190000-0000-4000-8000-000000000102'),
  '2f190000-0000-4000-8000-000000000002'::uuid,
  'invitation records the actual accepting account'
);
select ok(
  (select exists (select 1 from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and user_id = '2f190000-0000-4000-8000-000000000003' and role = 'member')),
  'a link-holding confirmed user can join without prior membership'
);
select is(
  (select accepted_by from public.board_invites where id = '2f190000-0000-4000-8000-000000000103'),
  '2f190000-0000-4000-8000-000000000003'::uuid,
  'link acceptance is attributed to the authenticated account'
);
select ok(
  (select accepted_at is null and accepted_by is null from public.board_invites where id = '2f190000-0000-4000-8000-000000000104'),
  'rejected expired invitation remains unused'
);
select ok(
  (select accepted_at is null and canceled_at is not null from public.board_invites where id = '2f190000-0000-4000-8000-000000000105'),
  'rejected canceled invitation remains canceled and unused'
);
select is(
  (select accepted_by from public.board_invites where id = '2f190000-0000-4000-8000-000000000106'),
  '2f190000-0000-4000-8000-000000000002'::uuid,
  'rejected previously accepted invitation preserves its original acceptor'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and user_id = '2f190000-0000-4000-8000-000000000004'),
  0,
  'unconfirmed account failure does not add membership'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010' and role = 'owner'),
  1,
  'acceptance does not change the board owner membership'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '2f190000-0000-4000-8000-000000000010'),
  3,
  'only the two existing members and one newly accepted user are present'
);

select * from finish();
rollback;
