begin;

select plan(16);

select has_function('public', 'is_board_member', array['uuid'], 'membership helper exists');
select has_function('public', 'is_board_owner', array['uuid'], 'owner helper exists');
select ok(
  (select prosecdef from pg_proc where oid = 'public.is_board_member(uuid)'::regprocedure),
  'membership helper runs with definer privileges to avoid RLS recursion'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.is_board_owner(uuid)'::regprocedure),
  'owner helper runs with definer privileges to avoid RLS recursion'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.is_board_member(uuid)'::regprocedure),
  'membership helper pins search_path to pg_catalog'
);
select ok(
  (select proconfig @> array['search_path=pg_catalog'] from pg_proc where oid = 'public.is_board_owner(uuid)'::regprocedure),
  'owner helper pins search_path to pg_catalog'
);
select ok(
  has_function_privilege('authenticated', 'public.is_board_member(uuid)', 'EXECUTE'),
  'authenticated users can call membership helper for RLS evaluation'
);
select ok(
  has_function_privilege('authenticated', 'public.is_board_owner(uuid)', 'EXECUTE'),
  'authenticated users can call owner helper for RLS evaluation'
);
select ok(
  not has_function_privilege('anon', 'public.is_board_member(uuid)', 'EXECUTE'),
  'anonymous users cannot call membership helper'
);
select ok(
  not has_function_privilege('anon', 'public.is_board_owner(uuid)', 'EXECUTE'),
  'anonymous users cannot call owner helper'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
) values
  ('26000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-2-6@example.test', '', now(), now(), now()),
  ('26000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'member-2-6@example.test', '', now(), now(), now()),
  ('26000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider-2-6@example.test', '', now(), now(), now());

insert into public.boards (id, name, owner_id)
values ('26000000-0000-4000-8000-000000000010', 'Membership helper board', '26000000-0000-4000-8000-000000000001');
insert into public.board_members (board_id, user_id, role)
values
  ('26000000-0000-4000-8000-000000000010', '26000000-0000-4000-8000-000000000001', 'owner'),
  ('26000000-0000-4000-8000-000000000010', '26000000-0000-4000-8000-000000000002', 'member');

set local role authenticated;
select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000001', true);
select ok(
  public.is_board_member('26000000-0000-4000-8000-000000000010'),
  'matching owner is recognized as a board member'
);
select ok(
  public.is_board_owner('26000000-0000-4000-8000-000000000010'),
  'matching board owner is recognized as owner'
);

select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000002', true);
select ok(
  public.is_board_member('26000000-0000-4000-8000-000000000010'),
  'regular member is recognized as a board member'
);
select ok(
  not public.is_board_owner('26000000-0000-4000-8000-000000000010'),
  'regular member is not recognized as the board owner'
);

select set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000003', true);
select ok(
  not public.is_board_member('26000000-0000-4000-8000-000000000010'),
  'non-member is not recognized as a board member'
);
select ok(
  not public.is_board_owner('26000000-0000-4000-8000-000000000010'),
  'non-member is not recognized as the board owner'
);

reset role;
select * from finish();
rollback;
