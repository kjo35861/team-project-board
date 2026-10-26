-- 2.11: Restrict task deletion to board owners and the task's own creator.
-- A creator must still be a member of the board; owners may delete every task
-- on their board regardless of who created it.

revoke delete on table public.tasks from public, anon, authenticated;
grant delete on table public.tasks to authenticated;

create policy tasks_delete_owner_or_creator_member
  on public.tasks
  for delete
  to authenticated
  using (
    public.is_board_owner(board_id)
    or (
      public.is_board_member(board_id)
      and created_by = (select auth.uid())
    )
  );

comment on policy tasks_delete_owner_or_creator_member on public.tasks is
  'Board owners may delete every task on their board. Other board members may delete only tasks they created.';

comment on table public.tasks is
  'Shared board tasks. Authenticated board members may read, create, and update allowed fields; board owners may delete all board tasks and members may delete tasks they created.';
