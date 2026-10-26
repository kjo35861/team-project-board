-- 2.10: Allow board members to read, create, and update tasks.
-- Task deletion remains closed until step 2.11, and assignment membership
-- validation is added separately in step 2.12.

revoke all privileges on table public.tasks
  from public, anon, authenticated;

grant select on table public.tasks to authenticated;

grant insert (
  board_id,
  title,
  description,
  status,
  assignee_id,
  due_date,
  created_by
) on public.tasks to authenticated;

grant update (
  title,
  description,
  status,
  assignee_id,
  due_date
) on public.tasks to authenticated;

create policy tasks_select_board_members
  on public.tasks
  for select
  to authenticated
  using (public.is_board_member(board_id));

create policy tasks_insert_board_members
  on public.tasks
  for insert
  to authenticated
  with check (
    public.is_board_member(board_id)
    and created_by = (select auth.uid())
  );

create policy tasks_update_board_members
  on public.tasks
  for update
  to authenticated
  using (public.is_board_member(board_id))
  with check (public.is_board_member(board_id));

comment on policy tasks_select_board_members on public.tasks is
  'Authenticated board members may read tasks for boards they belong to.';
comment on policy tasks_insert_board_members on public.tasks is
  'Authenticated board members may create tasks only as themselves on a board they belong to.';
comment on policy tasks_update_board_members on public.tasks is
  'Authenticated board members may update allowed task fields on boards they belong to; table grants keep identity and timestamps immutable.';

comment on table public.tasks is
  'Shared board tasks. Authenticated members may read, create, and update allowed fields; deletion and assignment membership validation are handled by later steps.';
