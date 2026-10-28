import { BoardRepositoryError, toRepositoryError } from "./board-repository.js";
import { validateTaskInput } from "./task-validation.js";

const TASK_COLUMNS = "id,board_id,title,description,status,assignee_id,due_date,created_by,created_at,updated_at";
const TASK_STATUSES = new Set(["todo", "in_progress", "done"]);

export class TaskRepositoryInputError extends Error {
  constructor(fieldErrors) {
    super("업무 입력 내용을 확인해 주세요.");
    this.name = "TaskRepositoryInputError";
    this.code = "invalid_input";
    this.fieldErrors = { ...fieldErrors };
  }
}

function normalizeBoardId(boardId) {
  if (typeof boardId !== "string" || !boardId.trim()) {
    throw new BoardRepositoryError("invalid_input");
  }
  return boardId.trim();
}

async function requireAuthenticatedUser(client) {
  if (typeof client?.auth?.getUser !== "function") {
    throw new BoardRepositoryError("request_failed");
  }

  let result;
  try {
    result = await client.auth.getUser();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  if (typeof result?.data?.user?.id !== "string" || !result.data.user.id) {
    throw new BoardRepositoryError("unauthenticated");
  }
  return result.data.user.id;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeTask(row, requestedBoardId) {
  if (!row || typeof row !== "object" || Array.isArray(row)
    || typeof row.id !== "string" || !row.id
    || row.board_id !== requestedBoardId
    || typeof row.title !== "string" || !row.title.trim()
    || Array.from(row.title).length > 120
    || !(row.description === null || (typeof row.description === "string" && Array.from(row.description).length <= 2000))
    || !TASK_STATUSES.has(row.status)
    || !(row.assignee_id === null || (typeof row.assignee_id === "string" && row.assignee_id))
    || !(row.due_date === null || isCalendarDate(row.due_date))
    || typeof row.created_by !== "string" || !row.created_by
    || !isTimestamp(row.created_at)
    || !isTimestamp(row.updated_at)) {
    throw new BoardRepositoryError("request_failed");
  }

  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    assigneeId: row.assignee_id,
    dueDate: row.due_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAssigneeId(input) {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input.assigneeId
    : undefined;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !raw.trim()) {
    throw new TaskRepositoryInputError({ assigneeId: "담당자를 확인해 주세요." });
  }
  return raw.trim();
}


function normalizeTaskInput(input) {
  const validation = validateTaskInput(input);
  const fieldErrors = { ...validation.errors };
  let assigneeId = null;

  try {
    assigneeId = normalizeAssigneeId(input);
  } catch (error) {
    Object.assign(fieldErrors, error.fieldErrors);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new TaskRepositoryInputError(fieldErrors);
  }
  return { value: validation.value, assigneeId };
}

/** Fetch only the authenticated user's RLS-visible tasks for one board. */
export async function listTasks(client, boardId) {
  const requestedBoardId = normalizeBoardId(boardId);
  if (typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }

  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("board_id", requestedBoardId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  if (!Array.isArray(result?.data)) throw new BoardRepositoryError("request_failed");

  // The explicit board filter limits the query; RLS remains the authorization
  // boundary. Verify the returned scope and whitelist fields before exposing it.
  return result.data.map((row) => normalizeTask(row, requestedBoardId));
}

/**
 * Create one task using only validated form fields. The creator identity is
 * taken from the verified Supabase session, never from caller-controlled data.
 */
export async function createTask(client, boardId, input) {
  const requestedBoardId = normalizeBoardId(boardId);
  const { value, assigneeId } = normalizeTaskInput(input);

  if (typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }
  const userId = await requireAuthenticatedUser(client);

  // Whitelist insert columns: IDs, creator, and timestamps are not accepted
  // from the caller. PostgreSQL supplies the task ID and timestamps.
  const insertValues = {
    board_id: requestedBoardId,
    title: value.title,
    description: value.description || null,
    status: value.status,
    assignee_id: assigneeId,
    due_date: value.dueDate,
    created_by: userId,
  };

  let result;
  try {
    result = await client
      .from("tasks")
      .insert(insertValues)
      .select(TASK_COLUMNS)
      .single();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  const task = normalizeTask(result?.data, requestedBoardId);
  if (task.createdBy !== userId
    || task.title !== value.title
    || task.description !== value.description
    || task.status !== value.status
    || task.assigneeId !== assigneeId
    || task.dueDate !== value.dueDate) {
    throw new BoardRepositoryError("request_failed");
  }
  return task;
}


function normalizeTaskId(taskId) {
  if (typeof taskId !== "string" || !taskId.trim()) {
    throw new BoardRepositoryError("invalid_input");
  }
  return taskId.trim();
}

function normalizeTaskStatus(status) {
  if (typeof status !== "string" || !TASK_STATUSES.has(status)) {
    throw new TaskRepositoryInputError({ status: "진행 상태를 확인해 주세요." });
  }
  return status;
}

/**
 * Update one task within the requested board using only editable task fields.
 * Board membership and field-level permissions remain enforced by RLS.
 */
export async function updateTask(client, boardId, taskId, input) {
  const requestedBoardId = normalizeBoardId(boardId);
  const requestedTaskId = normalizeTaskId(taskId);
  const { value, assigneeId } = normalizeTaskInput(input);

  if (typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }
  await requireAuthenticatedUser(client);
  const updateValues = {
    title: value.title,
    description: value.description || null,
    status: value.status,
    assignee_id: assigneeId,
    due_date: value.dueDate,
  };

  let result;
  try {
    result = await client
      .from("tasks")
      .update(updateValues)
      .eq("id", requestedTaskId)
      .eq("board_id", requestedBoardId)
      .select(TASK_COLUMNS)
      .single();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  const task = normalizeTask(result?.data, requestedBoardId);
  if (task.id !== requestedTaskId
    || task.title !== value.title
    || task.description !== value.description
    || task.status !== value.status
    || task.assigneeId !== assigneeId
    || task.dueDate !== value.dueDate) {
    throw new BoardRepositoryError("request_failed");
  }
  return task;
}

/**
 * Update only a task's status while retaining the same authentication,
 * board/task scope, response validation, and safe error mapping as updateTask.
 */
export async function updateTaskStatus(client, boardId, taskId, status) {
  const requestedBoardId = normalizeBoardId(boardId);
  const requestedTaskId = normalizeTaskId(taskId);
  const normalizedStatus = normalizeTaskStatus(status);

  if (typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }
  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client
      .from("tasks")
      .update({ status: normalizedStatus })
      .eq("id", requestedTaskId)
      .eq("board_id", requestedBoardId)
      .select(TASK_COLUMNS)
      .single();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  const task = normalizeTask(result?.data, requestedBoardId);
  if (task.id !== requestedTaskId || task.status !== normalizedStatus) {
    throw new BoardRepositoryError("request_failed");
  }
  return task;
}

/** Delete one task within the requested board; RLS decides whether the user may delete it. */
export async function deleteTask(client, boardId, taskId) {
  const requestedBoardId = normalizeBoardId(boardId);
  const requestedTaskId = normalizeTaskId(taskId);

  if (typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }
  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client
      .from("tasks")
      .delete()
      .eq("id", requestedTaskId)
      .eq("board_id", requestedBoardId)
      .select(TASK_COLUMNS)
      .single();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  const task = normalizeTask(result?.data, requestedBoardId);
  if (task.id !== requestedTaskId) {
    throw new BoardRepositoryError("request_failed");
  }
  return task;
}
