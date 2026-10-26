begin;

select plan(48);

select has_table('public', 'tasks', 'tasks table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS remains enabled on tasks'
);
select ok(exists (
  select 1 from pg_policies
   where schemaname = 'public' and tablename = 'tasks'
     and policyname = 'tasks_select_board_members' and cmd = 'SELECT'
), 'board-member task SELECT policy exists');
select ok(exists (
  select 1 from pg_policies
   where schemaname = 'public' and tablename = 'tasks'
     and policyname = 'tasks_insert_board_members' and cmd = 'INSERT'
), 'board-member task INSERT policy exists');
select ok(exists (
  select 1 from pg_policies
   where schemaname = 'public' and tablename = 'tasks'
     and policyname = 'tasks_update_board_members' and cmd = 'UPDATE'
), 'board-member task UPDATE policy exists');

select ok(has_table_privilege('authenticated', 'public.tasks', 'SELECT'), 'authenticated role can select tasks');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'INSERT'), 'task INSERT is limited to column-level grants, not a table-wide grant');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'UPDATE'), 'task UPDATE is limited to column-level grants, not a table-wide grant');
select ok(has_table_privilege('authenticated', 'public.tasks', 'DELETE'), 'authenticated DELETE grant is added in 2.11 and constrained by RLS');
select ok(not has_table_privilege('anon', 'public.tasks', 'SELECT'), 'anonymous role cannot select tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'INSERT'), 'anonymous role cannot insert tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'UPDATE'), 'anonymous role cannot update tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'DELETE'), 'anonymous role cannot delete tasks');

select ok(has_column_privilege('authenticated', 'public.tasks', 'board_id', 'INSERT'), 'authenticated role can set board_id only when RLS permits it');
select ok(has_column_privilege('authenticated', 'public.tasks', 'title', 'INSERT'), 'authenticated role can insert task titles');
select ok(has_column_privilege('authenticated', 'public.tasks', 'created_by', 'INSERT'), 'authenticated role can submit creator id for self-checking by RLS');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'id', 'INSERT'), 'authenticated role cannot choose task id');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'created_at', 'INSERT'), 'authenticated role cannot set creation timestamp');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'updated_at', 'INSERT'), 'authenticated role cannot set update timestamp');
select ok(has_column_privilege('authenticated', 'public.tasks', 'title', 'UPDATE'), 'authenticated role can update title');
select ok(has_column_privilege('authenticated', 'public.tasks', 'description', 'UPDATE'), 'authenticated role can update description');
select ok(has_column_privilege('authenticated', 'public.tasks', 'status', 'UPDATE'), 'authenticated role can update status');
select ok(has_column_privilege('authenticated', 'public.tasks', 'assignee_id', 'UPDATE'), 'authenticated role can update assignee');
select ok(has_column_privilege('authenticated', 'public.tasks', 'due_date', 'UPDATE'), 'authenticated role can update due date');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'board_id', 'UPDATE'), 'authenticated role cannot move a task to another board');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'created_by', 'UPDATE'), 'authenticated role cannot change task creator');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'id', 'UPDATE'), 'authenticated role cannot change task id');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'created_at', 'UPDATE'), 'authenticated role cannot change creation timestamp');
select ok(not has_column_privilege('authenticated', 'public.tasks', 'updated_at', 'UPDATE'), 'authenticated role cannot set the update timestamp');
select ok(has_function_privilege('authenticated', 'public.is_board_member(uuid)', 'EXECUTE'), 'authenticated role can evaluate the membership policy');
select ok(not has_function_privilege('anon', 'public.is_board_member(uuid)', 'EXECUTE'), 'anonymous role cannot execute the membership helper');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2a000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-10@example.test', '', now(), now(), now()),
  ('2a000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-10@example.test', '', now(), now(), now()),
  ('2a000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-10@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2a000000-0000-4000-8000-000000000010', 'Shared tasks board', '2a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000020', 'Private tasks board', '2a000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2a000000-0000-4000-8000-000000000010', '2a000000-0000-4000-8000-000000000001', 'owner'),
  ('2a000000-0000-4000-8000-000000000010', '2a000000-0000-4000-8000-000000000002', 'member'),
  ('2a000000-0000-4000-8000-000000000020', '2a000000-0000-4000-8000-000000000003', 'owner');

insert into public.tasks (id, board_id, title, created_by) values
  ('2a000000-0000-4000-8000-000000000101', '2a000000-0000-4000-8000-000000000010', 'Owner task', '2a000000-0000-4000-8000-000000000001'),
  ('2a000000-0000-4000-8000-000000000102', '2a000000-0000-4000-8000-000000000010', 'Member task', '2a000000-0000-4000-8000-000000000002'),
  ('2a000000-0000-4000-8000-000000000201', '2a000000-0000-4000-8000-000000000020', 'Private task', '2a000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.tasks), 2, 'member reads tasks from their board only');
select ok(exists (
  select 1 from public.tasks where id = '2a000000-0000-4000-8000-000000000101'
), 'member can read another member task on the shared board');
select ok(not exists (
  select 1 from public.tasks where id = '2a000000-0000-4000-8000-000000000201'
), 'member cannot read a task on a separate board');
select lives_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('2a000000-0000-4000-8000-000000000010', 'Member-created task', '2a000000-0000-4000-8000-000000000002')$$,
  'member can create a task on their board as themselves'
);
select is((select count(*)::integer from public.tasks), 3, 'created task is visible to its board member');
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('2a000000-0000-4000-8000-000000000020', 'Cross-board task', '2a000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'member cannot create a task on a board they do not belong to'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('2a000000-0000-4000-8000-000000000010', 'Impersonated task', '2a000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'member cannot create a task with another user as creator'
);
select lives_ok(
  $$update public.tasks set title = 'Updated by member', status = 'in_progress'
     where id = '2a000000-0000-4000-8000-000000000101'$$,
  'member can update another member task on their board'
);
select is((select title from public.tasks where id = '2a000000-0000-4000-8000-000000000101'), 'Updated by member', 'allowed task update is persisted');
select throws_ok(
  $$update public.tasks set created_by = '2a000000-0000-4000-8000-000000000002'
     where id = '2a000000-0000-4000-8000-000000000101'$$,
  '42501', null,
  'member cannot update the task creator identity'
);
select throws_ok(
  $$update public.tasks set board_id = '2a000000-0000-4000-8000-000000000020'
     where id = '2a000000-0000-4000-8000-000000000101'$$,
  '42501', null,
  'member cannot move a task to another board'
);
select throws_ok(
  $$update public.tasks set created_at = now()
     where id = '2a000000-0000-4000-8000-000000000101'$$,
  '42501', null,
  'member cannot forge the task creation timestamp'
);

select set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000001', true);
select is((select count(*)::integer from public.tasks), 3, 'owner reads every task on their board');
select lives_ok(
  $$update public.tasks set status = 'done'
     where id = '2a000000-0000-4000-8000-000000000102'$$,
  'owner can update a member task on their board'
);

select set_config('request.jwt.claim.sub', '2a000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.tasks), 1, 'separate board owner reads only their own board task');
select ok(not exists (
  select 1 from public.tasks where id = '2a000000-0000-4000-8000-000000000101'
), 'separate board owner cannot read the shared board task');
select throws_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('2a000000-0000-4000-8000-000000000010', 'Outsider task', '2a000000-0000-4000-8000-000000000003')$$,
  '42501', null,
  'non-member cannot create a task on another board'
);

reset role;
select * from finish();
rollback;
