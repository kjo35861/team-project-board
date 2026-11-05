begin;

select plan(9);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'boards', 'boards table exists');
select has_column('public', 'profiles', 'id', 'profile id column exists');
select has_column('public', 'boards', 'owner_id', 'board owner column exists');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_display_name_check' and contype = 'c'), 'profile display name has a database constraint');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.boards'::regclass and conname = 'boards_name_check' and contype = 'c'), 'board name has a database constraint');

select throws_ok(
  $$insert into public.boards (name, owner_id) values ('', gen_random_uuid())$$,
  '23514',
  null,
  'rejects an empty board name'
);
select throws_ok(
  $$insert into public.boards (name, owner_id) values (repeat('a', 61), gen_random_uuid())$$,
  '23514',
  null,
  'rejects a board name longer than 60 characters'
);
select throws_ok(
  $$insert into public.boards (name, owner_id) values ('Valid name', gen_random_uuid())$$,
  '23503',
  null,
  'rejects a board owner that does not exist in auth.users'
);

select * from finish();
rollback;
