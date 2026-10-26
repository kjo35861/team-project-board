import { describe, expect, it, vi } from "vitest";
import { createBoardListController } from "./board-list-controller.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("createBoardListController", () => {
  it("shows loading then success with boards", async () => {
    const request = deferred();
    const render = vi.fn();
    const repository = vi.fn(() => request.promise);
    const controller = createBoardListController({ client: {}, render, repository });

    const loading = controller.load();
    expect(render).toHaveBeenNthCalledWith(1, { status: "loading", boards: [] });
    expect(repository).toHaveBeenCalledOnce();
    request.resolve([{ id: "board-1", name: "공유 보드" }]);
    await loading;
    expect(render).toHaveBeenLastCalledWith({
      status: "success",
      boards: [{ id: "board-1", name: "공유 보드" }],
    });
  });

  it("shows an empty state for an empty result", async () => {
    const render = vi.fn();
    const controller = createBoardListController({
      client: {}, render, repository: vi.fn().mockResolvedValue([]),
    });
    await controller.load();
    expect(render).toHaveBeenLastCalledWith({ status: "empty", boards: [] });
  });

  it("hides raw request errors and can retry after failure", async () => {
    const render = vi.fn();
    const repository = vi.fn()
      .mockRejectedValueOnce(new Error("sensitive database details"))
      .mockResolvedValueOnce([{ id: "board-2", name: "다시 불러온 보드" }]);
    const controller = createBoardListController({ client: {}, render, repository });

    const failed = await controller.load();
    expect(failed.status).toBe("error");
    expect(render).toHaveBeenLastCalledWith({ status: "error", boards: [] });
    expect(JSON.stringify(render.mock.calls)).not.toContain("sensitive database details");
    const retried = await controller.retry();
    expect(retried.status).toBe("success");
    expect(repository).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenLastCalledWith({
      status: "success",
      boards: [{ id: "board-2", name: "다시 불러온 보드" }],
    });
  });

  it("deduplicates concurrent requests", async () => {
    const request = deferred();
    const repository = vi.fn(() => request.promise);
    const render = vi.fn();
    const controller = createBoardListController({ client: {}, render, repository });

    const first = controller.load();
    const second = controller.retry();
    expect(repository).toHaveBeenCalledOnce();
    request.resolve([]);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual({ status: "empty", boards: [] });
    expect(secondResult).toEqual(firstResult);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("lets a forced refresh supersede an in-flight snapshot", async () => {
    const oldRequest = deferred();
    const newRequest = deferred();
    const repository = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    const render = vi.fn();
    const controller = createBoardListController({ client: {}, render, repository });

    const oldLoad = controller.load();
    const refresh = controller.refresh();
    expect(repository).toHaveBeenCalledTimes(2);
    newRequest.resolve([{ id: "new", name: "최신 보드" }]);
    await expect(refresh).resolves.toMatchObject({ status: "success" });
    oldRequest.resolve([{ id: "old", name: "오래된 응답" }]);
    await expect(oldLoad).resolves.toMatchObject({ status: "stale" });
    expect(render).toHaveBeenLastCalledWith({
      status: "success", boards: [{ id: "new", name: "최신 보드" }],
    });
  });

  it("ignores completion after disposal", async () => {
    const request = deferred();
    const render = vi.fn();
    const controller = createBoardListController({
      client: {}, render, repository: vi.fn(() => request.promise),
    });
    const loading = controller.load();
    controller.dispose();
    request.resolve([{ id: "board-3", name: "사용자 데이터" }]);
    await expect(loading).resolves.toMatchObject({ status: "stale" });
    expect(render).toHaveBeenCalledTimes(1);
    await expect(controller.load()).resolves.toEqual({ status: "disposed" });
    expect(render).toHaveBeenCalledTimes(1);
  });
});
