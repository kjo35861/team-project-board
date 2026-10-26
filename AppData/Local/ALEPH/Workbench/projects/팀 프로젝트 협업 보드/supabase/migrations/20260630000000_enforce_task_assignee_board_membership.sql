-- 2.12: A task assignee must be a member of that same board.
-- A composite foreign key provides race-safe enforcement: membership cannot be
-- removed concurrently while a task still refers to it. If a member is removed,
-- only assignee_id is cleared; the task remains on its board.

-- Repair any legacy cross-board assignments without deleting tasks. A blank
-- assignee is valid; assignments that cannot satisfy the new rule are cleared.
update public.tasks as task
   set assignee_id = null
 where task.assignee_id is not null
   and not exists (
     select 1
       from public.board_members as member
      where member.board_id = task.board_id
        and member.user_id = task.assignee_id
   );

-- The composite reference also implies that the assignee is an auth user,
-- because board_members.user_id already references auth.users.
alter table public.tasks
  drop constraint if exists tasks_assignee_id_fkey;

alter table public.tasks
  add constraint tasks_assignee_membership_fkey
  foreign key (board_id, assignee_id)
  references public.board_members (board_id, user_id)
  on delete set null (assignee_id);

comment on constraint tasks_assignee_membership_fkey on public.tasks is
  'A non-NULL assignee must belong to the same board as the task; removing that membership clears only assignee_id.';
