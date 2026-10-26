-- 2.3: Shared task schema, input constraints, and board-oriented indexes.
-- Data API access stays closed until grants and RLS policies are added later.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo',
  assignee_id uuid references auth.users (id) on delete set null,
  due_date date,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_title_check check (
    char_length(title) between 1 and 120
    and title ~ '[^[:space:]]'
  ),
  constraint tasks_description_check check (
    description is null or char_length(description) <= 2000
  ),
  constraint tasks_status_check check (
    status in ('todo', 'in_progress', 'done')
  )
);

comment on table public.tasks is
  'Shared board tasks. Membership-based authorization and assignment membership checks are added in later migrations.';
comment on column public.tasks.due_date is
  'Calendar date without a time or time zone; the application interprets it using the Asia/Seoul product rule.';
comment on column public.tasks.created_by is
  'Authenticated user who created the task; task write permissions are enforced by later RLS policies.';

-- Normalize title whitespace and represent a blank optional description as NULL.
-- Length and non-empty requirements are still enforced by table constraints.
create function public.normalize_task_text_fields()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.title := regexp_replace(new.title, '^[[:space:]]+|[[:space:]]+$', '', 'g');

  if new.description is not null
     and new.description !~ '[^[:space:]]' then
    new.description := null;
  end if;

  return new;
end;
$function$;

create trigger tasks_normalize_text_fields
before insert or update of title, description
on public.tasks
for each row
execute function public.normalize_task_text_fields();

revoke all on function public.normalize_task_text_fields() from public, anon, authenticated;

-- Match the board's status-column ordering: due dates first (NULL last), then
-- recently-created tasks. The second index supports filtering by assignee.
create index tasks_board_status_due_date_created_idx
  on public.tasks (board_id, status, due_date asc nulls last, created_at desc);

create index tasks_board_assignee_idx
  on public.tasks (board_id, assignee_id);

alter table public.tasks enable row level security;
revoke all on table public.tasks from anon, authenticated;
