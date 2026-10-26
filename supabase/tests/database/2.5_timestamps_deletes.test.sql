begin;

select plan(31);

select has_function('public', 'set_row_timestamps', 'database timestamp trigger helper exists');
select has_trigger('public', 'profiles', 'profiles_set_row_timestamps', 'profiles use database-owned timestamps');
select has_trigger('public', 'boards', 'boards use database-owned timestamps');
select has_trigger('public', 'tasks', 'tasks use database-owned timestamps');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('25000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-5@example.test', '', now(), now(), now()),
  ('25000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-5@example.test', '', now(), now(), now()),
  ('25000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-two-2-5@example.test', '', now(), now(), now()),
  ('25000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'member-two-2-5@example.test', '', now(), now(), now());

insert into public.profiles (id, display_name, created_at, updated_at)
values ('25000000-0000-4000-8000-000000000001', 'Timestamp owner', '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00');
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz and updated_at = created_at
     from public.profiles where id = '25000000-0000-4000-8000-000000000001'),
  'profile insert timestamps are set by the database'
);
update public.profiles
   set display_name = 'Updated owner', created_at = '1999-01-01 00:00:00+00', updated_at = '1999-01-01 00:00:00+00'
 where id = '25000000-0000-4000-8000-000000000001';
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at <> created_at
     from public.profiles where id = '25000000-0000-4000-8000-000000000001'),
  'profile updates preserve creation time and replace client-supplied update time'
);

insert into public.boards (id, name, owner_id, created_at, updated_at)
values (
  '25000000-0000-4000-8000-000000000010', 'Timestamp and cascade board',
  '25000000-0000-4000-8000-000000000001', '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00'
);
insert into public.board_members (board_id, user_id, role)
values
  ('25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000001', 'owner'),
  ('25000000-0000-4000-8000-000000000010', '25000000-0000-4000-8000-000000000002', 'member');
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz and updated_at = created_at
     from public.boards where id = '25000000-0000-4000-8000-000000000010'),
  'board insert timestamps are set by the database'
);
update public.boards
   set name = 'Renamed timestamp board', created_at = '1999-01-01 00:00:00+00', updated_at = '1999-01-01 00:00:00+00'
 where id = '25000000-0000-4000-8000-000000000010';
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at <> created_at
     from public.boards where id = '25000000-0000-4000-8000-000000000010'),
  'board updates preserve creation time and replace client-supplied update time'
);

insert into public.tasks (
  id, board_id, title, assignee_id, created_by, created_at, updated_at
) values (
  '25000000-0000-4000-8000-000000000020',
  '25000000-0000-4000-8000-000000000010', 'Timestamp task',
  '25000000-0000-4000-8000-000000000002', '25000000-0000-4000-8000-000000000001',
  '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00'
);
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz and updated_at = created_at
     from public.tasks where id = '25000000-0000-4000-8000-000000000020'),
  'task insert timestamps are set by the database'
);
update public.tasks
   set status = 'in_progress', created_at = '1999-01-01 00:00:00+00', updated_at = '1999-01-01 00:00:00+00'
 where id = '25000000-0000-4000-8000-000000000020';
select ok(
  (select created_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at > '2000-01-02 00:00:00+00'::timestamptz
      and updated_at <> created_at
     from public.tasks where id = '25000000-0000-4000-8000-000000000020'),
  'task updates preserve creation time and replace client-supplied update time'
);

insert into public.board_invites (
  id, board_id, token_hash, created_by, expires_at
) values (
  '25000000-0000-4000-8000-000000000030',
  '25000000-0000-4000-8000-000000000010', repeat('a', 64),
  '25000000-0000-4000-8000-000000000002', now() + interval '168 hours'
);
insert into public.board_invites (
  id, board_id, token_hash, created_by, expires_at, accepted_at, accepted_by
) values (
  '25000000-0000-4000-8000-000000000031',
  '25000000-0000-4000-8000-000000000010', repeat('b', 64),
  '25000000-0000-4000-8000-000000000001', now() + interval '168 hours', now(),
  '25000000-0000-4000-8000-000000000002'
);

select throws_ok(
  $$delete from auth.users where id = '25000000-0000-4000-8000-000000000002'$$,
  '23503', null,
  'prevents deleting an account referenced by accepted invitation history'
);
delete from public.board_invites where id = '25000000-0000-4000-8000-000000000031';
delete from auth.users where id = '25000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::integer from public.board_members where board_id = '25000000-0000-4000-8000-000000000010' and user_id = '25000000-0000-4000-8000-000000000002'),
  0,
  'deleting a user cascades their board membership'
);
select is(
  (select count(*)::integer from public.profiles where id = '25000000-0000-4000-8000-000000000002'),
  0,
  'deleting a user cascades their profile'
);
select is(
  (select assignee_id from public.tasks where id = '25000000-0000-4000-8000-000000000020'),
  null::uuid,
  'deleting an assignee clears the assignment but keeps the task'
);
select is(
  (select count(*)::integer from public.board_invites where id = '25000000-0000-4000-8000-000000000030'),
  0,
  'deleting an invitation creator cascades their invitation'
);
select ok(
  exists (select 1 from public.boards where id = '25000000-0000-4000-8000-000000000010'),
  'deleting a non-owner member does not delete the board'
);

delete from auth.users where id = '25000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.boards where id = '25000000-0000-4000-8000-000000000010'),
  0,
  'deleting the board owner cascades the owned board'
);
select is(
  (select count(*)::integer from public.tasks where id = '25000000-0000-4000-8000-000000000020'),
  0,
  'deleting a board cascades its tasks'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '25000000-0000-4000-8000-000000000010'),
  0,
  'deleting a board cascades its memberships'
);
select is(
  (select count(*)::integer from public.board_invites where board_id = '25000000-0000-4000-8000-000000000010'),
  0,
  'deleting a board cascades its invitations'
);
select is(
  (select count(*)::integer from public.profiles where id = '25000000-0000-4000-8000-000000000001'),
  0,
  'deleting a user cascades their profile'
);

insert into public.boards (id, name, owner_id)
values ('25000000-0000-4000-8000-000000000040', 'Independent cascade board', '25000000-0000-4000-8000-000000000003');
insert into public.board_members (board_id, user_id, role)
values
  ('25000000-0000-4000-8000-000000000040', '25000000-0000-4000-8000-000000000003', 'owner'),
  ('25000000-0000-4000-8000-000000000040', '25000000-0000-4000-8000-000000000004', 'member');
insert into public.tasks (id, board_id, title, created_by, assignee_id)
values
  ('25000000-0000-4000-8000-000000000041', '25000000-0000-4000-8000-000000000040', 'Created by member', '25000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000003'),
  ('25000000-0000-4000-8000-000000000042', '25000000-0000-4000-8000-000000000040', 'Assigned to member', '25000000-0000-4000-8000-000000000003', '25000000-0000-4000-8000-000000000004');
insert into public.board_invites (id, board_id, token_hash, created_by, expires_at)
values ('25000000-0000-4000-8000-000000000043', '25000000-0000-4000-8000-000000000040', repeat('c', 64), '25000000-0000-4000-8000-000000000004', now() + interval '168 hours');

delete from auth.users where id = '25000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::integer from public.board_members where board_id = '25000000-0000-4000-8000-000000000040' and user_id = '25000000-0000-4000-8000-000000000004'),
  0,
  'deleting a member removes their membership without deleting the board'
);
select is(
  (select count(*)::integer from public.profiles where id = '25000000-0000-4000-8000-000000000004'),
  0,
  'deleting a member cascades their profile'
);
select is(
  (select count(*)::integer from public.tasks where id = '25000000-0000-4000-8000-000000000041'),
  0,
  'deleting a task creator cascades their task'
);
select is(
  (select assignee_id from public.tasks where id = '25000000-0000-4000-8000-000000000042'),
  null::uuid,
  'deleting a task assignee clears the reference and preserves another users task'
);
select is(
  (select count(*)::integer from public.board_invites where id = '25000000-0000-4000-8000-000000000043'),
  0,
  'deleting an invite creator cascades their invitation'
);
select ok(
  exists (select 1 from public.boards where id = '25000000-0000-4000-8000-000000000040'),
  'deleting a regular member preserves the board'
);

delete from public.boards where id = '25000000-0000-4000-8000-000000000040';
select is(
  (select count(*)::integer from public.tasks where board_id = '25000000-0000-4000-8000-000000000040'),
  0,
  'direct board deletion cascades remaining tasks'
);
select is(
  (select count(*)::integer from public.board_members where board_id = '25000000-0000-4000-8000-000000000040'),
  0,
  'direct board deletion cascades memberships'
);
select is(
  (select count(*)::integer from public.board_invites where board_id = '25000000-0000-4000-8000-000000000040'),
  0,
  'direct board deletion cascades invitations'
);
select is(
  (select count(*)::integer from public.profiles where id = '25000000-0000-4000-8000-000000000003'),
  1,
  'deleting a board does not delete its owner account profile'
);

select * from finish();
rollback;
