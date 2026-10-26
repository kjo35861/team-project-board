begin;

select plan(50);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'boards', 'boards table exists');
select has_table('public', 'board_members', 'board_members table exists');
select has_table('public', 'tasks', 'tasks table exists');
select has_table('public', 'board_invites', 'board_invites table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.boards'::regclass),
  'RLS is enabled on boards'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_members'::regclass),
  'RLS is enabled on board_members'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),
  'RLS is enabled on tasks'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_invites'::regclass),
  'RLS is enabled on board_invites'
);

select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon cannot select profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'INSERT'), 'anon cannot insert profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'UPDATE'), 'anon cannot update profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'DELETE'), 'anon cannot delete profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'profile SELECT is revoked; members use the scoped roster RPC');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'INSERT'), 'authenticated has no profile insert grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated has no profile update grant');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'DELETE'), 'authenticated has no profile delete grant');

select ok(not has_table_privilege('anon', 'public.boards', 'SELECT'), 'anon cannot select boards');
select ok(not has_table_privilege('anon', 'public.boards', 'INSERT'), 'anon cannot insert boards');
select ok(not has_table_privilege('anon', 'public.boards', 'UPDATE'), 'anon cannot update boards');
select ok(not has_table_privilege('anon', 'public.boards', 'DELETE'), 'anon cannot delete boards');
select ok(has_table_privilege('authenticated', 'public.boards', 'SELECT'), 'authenticated has board SELECT grant added in 2.8');
select ok(not has_table_privilege('authenticated', 'public.boards', 'INSERT'), 'authenticated has no board insert grant');
select ok(not has_table_privilege('authenticated', 'public.boards', 'UPDATE'), 'authenticated has no board update grant');
select ok(not has_table_privilege('authenticated', 'public.boards', 'DELETE'), 'authenticated has no board delete grant');

select ok(not has_table_privilege('anon', 'public.board_members', 'SELECT'), 'anon cannot select board_members');
select ok(not has_table_privilege('anon', 'public.board_members', 'INSERT'), 'anon cannot insert board_members');
select ok(not has_table_privilege('anon', 'public.board_members', 'UPDATE'), 'anon cannot update board_members');
select ok(not has_table_privilege('anon', 'public.board_members', 'DELETE'), 'anon cannot delete board_members');
select ok(has_table_privilege('authenticated', 'public.board_members', 'SELECT'), 'authenticated has roster SELECT grant added in 2.9');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'INSERT'), 'authenticated has no membership insert grant');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'UPDATE'), 'authenticated has no membership update grant');
select ok(not has_table_privilege('authenticated', 'public.board_members', 'DELETE'), 'authenticated has no membership delete grant');

select ok(not has_table_privilege('anon', 'public.tasks', 'SELECT'), 'anon cannot select tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'INSERT'), 'anon cannot insert tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'UPDATE'), 'anon cannot update tasks');
select ok(not has_table_privilege('anon', 'public.tasks', 'DELETE'), 'anon cannot delete tasks');
select ok(has_table_privilege('authenticated', 'public.tasks', 'SELECT'), 'authenticated task SELECT is granted in 2.10 and constrained by RLS');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'INSERT'), 'authenticated has no table-wide task INSERT grant; inserts are column-scoped in 2.10');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'UPDATE'), 'authenticated has no table-wide task UPDATE grant; updates are column-scoped in 2.10');
select ok(has_table_privilege('authenticated', 'public.tasks', 'DELETE'), 'authenticated task DELETE grant is added in 2.11 and constrained by RLS');

select ok(not has_table_privilege('anon', 'public.board_invites', 'SELECT'), 'anon cannot select board_invites');
select ok(not has_table_privilege('anon', 'public.board_invites', 'INSERT'), 'anon cannot insert board_invites');
select ok(not has_table_privilege('anon', 'public.board_invites', 'UPDATE'), 'anon cannot update board_invites');
select ok(not has_table_privilege('anon', 'public.board_invites', 'DELETE'), 'anon cannot delete board_invites');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'), 'authenticated has no invitation select grant before RPC setup');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'INSERT'), 'authenticated has no invitation insert grant before RPC setup');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE'), 'authenticated has no invitation update grant before RPC setup');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'), 'authenticated has no invitation delete grant before RPC setup');

select * from finish();
rollback;
