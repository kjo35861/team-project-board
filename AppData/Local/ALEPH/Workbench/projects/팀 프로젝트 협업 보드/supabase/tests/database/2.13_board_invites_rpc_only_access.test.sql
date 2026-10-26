begin;

select plan(17);

select has_table('public', 'board_invites', 'board_invites table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.board_invites'::regclass),
  'RLS is enabled on board_invites'
);
select is(
  (select count(*)::integer
     from pg_policies
    where schemaname = 'public'
      and tablename = 'board_invites'),
  0,
  'no direct table policies expose invitation records'
);

select ok(not has_table_privilege('anon', 'public.board_invites', 'SELECT'), 'anon cannot select invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'INSERT'), 'anon cannot insert invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'UPDATE'), 'anon cannot update invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'DELETE'), 'anon cannot delete invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'TRUNCATE'), 'anon cannot truncate invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'REFERENCES'), 'anon cannot create references to invitations');
select ok(not has_table_privilege('anon', 'public.board_invites', 'TRIGGER'), 'anon cannot create invitation triggers');

select ok(not has_table_privilege('authenticated', 'public.board_invites', 'SELECT'), 'authenticated cannot select invitations directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'INSERT'), 'authenticated cannot insert invitations directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'UPDATE'), 'authenticated cannot update invitations directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'DELETE'), 'authenticated cannot delete invitations directly');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'TRUNCATE'), 'authenticated cannot truncate invitations');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'REFERENCES'), 'authenticated cannot create references to invitations');
select ok(not has_table_privilege('authenticated', 'public.board_invites', 'TRIGGER'), 'authenticated cannot create invitation triggers');

select * from finish();
rollback;
