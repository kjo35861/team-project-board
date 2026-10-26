begin;

select plan(21);

select has_table('public', 'tasks', 'tasks table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS remains enabled on tasks'
);
select ok(exists (
  select 1 from pg_policies
   where schemaname = 'public' and tablename = 'tasks'
     and policyname = 'tasks_delete_owner_or_creator_member'
     and cmd = 'DELETE'
), 'owner-or-creator DELETE policy exists');
select ok(has_table_privilege('authenticated', 'public.tasks', 'DELETE'), 'authenticated role has DELETE privilege constrained by RLS');
select ok(not has_table_privilege('anon', 'public.tasks', 'DELETE'), 'anonymous role cannot delete tasks');
select ok(has_function_privilege('authenticated', 'public.is_board_owner(uuid)', 'EXECUTE'), 'authenticated role can evaluate owner policy');
select ok(not has_function_privilege('anon', 'public.is_board_owner(uuid)', 'EXECUTE'), 'anonymous role cannot execute owner helper');
select ok(has_function_privilege('authenticated', 'public.is_board_member(uuid)', 'EXECUTE'), 'authenticated role can evaluate membership policy');
select ok(not has_function_privilege('anon', 'public.is_board_member(uuid)', 'EXECUTE'), 'anonymous role cannot execute membership helper');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2b000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-11@example.test', '', now(), now(), now()),
  ('2b000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-11@example.test', '', now(), now(), now()),
  ('2b000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-11@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2b000000-0000-4000-8000-000000000010', 'Shared delete test board', '2b000000-0000-4000-8000-000000000001'),
  ('2b000000-0000-4000-8000-000000000020', 'Private delete test board', '2b000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2b000000-0000-4000-8000-000000000010', '2b000000-0000-4000-8000-000000000001', 'owner'),
  ('2b000000-0000-4000-8000-000000000010', '2b000000-0000-4000-8000-000000000002', 'member'),
  ('2b000000-0000-4000-8000-000000000020', '2b000000-0000-4000-8000-000000000003', 'owner');

insert into public.tasks (id, board_id, title, created_by) values
  ('2b000000-0000-4000-8000-000000000101', '2b000000-0000-4000-8000-000000000010', 'Owner-created task', '2b000000-0000-4000-8000-000000000001'),
  ('2b000000-0000-4000-8000-000000000102', '2b000000-0000-4000-8000-000000000010', 'Member-created task', '2b000000-0000-4000-8000-000000000002'),
  ('2b000000-0000-4000-8000-000000000201', '2b000000-0000-4000-8000-000000000020', 'Private-board task', '2b000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000002', true);
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000102' returning 1
) select count(*)::integer from deleted), 1, 'member can delete a task they created');
select ok(not exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000102'
), 'member-created task was deleted');
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000101' returning 1
) select count(*)::integer from deleted), 0, 'member cannot delete a task created by another user');
select ok(exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000101'
), 'another member task remains after the denied delete');

select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000003', true);
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000101' returning 1
) select count(*)::integer from deleted), 0, 'member of another board cannot delete a task on this board');
select ok(exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000101'
), 'task remains after a non-member delete attempt');

select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000001', true);
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000101' returning 1
) select count(*)::integer from deleted), 1, 'board owner can delete a task created by a member');
select ok(not exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000101'
), 'owner-deleted task is gone');
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000201' returning 1
) select count(*)::integer from deleted), 0, 'owner cannot delete a task on a board they do not belong to');
select ok(exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000201'
), 'other-board task remains after the owner delete attempt');

select set_config('request.jwt.claim.sub', '2b000000-0000-4000-8000-000000000003', true);
select is((with deleted as (
  delete from public.tasks where id = '2b000000-0000-4000-8000-000000000201' returning 1
) select count(*)::integer from deleted), 1, 'owner can delete a task on their own board');
select ok(not exists (
  select 1 from public.tasks where id = '2b000000-0000-4000-8000-000000000201'
), 'private-board owner-deleted task is gone');

reset role;
select * from finish();
rollback;
