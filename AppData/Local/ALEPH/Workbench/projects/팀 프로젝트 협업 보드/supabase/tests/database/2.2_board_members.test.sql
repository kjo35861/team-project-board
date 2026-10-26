begin;

select plan(15);

select has_table('public', 'board_members', 'board_members table exists');
select has_column('public', 'board_members', 'board_id', 'board membership has a board id');
select has_pk('public', 'board_members', 'board membership is unique per board and user');
select has_check('public', 'board_members', 'board_members_role_check', 'membership role is constrained');
select has_index('public', 'board_members', 'board_members_one_owner_per_board_idx', 'a board has a unique owner-role slot');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_members'::regclass),
  'row level security is enabled'
);
select ok(
  not has_table_privilege('anon', 'public.board_members', 'SELECT'),
  'anonymous users cannot directly read memberships'
);
select ok(
  has_table_privilege('authenticated', 'public.board_members', 'SELECT'),
  'authenticated users have roster SELECT grant added in 2.9'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('22000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-2@example.test', '', now(), now(), now()),
  ('22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-2@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id)
values ('22000000-0000-4000-8000-000000000010', 'Membership test board', '22000000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role)
values
  ('22000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-000000000001', 'owner'),
  ('22000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-000000000002', 'member');

select throws_ok(
  $$insert into public.board_members (board_id, user_id, role)
    values ('22000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-000000000002', 'member')$$,
  '23505',
  null,
  'rejects a duplicate board membership'
);

select throws_ok(
  $$insert into public.board_members (board_id, user_id, role)
    values ('22000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-000000000002', 'administrator')$$,
  '23514',
  null,
  'rejects an unsupported role'
);

select throws_ok(
  $$insert into public.board_members (board_id, user_id, role)
    values ('22000000-0000-4000-8000-000000000010', '22000000-0000-4000-8000-000000000002', 'owner')$$,
  '23514',
  null,
  'rejects an owner role that does not match boards.owner_id'
);

select throws_ok(
  $$do $test$
    begin
      delete from public.board_members
       where board_id = '22000000-0000-4000-8000-000000000010'
         and user_id = '22000000-0000-4000-8000-000000000001';
      set constraints all immediate;
    end;
  $test$$$,
  '23514',
  null,
  'rejects deleting the only owner membership at transaction end'
);

select throws_ok(
  $$do $test$
    begin
      insert into public.boards (id, name, owner_id)
      values (
        '22000000-0000-4000-8000-000000000011',
        'Ownerless test board',
        '22000000-0000-4000-8000-000000000001'
      );
      set constraints all immediate;
    end;
  $test$$$,
  '23514',
  null,
  'rejects committing a board without its matching owner membership'
);

select throws_ok(
  $$do $test$
    begin
      update public.boards
         set owner_id = '22000000-0000-4000-8000-000000000002'
       where id = '22000000-0000-4000-8000-000000000010';
      set constraints all immediate;
    end;
  $test$$$,
  '23514',
  null,
  'rejects changing board owner without atomically updating the owner membership'
);

-- Ownership can be transferred when board metadata and membership are updated
-- together in one transaction.
insert into public.boards (id, name, owner_id)
values ('22000000-0000-4000-8000-000000000012', 'Atomic transfer test board', '22000000-0000-4000-8000-000000000001');

insert into public.board_members (board_id, user_id, role)
values
  ('22000000-0000-4000-8000-000000000012', '22000000-0000-4000-8000-000000000001', 'owner'),
  ('22000000-0000-4000-8000-000000000012', '22000000-0000-4000-8000-000000000002', 'member');

update public.boards
   set owner_id = '22000000-0000-4000-8000-000000000002'
 where id = '22000000-0000-4000-8000-000000000012';
update public.board_members
   set role = 'member'
 where board_id = '22000000-0000-4000-8000-000000000012'
   and user_id = '22000000-0000-4000-8000-000000000001';
update public.board_members
   set role = 'owner'
 where board_id = '22000000-0000-4000-8000-000000000012'
   and user_id = '22000000-0000-4000-8000-000000000002';
set constraints all immediate;

select is(
  (select owner_id from public.boards where id = '22000000-0000-4000-8000-000000000012'),
  '22000000-0000-4000-8000-000000000002'::uuid,
  'allows an atomic owner transfer with a matching membership update'
);

select * from finish();
rollback;
