import { describe, it, expect, vi } from "vitest";
import { updateTask, updateTaskStatus, deleteTask } from "./task-repository.js";
const row = { id: "t", board_id: "b", title: "Title", description: null, status: "done", assignee_id: null, due_date: null, created_by: "other", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" };
function setup({ data = row, error = null, user = { id: "u" }, thrown } = {}) {
  const builder = {};
  for (const method of ["update", "delete", "eq", "select"]) builder[method] = vi.fn(() => builder);
  builder.single = vi.fn(() => thrown ? Promise.reject(thrown) : Promise.resolve({ data, error }));
  const client = { auth: { getUser: vi.fn(async () => ({ data: { user } })) }, from: vi.fn(() => builder) };
  return { client, builder };
}
describe("task mutations", () => {
  it("scopes updates to both board and task, strips forged management fields", async () => {
    const { client, builder } = setup();
    await expect(updateTask(client, " b ", " t ", { title: " Title ", status: "done", id: "forged", board_id: "other", created_by: "forged", createdAt: "forged" })).resolves.toMatchObject({ id: "t", createdBy: "other" });
    expect(builder.update).toHaveBeenCalledWith({ title: "Title", description: null, status: "done", assignee_id: null, due_date: null });
    expect(builder.eq.mock.calls).toEqual([["board_id", "b"], ["id", "t"]]);
  });
  it("status changes send only status and deletion requires a returned matching row", async () => {
    const { client, builder } = setup();
    await updateTaskStatus(client, "b", "t", "done");
    expect(builder.update).toHaveBeenCalledWith({ status: "done" });
    await expect(deleteTask(client, "b", "t")).resolves.toBe("t");
    expect(builder.delete).toHaveBeenCalledOnce();
  });
  for (const operation of [
    c => updateTask(c, "b", "t", { title: "Title", status: "done" }),
    c => updateTaskStatus(c, "b", "t", "done"),
    c => deleteTask(c, "b", "t"),
  ]) {
    it("rejects unauthenticated, denied, missing, mismatched and network responses", async () => {
      for (const [options, code] of [
        [{ user: null }, "unauthenticated"], [{ error: { code: "42501" } }, "forbidden"],
        [{ thrown: new TypeError("fetch failed") }, "network"], [{ data: null }, "request_failed"],
        [{ data: { ...row, id: "wrong" } }, "request_failed"],
        [{ data: { ...row, board_id: "wrong" } }, "request_failed"],
      ]) {
        const { client } = setup(options);
        await expect(operation(client)).rejects.toMatchObject({ code });
        if (options.user === null) expect(client.from).not.toHaveBeenCalled();
      }
    });
  }
  it("validates before sending and rejects a nonmatching update response", async () => {
    const { client } = setup();
    await expect(updateTask(client, "b", "t", { title: "" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(updateTaskStatus(client, "b", "t", "bad")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(deleteTask(client, "", "t")).rejects.toMatchObject({ code: "invalid_input" });
    expect(client.from).not.toHaveBeenCalled();
    await expect(updateTaskStatus(setup({ data: { ...row, status: "todo" } }).client, "b", "t", "done")).rejects.toMatchObject({ code: "request_failed" });
    await expect(updateTask(client, "b", "t", { title: "Different" })).rejects.toMatchObject({ code: "request_failed" });
  });
});
