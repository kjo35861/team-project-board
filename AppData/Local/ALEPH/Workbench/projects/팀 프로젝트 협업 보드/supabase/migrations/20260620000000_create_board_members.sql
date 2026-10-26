-- 2.2: Board membership and the single-owner invariant.
-- Data API access remains closed until the RLS/grants work in later steps.

create table public.board_members (
  board_id uuid not null references public.boards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  constraint board_members_pkey primary key (board_id, user_id),
  constraint board_members_role_check check (role in ('owner', 'member'))
);

comment on table public.board_members is
  'Board membership and role. Board owners are represented by the matching owner_id user with role owner.';

-- The composite primary key prevents duplicate membership. This partial unique
-- index independently prevents more than one owner-role row for a board.
create unique index board_members_one_owner_per_board_idx
  on public.board_members (board_id)
  where role = 'owner';

-- Supports finding all boards for a user; the primary key already supports
-- listing members of one board.
create index board_members_user_id_board_id_idx
  on public.board_members (user_id, board_id);

create function public.enforce_board_member_owner_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actual_owner_id uuid;
begin
  -- Let the table CHECK constraint report unsupported role values.
  if new.role not in ('owner', 'member') then
    return new;
  end if;

  select b.owner_id
    into actual_owner_id
    from public.boards as b
   where b.id = new.board_id;

  -- The foreign key reports a missing board after this trigger returns.
  if not found then
    return new;
  end if;

  if (new.role = 'owner') <> (new.user_id = actual_owner_id) then
    raise exception 'Board owner membership must match boards.owner_id.'
      using errcode = '23514',
            constraint = 'board_members_owner_role_matches_board';
  end if;

  return new;
end;
$function$;

create trigger board_members_owner_role_matches_board
before insert or update of board_id, user_id, role
on public.board_members
for each row
execute function public.enforce_board_member_owner_role();

-- Require the matching owner membership to exist at transaction end. This lets
-- the later board-creation RPC insert the board and its owner membership
-- atomically, while preventing an ownerless board from being committed.
create function public.enforce_board_has_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_board_ids uuid[];
  target_board_id uuid;
begin
  -- An UPDATE can affect membership invariants on both its old and new board.
  -- Validate both sides so moving an owner's row cannot orphan the old board.
  if tg_table_name = 'boards' then
    if tg_op = 'DELETE' then
      target_board_ids := array[old.id];
    elsif tg_op = 'UPDATE' then
      target_board_ids := array[old.id, new.id];
    else
      target_board_ids := array[new.id];
    end if;
  else
    if tg_op = 'DELETE' then
      target_board_ids := array[old.board_id];
    elsif tg_op = 'UPDATE' then
      target_board_ids := array[old.board_id, new.board_id];
    else
      target_board_ids := array[new.board_id];
    end if;
  end if;

  foreach target_board_id in array target_board_ids loop
    -- A deleted board has no remaining owner-membership requirement.
    if exists (
      select 1 from public.boards as b where b.id = target_board_id
    ) and not exists (
      select 1
        from public.boards as b
        join public.board_members as bm on bm.board_id = b.id
       where b.id = target_board_id
         and bm.user_id = b.owner_id
         and bm.role = 'owner'
    ) then
      raise exception 'Every board must have a matching owner membership.'
        using errcode = '23514',
              constraint = 'board_members_owner_required';
    end if;
  end loop;

  return null;
end;
$function$;

create constraint trigger boards_require_owner_membership
  after insert or update on public.boards
  deferrable initially deferred
  for each row
  execute function public.enforce_board_has_owner_membership();

create constraint trigger board_members_require_owner_membership
  after insert or update or delete on public.board_members
  deferrable initially deferred
  for each row
  execute function public.enforce_board_has_owner_membership();

-- Backfill the owner membership for any boards that predate this migration.
insert into public.board_members (board_id, user_id, role)
select b.id, b.owner_id, 'owner'
  from public.boards as b
on conflict (board_id, user_id) do update
  set role = excluded.role;

alter table public.board_members enable row level security;
revoke all on table public.board_members from anon, authenticated;

-- These SECURITY DEFINER functions are trigger-only implementation details.
revoke all on function public.enforce_board_member_owner_role() from public, anon, authenticated;
revoke all on function public.enforce_board_has_owner_membership() from public, anon, authenticated;
