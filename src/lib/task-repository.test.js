import { describe, expect, it, vi } from "vitest";
import { createTask, listTasks, updateTask, updateTaskStatus } from "./task-repository.js";

const ROW = {
  id: "task-1",
  board_id: "board-1",
  title: "기획안 작성",
  description: "요구사항 정리",
  status: "in_progress",
  assignee_id: "member-1",
  due_date: "2026-08-12",
  created_by: "user-1",
  created_at: "2026-07-08T12:00:00.000Z",
  updated_at: "2026-07-09T12:30:00.000Z",
};

function makeClient({ user = { id: "user-1" }, authError = null, data = [ROW], error = null, thrown = null } = {}) {
  const calls = { from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn() };
  const builder = {
    then(resolve, reject) {
      if (thrown) return Promise.reject(thrown).then(resolve, reject);
      return Promise.resolve({ data, error }).then(resolve, reject);
    },
  };
  calls.from.mockReturnValue(builder);
  calls.select.mockReturnValue(builder);
  calls.eq.mockReturnValue(builder);
  calls.order.mockReturnValue(builder);
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  return { client: { auth: { getUser }, from: calls.from }, calls, getUser };
}

function makeCreateClient({ user = { id: "user-1" }, authError = null, data = ROW, error = null, thrown = null } = {}) {
  const calls = { from: vi.fn(), insert: vi.fn(), select: vi.fn(), single: vi.fn() };
  const builder = {};
  calls.from.mockReturnValue(builder);
  calls.insert.mockReturnValue(builder);
  calls.select.mockReturnValue(builder);
  calls.single.mockImplementation(() => {
    if (thrown) return Promise.reject(thrown);
    return Promise.resolve({ data, error });
  });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  return { client: { auth: { getUser }, from: calls.from }, calls, getUser };
}

function makeUpdateClient({ user = { id: "user-1" }, authError = null, data = ROW, error = null, thrown = null } = {}) {
  const calls = { from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn() };
  const builder = {};
  calls.from.mockReturnValue(builder);
  calls.update.mockReturnValue(builder);
  calls.eq.mockReturnValue(builder);
  calls.select.mockReturnValue(builder);
  calls.single.mockImplementation(() => {
    if (thrown) return Promise.reject(thrown);
    return Promise.resolve({ data, error });
  });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  return { client: { auth: { getUser }, from: calls.from }, calls, getUser };
}


describe("listTasks", () => {
  it("queries one RLS-visible board with stable due-date ordering and maps safe fields", async () => {
    const setup = makeClient({ data: [{ ...ROW, unexpected_private_value: "discard" }] });

    await expect(listTasks(setup.client, " board-1 ")).resolves.toEqual([{
      id: "task-1",
      boardId: "board-1",
      title: "기획안 작성",
      description: "요구사항 정리",
      status: "in_progress",
      assigneeId: "member-1",
      dueDate: "2026-08-12",
      createdBy: "user-1",
      createdAt: ROW.created_at,
      updatedAt: ROW.updated_at,
    }]);
    expect(setup.getUser).toHaveBeenCalledOnce();
    expect(setup.calls.from).toHaveBeenCalledWith("tasks");
    expect(setup.calls.select).toHaveBeenCalledWith("id,board_id,title,description,status,assignee_id,due_date,created_by,created_at,updated_at");
    expect(setup.calls.eq).toHaveBeenCalledWith("board_id", "board-1");
    expect(setup.calls.order).toHaveBeenNthCalledWith(1, "due_date", { ascending: true, nullsFirst: false });
    expect(setup.calls.order).toHaveBeenNthCalledWith(2, "created_at", { ascending: false });
    expect(setup.calls.order).toHaveBeenNthCalledWith(3, "id", { ascending: true });
  });

  it("does not query until a current authenticated user has been confirmed", async () => {
    const noUser = makeClient({ user: null });
    await expect(listTasks(noUser.client, "board-1")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(noUser.calls.from).not.toHaveBeenCalled();

    const authFailure = makeClient({ authError: { status: 401 } });
    await expect(listTasks(authFailure.client, "board-1")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(authFailure.calls.from).not.toHaveBeenCalled();
  });

  it("rejects an invalid board ID before authentication or data access", async () => {
    const setup = makeClient();
    await expect(listTasks(setup.client, "   ")).rejects.toMatchObject({ code: "invalid_input" });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.calls.from).not.toHaveBeenCalled();
  });

  it("returns an empty array for a valid empty board result", async () => {
    const setup = makeClient({ data: [] });
    await expect(listTasks(setup.client, "board-1")).resolves.toEqual([]);
  });

  it("rejects malformed rows and any response that escapes the requested board scope", async () => {
    const wrongBoard = makeClient({ data: [{ ...ROW, board_id: "board-2" }] });
    await expect(listTasks(wrongBoard.client, "board-1")).rejects.toMatchObject({ code: "request_failed" });

    const badStatus = makeClient({ data: [{ ...ROW, status: "blocked" }] });
    await expect(listTasks(badStatus.client, "board-1")).rejects.toMatchObject({ code: "request_failed" });

    const badDate = makeClient({ data: [{ ...ROW, due_date: "2025-02-29" }] });
    await expect(listTasks(badDate.client, "board-1")).rejects.toMatchObject({ code: "request_failed" });

    const nonArray = makeClient({ data: null });
    await expect(listTasks(nonArray.client, "board-1")).rejects.toMatchObject({ code: "request_failed" });
  });

  it("maps access, network, and unexpected failures to safe repository errors", async () => {
    const forbidden = makeClient({ error: { code: "42501", message: "permission denied" } });
    await expect(listTasks(forbidden.client, "board-1")).rejects.toMatchObject({ code: "forbidden" });

    const network = makeClient({ thrown: new TypeError("Failed to fetch") });
    await expect(listTasks(network.client, "board-1")).rejects.toMatchObject({ code: "network" });

    const unknown = makeClient({ error: { code: "XX000", message: "sensitive database internals" } });
    const error = await listTasks(unknown.client, "board-1").catch((caught) => caught);
    expect(error).toMatchObject({ code: "request_failed" });
    expect(error.message).not.toContain("sensitive database internals");
  });
});

describe("createTask", () => {
  it("validates and normalizes form fields, derives creator from auth, and sends only permitted columns", async () => {
    const returned = {
      ...ROW,
      title: "회의 준비",
      description: null,
      status: "todo",
      assignee_id: null,
      due_date: null,
      created_by: "authenticated-user",
    };
    const setup = makeCreateClient({ user: { id: "authenticated-user" }, data: returned });

    await expect(createTask(setup.client, " board-1 ", {
      title: "  회의 준비  ",
      description: "   ",
      status: "todo",
      dueDate: "",
      assigneeId: "",
      id: "forged-id",
      boardId: "other-board",
      createdBy: "attacker",
      createdAt: "forged-time",
      updatedAt: "forged-time",
    })).resolves.toEqual({
      id: "task-1",
      boardId: "board-1",
      title: "회의 준비",
      description: "",
      status: "todo",
      assigneeId: null,
      dueDate: null,
      createdBy: "authenticated-user",
      createdAt: returned.created_at,
      updatedAt: returned.updated_at,
    });

    expect(setup.getUser).toHaveBeenCalledOnce();
    expect(setup.calls.from).toHaveBeenCalledWith("tasks");
    expect(setup.calls.insert).toHaveBeenCalledWith({
      board_id: "board-1",
      title: "회의 준비",
      description: null,
      status: "todo",
      assignee_id: null,
      due_date: null,
      created_by: "authenticated-user",
    });
    expect(setup.calls.select).toHaveBeenCalledWith("id,board_id,title,description,status,assignee_id,due_date,created_by,created_at,updated_at");
    expect(setup.calls.single).toHaveBeenCalledOnce();
  });

  it("rejects invalid fields before authentication or database access and exposes field errors", async () => {
    const setup = makeCreateClient();
    const error = await createTask(setup.client, "board-1", {
      title: " ", status: "unknown", dueDate: "2025-02-29", assigneeId: " ",
    }).catch((caught) => caught);

    expect(error).toMatchObject({ code: "invalid_input", fieldErrors: {
      title: "업무 제목을 입력해 주세요.",
      status: "진행 상태를 확인해 주세요.",
      dueDate: "올바른 마감일을 선택해 주세요.",
      assigneeId: "담당자를 확인해 주세요.",
    } });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.calls.from).not.toHaveBeenCalled();
  });

  it("rejects invalid board IDs before authentication", async () => {
    const setup = makeCreateClient();
    await expect(createTask(setup.client, "  ", { title: "유효한 제목" }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.calls.from).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated inserts and maps database/network failures safely", async () => {
    const noUser = makeCreateClient({ user: null });
    await expect(createTask(noUser.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(noUser.calls.from).not.toHaveBeenCalled();

    const forbidden = makeCreateClient({ error: { code: "42501", message: "permission denied" } });
    await expect(createTask(forbidden.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "forbidden" });

    const network = makeCreateClient({ thrown: new TypeError("Failed to fetch") });
    await expect(createTask(network.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "network" });
  });

  it("rejects malformed, cross-board, or mismatched create responses", async () => {
    const wrongBoard = makeCreateClient({ data: { ...ROW, board_id: "board-2", title: "새 업무" } });
    await expect(createTask(wrongBoard.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });

    const wrongCreator = makeCreateClient({ data: { ...ROW, title: "새 업무", created_by: "another-user" } });
    await expect(createTask(wrongCreator.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });

    const mismatch = makeCreateClient({ data: { ...ROW, title: "다른 업무" } });
    await expect(createTask(mismatch.client, "board-1", { title: "새 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });
  });
});


describe("updateTask", () => {
  it("updates only editable fields within the requested task and board scope", async () => {
    const returned = {
      ...ROW,
      title: "회의 준비",
      description: null,
      status: "todo",
      assignee_id: null,
      due_date: null,
    };
    const setup = makeUpdateClient({ data: returned });

    await expect(updateTask(setup.client, " board-1 ", " task-1 ", {
      title: "  회의 준비  ",
      description: "   ",
      status: "todo",
      dueDate: "",
      assigneeId: "",
      id: "forged-id",
      boardId: "other-board",
      createdBy: "attacker",
      createdAt: "forged-time",
      updatedAt: "forged-time",
    })).resolves.toMatchObject({
      id: "task-1",
      boardId: "board-1",
      title: "회의 준비",
      description: "",
      status: "todo",
      assigneeId: null,
      dueDate: null,
    });

    expect(setup.getUser).toHaveBeenCalledOnce();
    expect(setup.calls.from).toHaveBeenCalledWith("tasks");
    expect(setup.calls.update).toHaveBeenCalledWith({
      title: "회의 준비",
      description: null,
      status: "todo",
      assignee_id: null,
      due_date: null,
    });
    expect(setup.calls.eq).toHaveBeenNthCalledWith(1, "id", "task-1");
    expect(setup.calls.eq).toHaveBeenNthCalledWith(2, "board_id", "board-1");
    expect(setup.calls.select).toHaveBeenCalledWith("id,board_id,title,description,status,assignee_id,due_date,created_by,created_at,updated_at");
    expect(setup.calls.single).toHaveBeenCalledOnce();
  });

  it("validates board, task, and editable fields before auth or database access", async () => {
    const setup = makeUpdateClient();
    const invalidInput = await updateTask(setup.client, "board-1", "task-1", {
      title: " ",
      status: "unknown",
      dueDate: "2025-02-29",
      assigneeId: " ",
    }).catch((error) => error);

    expect(invalidInput).toMatchObject({
      code: "invalid_input",
      fieldErrors: {
        title: "업무 제목을 입력해 주세요.",
        status: "진행 상태를 확인해 주세요.",
        dueDate: "올바른 마감일을 선택해 주세요.",
        assigneeId: "담당자를 확인해 주세요.",
      },
    });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.calls.from).not.toHaveBeenCalled();

    const invalidTask = makeUpdateClient();
    await expect(updateTask(invalidTask.client, "board-1", " ", { title: "유효한 제목" }))
      .rejects.toMatchObject({ code: "invalid_input" });
    expect(invalidTask.getUser).not.toHaveBeenCalled();
    expect(invalidTask.calls.from).not.toHaveBeenCalled();
  });

  it("blocks unauthenticated updates and maps permission and network failures safely", async () => {
    const noUser = makeUpdateClient({ user: null });
    await expect(updateTask(noUser.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "unauthenticated" });
    expect(noUser.calls.from).not.toHaveBeenCalled();

    const forbidden = makeUpdateClient({ error: { code: "42501", message: "permission denied" } });
    await expect(updateTask(forbidden.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "forbidden" });

    const network = makeUpdateClient({ thrown: new TypeError("Failed to fetch") });
    await expect(updateTask(network.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "network" });
  });

  it("rejects responses outside the requested task or board and mismatched fields", async () => {
    const wrongTask = makeUpdateClient({ data: { ...ROW, id: "task-2", title: "수정 업무" } });
    await expect(updateTask(wrongTask.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });

    const wrongBoard = makeUpdateClient({ data: { ...ROW, board_id: "board-2", title: "수정 업무" } });
    await expect(updateTask(wrongBoard.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });

    const mismatch = makeUpdateClient({ data: { ...ROW, title: "다른 업무" } });
    await expect(updateTask(mismatch.client, "board-1", "task-1", { title: "수정 업무" }))
      .rejects.toMatchObject({ code: "request_failed" });
  });
});

describe("updateTaskStatus", () => {
  it("updates only status within the requested task and board scope", async () => {
    const returned = { ...ROW, status: "done" };
    const setup = makeUpdateClient({ data: returned });

    await expect(updateTaskStatus(setup.client, "board-1", "task-1", "done"))
      .resolves.toMatchObject({ id: "task-1", boardId: "board-1", status: "done" });

    expect(setup.calls.update).toHaveBeenCalledWith({ status: "done" });
    expect(setup.calls.eq).toHaveBeenNthCalledWith(1, "id", "task-1");
    expect(setup.calls.eq).toHaveBeenNthCalledWith(2, "board_id", "board-1");
    expect(setup.getUser).toHaveBeenCalledOnce();
  });

  it("rejects an invalid status before authentication or database access", async () => {
    const setup = makeUpdateClient();
    await expect(updateTaskStatus(setup.client, "board-1", "task-1", "blocked"))
      .rejects.toMatchObject({
        code: "invalid_input",
        fieldErrors: { status: "진행 상태를 확인해 주세요." },
      });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.calls.from).not.toHaveBeenCalled();
  });

  it("rejects a mismatched status response", async () => {
    const setup = makeUpdateClient({ data: { ...ROW, status: "todo" } });
    await expect(updateTaskStatus(setup.client, "board-1", "task-1", "done"))
      .rejects.toMatchObject({ code: "request_failed" });
  });
});
