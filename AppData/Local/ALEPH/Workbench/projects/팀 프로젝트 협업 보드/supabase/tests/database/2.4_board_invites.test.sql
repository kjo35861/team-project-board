begin;

select plan(39);

select has_table('public', 'board_invites', 'board_invites table exists');
select has_column('public', 'board_invites', 'id', 'invite has an identifier');
select has_column('public', 'board_invites', 'board_id', 'invite belongs to a board');
select has_column('public', 'board_invites', 'token_hash', 'invite stores a token digest');
select has_column('public', 'board_invites', 'created_by', 'invite records its creator');
select has_column('public', 'board_invites', 'created_at', 'invite records its creation time');
select has_column('public', 'board_invites', 'expires_at', 'invite records its expiration time');
select has_column('public', 'board_invites', 'accepted_at', 'invite records when it was accepted');
select has_column('public', 'board_invites', 'accepted_by', 'invite records who accepted it');
select has_column('public', 'board_invites', 'canceled_at', 'invite records when it was canceled');
select has_pk('public', 'board_invites', 'each invitation has a primary key');
select has_check('public', 'board_invites', 'board_invites_token_hash_check', 'token hash must be lowercase SHA-256 hex');
select has_check('public', 'board_invites', 'board_invites_expires_after_7_days_check', 'invite expires exactly 168 hours after creation');
select has_check('public', 'board_invites', 'board_invites_acceptor_matches_timestamp_check', 'acceptor and acceptance timestamp must be set together');
select has_check('public', 'board_invites', 'board_invites_accepted_before_expiry_check', 'acceptance must be at or after creation and before expiry');
select has_check('public', 'board_invites', 'board_invites_canceled_after_creation_check', 'cancellation cannot precede creation');
select has_check('public', 'board_invites', 'board_invites_not_both_accepted_and_canceled_check', 'an invite cannot be accepted and canceled');
select has_index('public', 'board_invites', 'board_invites_token_hash_key', 'token hashes are globally unique');
select has_index('public', 'board_invites', 'board_invites_board_created_idx', 'owner invitation lists can be ordered by board and creation time');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_invites'::regclass),
  'row level security is enabled'
);
select ok(
  not has_table_privilege('anon', 'public.board_invites', 'SELECT'),
  'anonymous users cannot read invitation records'
);
select ok(
  not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'),
  'authenticated users cannot directly read invitation records'
);
select ok(
  not has_table_privilege('authenticated', 'public.board_invites', 'INSERT'),
  'authenticated users cannot directly create invitation records'
);
select ok(
  not has_table_privilege('anon', 'public.board_invites', 'INSERT'),
  'anonymous users cannot directly create invitation records'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('24000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-4@example.test', '', now(), now(), now()),
  ('24000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-4@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id)
values ('24000000-0000-4000-8000-000000000010', 'Invite schema test board', '24000000-0000-4000-8000-000000000001');
insert into public.board_members (board_id, user_id, role)
values ('24000000-0000-4000-8000-000000000010', '24000000-0000-4000-8000-000000000001', 'owner');

insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at
) values (
  '24000000-0000-4000-8000-000000000020',
  '24000000-0000-4000-8000-000000000010', repeat('a', 64),
  '24000000-0000-4000-8000-000000000001',
  '2026-01-01 00:00:00+00', '2026-01-08 00:00:00+00'
);
insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by
) values (
  '24000000-0000-4000-8000-000000000021',
  '24000000-0000-4000-8000-000000000010', repeat('b', 64),
  '24000000-0000-4000-8000-000000000001',
  '2026-01-01 00:00:00+00', '2026-01-08 00:00:00+00',
  '2026-01-02 00:00:00+00', '24000000-0000-4000-8000-000000000002'
);
insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at, canceled_at
) values (
  '24000000-0000-4000-8000-000000000022',
  '24000000-0000-4000-8000-000000000010', repeat('c', 64),
  '24000000-0000-4000-8000-000000000001',
  '2026-01-01 00:00:00+00', '2026-01-08 00:00:00+00',
  '2026-01-03 00:00:00+00'
);
insert into public.board_invites (
  id, board_id, token_hash, created_by, created_at, expires_at
) values (
  '24000000-0000-4000-8000-000000000023',
  '24000000-0000-4000-8000-000000000010', repeat('d', 64),
  '24000000-0000-4000-8000-000000000001',
  '2026-01-01 00:00:00+00', '2026-01-08 00:00:00+00'
);

select ok(
  (select accepted_at is null and accepted_by is null and canceled_at is null
     from public.board_invites where id = '24000000-0000-4000-8000-000000000020'),
  'null terminal timestamps represent an unused invitation'
);
select ok(
  (select accepted_at is not null and accepted_by = '24000000-0000-4000-8000-000000000002'::uuid
     and canceled_at is null
     from public.board_invites where id = '24000000-0000-4000-8000-000000000021'),
  'accepted invitation stores its accepting user and timestamp'
);
select ok(
  (select canceled_at is not null and accepted_at is null and accepted_by is null
     from public.board_invites where id = '24000000-0000-4000-8000-000000000022'),
  'canceled invitation remains distinct from an accepted invitation'
);
select ok(
  (select expires_at <= '2026-01-09 00:00:00+00'::timestamptz
     and accepted_at is null and canceled_at is null
     from public.board_invites where id = '24000000-0000-4000-8000-000000000023'),
  'expiration is derived from expires_at while the record remains otherwise unused'
);

select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('A', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00')$$,
  '23514', null,
  'rejects a non-lowercase-hex token digest'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('a', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00')$$,
  '23505', null,
  'rejects reuse of a token hash'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('e', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-09 00:00+00')$$,
  '23514', null,
  'rejects an invitation that does not expire after exactly 168 hours'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, accepted_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('f', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '2026-01-02 00:00+00')$$,
  '23514', null,
  'rejects an acceptance timestamp without an accepting user'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, accepted_by)
    values ('24000000-0000-4000-8000-000000000010', repeat('1', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '24000000-0000-4000-8000-000000000002')$$,
  '23514', null,
  'rejects an accepting user without an acceptance timestamp'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by)
    values ('24000000-0000-4000-8000-000000000010', repeat('2', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '2026-01-08 00:00+00', '24000000-0000-4000-8000-000000000002')$$,
  '23514', null,
  'rejects acceptance at or after the expiration instant'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by, canceled_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('3', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '2026-01-02 00:00+00', '24000000-0000-4000-8000-000000000002', '2026-01-03 00:00+00')$$,
  '23514', null,
  'rejects an invitation that is both accepted and canceled'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, canceled_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('4', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '2025-12-31 00:00+00')$$,
  '23514', null,
  'rejects cancellation before invitation creation'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at)
    values ('24000000-0000-4000-8000-000000000099', repeat('5', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00')$$,
  '23503', null,
  'rejects an invitation for a nonexistent board'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at)
    values ('24000000-0000-4000-8000-000000000010', repeat('6', 64), '24000000-0000-4000-8000-000000000099', '2026-01-01 00:00+00', '2026-01-08 00:00+00')$$,
  '23503', null,
  'rejects a nonexistent invitation creator'
);
select throws_ok(
  $$insert into public.board_invites (board_id, token_hash, created_by, created_at, expires_at, accepted_at, accepted_by)
    values ('24000000-0000-4000-8000-000000000010', repeat('7', 64), '24000000-0000-4000-8000-000000000001', '2026-01-01 00:00+00', '2026-01-08 00:00+00', '2026-01-02 00:00+00', '24000000-0000-4000-8000-000000000099')$$,
  '23503', null,
  'rejects a nonexistent accepting user'
);

select * from finish();
rollback;
