begin;

select plan(15);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS remains enabled on tasks'
);
select ok(exists (
  select 1
    from pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.tasks'::regclass
     and constraint_row.conname = 'tasks_assignee_membership_fkey'
     and constraint_row.contype = 'f'
     and constraint_row.confrelid = 'public.board_members'::regclass
     and (
       select array_agg(attribute.attname::text order by key_column.ordinality)
         from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
         join pg_attribute as attribute
           on attribute.attrelid = constraint_row.conrelid
          and attribute.attnum = key_column.attnum
     ) = array['board_id', 'assignee_id']::text[]
     and (
       select array_agg(attribute.attname::text order by key_column.ordinality)
         from unnest(constraint_row.confkey) with ordinality as key_column(attnum, ordinality)
         join pg_attribute as attribute
           on attribute.attrelid = constraint_row.confrelid
          and attribute.attnum = key_column.attnum
     ) = array['board_id', 'user_id']::text[]
), 'assignee foreign key pairs the task board with a membership on that board');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('2c000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a-2-12@example.test', '', now(), now(), now()),
  ('2c000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-a-2-12@example.test', '', now(), now(), now()),
  ('2c000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'owner-b-2-12@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id) values
  ('2c000000-0000-4000-8000-000000000010', 'Assignee board A', '2c000000-0000-4000-8000-000000000001'),
  ('2c000000-0000-4000-8000-000000000020', 'Assignee board B', '2c000000-0000-4000-8000-000000000003');

insert into public.board_members (board_id, user_id, role) values
  ('2c000000-0000-4000-8000-000000000010', '2c000000-0000-4000-8000-000000000001', 'owner'),
  ('2c000000-0000-4000-8000-000000000010', '2c000000-0000-4000-8000-000000000002', 'member'),
  ('2c000000-0000-4000-8000-000000000020', '2c000000-0000-4000-8000-000000000003', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '2c000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$insert into public.tasks (board_id, title, created_by)
    values ('2c000000-0000-4000-8000-000000000010', 'Unassigned task', '2c000000-0000-4000-8000-000000000002')$$,
  'a board member can create a task with no assignee'
);
select is(
  (select assignee_id from public.tasks where title = 'Unassigned task'),
  null::uuid,
  'an omitted assignee is stored as NULL'
);

select lives_ok(
  $$insert into public.tasks (board_id, title, assignee_id, created_by)
    values ('2c000000-0000-4000-8000-000000000010', 'Same-board assignee', '2c000000-0000-4000-8000-000000000002', '2c000000-0000-4000-8000-000000000002')$$,
  'a task can be assigned to a member of the same board'
);
select is(
  (select assignee_id from public.tasks where title = 'Same-board assignee'),
  '2c000000-0000-4000-8000-000000000002'::uuid,
  'same-board assignee is persisted'
);

select throws_ok(
  $$insert into public.tasks (board_id, title, assignee_id, created_by)
    values ('2c000000-0000-4000-8000-000000000010', 'Cross-board assignee', '2c000000-0000-4000-8000-000000000003', '2c000000-0000-4000-8000-000000000002')$$,
  '23503', null,
  'rejects assigning a user who belongs only to a different board'
);
select throws_ok(
  $$insert into public.tasks (board_id, title, assignee_id, created_by)
    values ('2c000000-0000-4000-8000-000000000010', 'Missing assignee', '2c000000-0000-4000-8000-000000000099', '2c000000-0000-4000-8000-000000000002')$$,
  '23503', null,
  'rejects assigning a user who has no membership'
);
select throws_ok(
  $$update public.tasks
       set assignee_id = '2c000000-0000-4000-8000-000000000003'
     where title = 'Same-board assignee'$$,
  '23503', null,
  'rejects changing an assignment to a user from another board'
);
select lives_ok(
  $$update public.tasks set assignee_id = null where title = 'Same-board assignee'$$,
  'a board member can clear an assignment'
);
select is(
  (select assignee_id from public.tasks where title = 'Same-board assignee'),
  null::uuid,
  'cleared assignment is persisted as NULL'
);
select lives_ok(
  $$update public.tasks
       set assignee_id = '2c000000-0000-4000-8000-000000000002'
     where title = 'Same-board assignee'$$,
  'a valid same-board assignee can be assigned again'
);
select is(
  (select assignee_id from public.tasks where title = 'Same-board assignee'),
  '2c000000-0000-4000-8000-000000000002'::uuid,
  'the assignment is present before membership removal'
);

reset role;
delete from public.board_members
 where board_id = '2c000000-0000-4000-8000-000000000010'
   and user_id = '2c000000-0000-4000-8000-000000000002';

select ok(exists (
  select 1 from public.tasks where title = 'Same-board assignee'
), 'removing an assigned member does not delete the task');
select is(
  (select assignee_id from public.tasks where title = 'Same-board assignee'),
  null::uuid,
  'removing an assigned member clears only the task assignee'
);

select * from finish();
rollback;
