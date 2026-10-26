-- 2.5: Make creation/update timestamps database-owned and document the
-- existing FK deletion behavior for boards and their dependent records.

create function public.set_row_timestamps()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'INSERT' then
    -- Ignore client-supplied values; persisted timestamps come from the DB.
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
  else
    -- Creation time is immutable after insertion; every update gets a fresh
    -- statement timestamp, including updates that try to supply their own.
    new.created_at := old.created_at;
    new.updated_at := statement_timestamp();
  end if;

  return new;
end;
$function$;

comment on function public.set_row_timestamps() is
  'Trigger-only helper: sets created_at/updated_at on insert and preserves created_at while refreshing updated_at on update.';

create trigger profiles_set_row_timestamps
before insert or update on public.profiles
for each row
execute function public.set_row_timestamps();

create trigger boards_set_row_timestamps
before insert or update on public.boards
for each row
execute function public.set_row_timestamps();

create trigger tasks_set_row_timestamps
before insert or update on public.tasks
for each row
execute function public.set_row_timestamps();

revoke all on function public.set_row_timestamps() from public, anon, authenticated;

-- The FK actions were declared with the base schemas; document them here as
-- the agreed deletion contract and exercise them in the matching pgTAP tests.
comment on constraint boards_owner_id_fkey on public.boards is
  'Deleting an auth user deletes their owned board; board-scoped rows then cascade with that board.';
comment on constraint board_members_board_id_fkey on public.board_members is
  'Deleting a board removes its memberships.';
comment on constraint board_members_user_id_fkey on public.board_members is
  'Deleting an auth user removes their board memberships.';
comment on constraint tasks_board_id_fkey on public.tasks is
  'Deleting a board removes its tasks.';
comment on constraint tasks_assignee_id_fkey on public.tasks is
  'Deleting an auth user clears that user from task assignments without deleting the task.';
comment on constraint tasks_created_by_fkey on public.tasks is
  'Deleting an auth user removes tasks they created.';
comment on constraint board_invites_board_id_fkey on public.board_invites is
  'Deleting a board removes its invitations.';
comment on constraint board_invites_created_by_fkey on public.board_invites is
  'Deleting an auth user removes invitations they created.';
comment on constraint board_invites_accepted_by_fkey on public.board_invites is
  'An accepting auth user cannot be deleted while accepted invitation history references them.';
