begin;

select plan(31);

select has_table('public', 'tasks', 'tasks table exists');
select has_column('public', 'tasks', 'board_id', 'task belongs to a board');
select has_column('public', 'tasks', 'title', 'task has a title');
select has_column('public', 'tasks', 'description', 'task has an optional description');
select has_column('public', 'tasks', 'status', 'task has a status');
select has_column('public', 'tasks', 'assignee_id', 'task has an optional assignee');
select has_column('public', 'tasks', 'due_date', 'task has an optional due date');
select has_column('public', 'tasks', 'created_by', 'task records its creator');
select col_type_is('public', 'tasks', 'due_date', 'date', 'due date is a calendar date without time or time zone');
select has_check('public', 'tasks', 'tasks_title_check', 'title has a database length and non-empty constraint');
select has_check('public', 'tasks', 'tasks_description_check', 'description has a database length constraint');
select has_check('public', 'tasks', 'tasks_status_check', 'status is limited to the supported values');
select has_index('public', 'tasks', 'tasks_board_status_due_date_created_idx', 'tasks can be listed by board, status, due date, and creation time');
select has_index('public', 'tasks', 'tasks_board_assignee_idx', 'tasks can be filtered by board and assignee');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'row level security is enabled'
);
select ok(
  not has_table_privilege('anon', 'public.tasks', 'SELECT'),
  'anonymous users cannot directly read tasks'
);
select ok(
  has_table_privilege('authenticated', 'public.tasks', 'SELECT'),
  'authenticated task SELECT is granted by the later 2.10 member policy'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('23000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-3@example.test', '', now(), now(), now()),
  ('23000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'assignee-2-3@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id)
values ('23000000-0000-4000-8000-000000000010', 'Task schema test board', '23000000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role)
values
  ('23000000-0000-4000-8000-000000000010', '23000000-0000-4000-8000-000000000001', 'owner'),
  ('23000000-0000-4000-8000-000000000010', '23000000-0000-4000-8000-000000000002', 'member');

insert into public.tasks (
  id, board_id, title, description, assignee_id, due_date, created_by
) values (
  '23000000-0000-4000-8000-000000000020',
  '23000000-0000-4000-8000-000000000010',
  '  Schema task  ',
  '   ',
  '23000000-0000-4000-8000-000000000002',
  '2026-12-31',
  '23000000-0000-4000-8000-000000000001'
);

select is(
  (select title from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  'Schema task',
  'trims leading and trailing whitespace from a task title'
);
select is(
  (select description from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  null,
  'normalizes a whitespace-only description to NULL'
);
select is(
  (select status from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  'todo',
  'defaults a new task to todo'
);
select is(
  (select assignee_id from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  '23000000-0000-4000-8000-000000000002'::uuid,
  'stores an existing user as the optional assignee'
);
select is(
  (select due_date from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  '2026-12-31'::date,
  'stores a date-only deadline'
);
select is(
  (select created_by from public.tasks where id = '23000000-0000-4000-8000-000000000020'),
  '23000000-0000-4000-8000-000000000001'::uuid,
  'stores the authenticated-user foreign key for the creator'
);

select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('23000000-0000-4000-8000-000000000010', '', '23000000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'rejects an empty task title'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('23000000-0000-4000-8000-000000000010', '     ', '23000000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'rejects a whitespace-only task title'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('23000000-0000-4000-8000-000000000010', repeat('t', 121), '23000000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'rejects a title longer than 120 characters'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, description, created_by)
    values ('23000000-0000-4000-8000-000000000010', 'Valid title', repeat('d', 2001), '23000000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'rejects a description longer than 2000 characters'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, status, created_by)
    values ('23000000-0000-4000-8000-000000000010', 'Valid title', 'blocked', '23000000-0000-4000-8000-000000000001')$$,
  '23514', null,
  'rejects a status outside the supported values'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('23000000-0000-4000-8000-000000000099', 'Valid title', '23000000-0000-4000-8000-000000000001')$$,
  '23503', null,
  'rejects a task referencing a missing board'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('23000000-0000-4000-8000-000000000010', 'Valid title', '23000000-0000-4000-8000-000000000099')$$,
  '23503', null,
  'rejects a task referencing a missing creator'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, due_date, created_by)
    values ('23000000-0000-4000-8000-000000000010', 'Valid title', 'not-a-date', '23000000-0000-4000-8000-000000000001')$$,
  '22007', null,
  'rejects a deadline that cannot be parsed as a date'
);

select * from finish();
rollback;
