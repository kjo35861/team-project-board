begin;

select plan(34);

select has_function('public', 'create_board_invite', array['uuid'], 'create_board_invite(uuid) RPC exists');
select ok((select prosecdef from pg_proc where oid = 'public.create_board_invite(uuid)'::regprocedure), 'invite creation RPC runs as SECURITY DEFINER');
select ok((select coalesce(proconfig, array[]::text[]) @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.create_board_invite(uuid)'::regprocedure), 'invite creation RPC pins search_path');
select ok(has_function_privilege('authenticated', 'public.create_board_invite(uuid)', 'EXECUTE'), 'authenticated role can execute invite creation RPC');
select ok(not has_function_privilege('anon', 'public.create_board_invite(uuid)', 'EXECUTE'), 'anonymous role cannot execute invite creation RPC');
select ok(
  not exists (
    select 1 from pg_proc as p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where p.oid = 'public.create_board_invite(uuid)'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC cannot execute invite creation RPC'
);
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'), 'authenticated users cannot read invite rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'INSERT'), 'authenticated users cannot insert invite rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE'), 'authenticated users cannot update invite rows directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'), 'authenticated users cannot delete invite rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'SELECT'), 'anonymous users cannot read invite rows directly');
select ok(not has_table_privilege('anon', 'public.board_invites', 'INSERT'), 'anonymous users cannot insert invite rows directly');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2e000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-17@example.test', '', now(), now(), now()),
  ('2e000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-17@example.test', '', now(), now(), now()),
  ('2e000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-17@example.test', '', now(), now(), now()),
  ('2e000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'unconfirmed-2-17@example.test', '', null, now(), now());

insert into public.boards (id, name, owner_id) values
  ('2e000000-0000-4000-8000-000000000010', 'Invite RPC board', '2e000000-0000-4000-8000-000000000001'),
  ('2e000000-0000-4000-8000-000000000020', 'Outsider board', '2e000000-0000-4000-8000-000000000003'),
  ('2e000000-0000-4000-8000-000000000030', 'Unconfirmed owner board', '2e000000-0000-4000-8000-000000000004');

insert into public.board_members (board_id, user_id, role) values
  ('2e000000-0000-4000-8000-000000000010', '2e000000-0000-4000-8000-000000000001', 'owner'),
  ('2e000000-0000-4000-8000-000000000010', '2e000000-0000-4000-8000-000000000002', 'member'),
  ('2e000000-0000-4000-8000-000000000020', '2e000000-0000-4000-8000-000000000003', 'owner'),
  ('2e000000-0000-4000-8000-000000000030', '2e000000-0000-4000-8000-000000000004', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2e000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select set_config('test.invite_1', invite_id::text || '|' || token || '|' || expires_at::text, true)
      from public.create_board_invite('2e000000-0000-4000-8000-000000000010')$$,
  'confirmed board owner can create an invitation'
);
select lives_ok(
  $$select set_config('test.invite_2', invite_id::text || '|' || token || '|' || expires_at::text, true)
      from public.create_board_invite('2e000000-0000-4000-8000-000000000010')$$,
  'owner can issue another independent invitation'
);

select set_config('request.jwt.claim.sub', '2e000000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from public.create_board_invite('2e000000-0000-4000-8000-000000000010')$$, '42501', null, 'regular board member cannot create an invitation');

select set_config('request.jwt.claim.sub', '2e000000-0000-4000-8000-000000000003', true);
select throws_ok($$select * from public.create_board_invite('2e000000-0000-4000-8000-000000000010')$$, '42501', null, 'non-member cannot create an invitation for another board');

select set_config('request.jwt.claim.sub', '2e000000-0000-4000-8000-000000000004', true);
select throws_ok($$select * from public.create_board_invite('2e000000-0000-4000-8000-000000000030')$$, '42501', null, 'owner without confirmed email cannot create an invitation');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.create_board_invite('2e000000-0000-4000-8000-000000000010')$$, '28000', null, 'invite creation rejects a missing authenticated identity');

reset role;

select ok(length(split_part(current_setting('test.invite_1'), '|', 2)) = 128, 'first raw token contains 128 hexadecimal characters');
select ok(split_part(current_setting('test.invite_1'), '|', 2) ~ '^[0-9a-f]{128}$', 'first raw token is URL-safe lowercase hexadecimal');
select ok(length(split_part(current_setting('test.invite_2'), '|', 2)) = 128, 'second raw token contains 128 hexadecimal characters');
select ok(split_part(current_setting('test.invite_2'), '|', 2) ~ '^[0-9a-f]{128}$', 'second raw token is URL-safe lowercase hexadecimal');
select ok(split_part(current_setting('test.invite_1'), '|', 2) <> split_part(current_setting('test.invite_2'), '|', 2), 'separately issued raw tokens are distinct');
select ok(split_part(current_setting('test.invite_1'), '|', 1) <> split_part(current_setting('test.invite_2'), '|', 1), 'separate invitations have distinct identifiers');

select is(
  (select token_hash from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  encode(sha256(convert_to(split_part(current_setting('test.invite_1'), '|', 2), 'UTF8')), 'hex'),
  'database stores the SHA-256 digest of the first returned raw token'
);
select is(
  (select token_hash from public.board_invites where id = split_part(current_setting('test.invite_2'), '|', 1)::uuid),
  encode(sha256(convert_to(split_part(current_setting('test.invite_2'), '|', 2), 'UTF8')), 'hex'),
  'database stores the SHA-256 digest of the second returned raw token'
);
select ok(
  (select token_hash <> split_part(current_setting('test.invite_1'), '|', 2)
     and token_hash ~ '^[0-9a-f]{64}$'
   from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  'first invite persists only a lowercase SHA-256 digest, not its raw token'
);
select ok(
  (select token_hash <> split_part(current_setting('test.invite_2'), '|', 2)
     and token_hash ~ '^[0-9a-f]{64}$'
   from public.board_invites where id = split_part(current_setting('test.invite_2'), '|', 1)::uuid),
  'second invite persists only a lowercase SHA-256 digest, not its raw token'
);
select is(
  (select board_id from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  '2e000000-0000-4000-8000-000000000010'::uuid,
  'invitation is attached to the requested board'
);
select is(
  (select created_by from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  '2e000000-0000-4000-8000-000000000001'::uuid,
  'invitation records the authenticated owner as creator'
);
select ok(
  (select extract(epoch from (expires_at - created_at)) = 604800
     and expires_at = split_part(current_setting('test.invite_1'), '|', 3)::timestamptz
   from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  'first invitation expires exactly 168 hours after issuance and returns that expiration'
);
select ok(
  (select extract(epoch from (expires_at - created_at)) = 604800
     and expires_at = split_part(current_setting('test.invite_2'), '|', 3)::timestamptz
   from public.board_invites where id = split_part(current_setting('test.invite_2'), '|', 1)::uuid),
  'second invitation expires exactly 168 hours after issuance and returns that expiration'
);
select ok(
  (select accepted_at is null and accepted_by is null and canceled_at is null
   from public.board_invites where id = split_part(current_setting('test.invite_1'), '|', 1)::uuid),
  'new invitation starts unused and not canceled'
);
select is((select count(*)::integer from public.board_invites), 2, 'failed non-owner, unconfirmed, and unauthenticated requests create no invitation rows');

select * from finish();
rollback;
