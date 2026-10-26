import { describe, expect, it, vi } from "vitest";
import { BoardRepositoryError } from "./board-repository.js";
import { createBoardManagementController } from "./board-management-controller.js";

function setup(repository = {}) {
  const defaults = {
    createBoard: vi.fn().mockResolvedValue("board-new"),
    renameBoard: vi.fn().mockResolvedValue("board-1"),
    deleteBoard: vi.fn().mockResolvedValue("board-1"),
    ...repository,
  };
  const refresh = vi.fn().mockResolvedValue(undefined);
  const render = vi.fn();
  const controller = createBoardManagementController({
    client: { id: "client" }, refresh, render, repository: defaults,
  });
  return { controller, defaults, refresh, render };
}

describe("createBoardManagementController", () => {
  it("creates through the repository, refreshes, and reports success", async () => {
    const { controller, defaults, refresh, render } = setup();
    await expect(controller.create("New board")).resolves.toBe(true);
    expect(defaults.createBoard).toHaveBeenCalledWith({ id: "client" }, "New board");
    expect(refresh).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith({
      busy: false, message: "공유 보드를 만들었습니다.", kind: "success",
    });
  });

  it("does not refresh or report success when a mutation fails", async () => {
    const { controller, refresh, render } = setup({
      renameBoard: vi.fn().mockRejectedValue(new BoardRepositoryError("forbidden")),
    });
    await expect(controller.rename("board-1", "New name")).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith({
      busy: false, message: "보드 작업을 수행할 권한이 없습니다.", kind: "error",
    });
  });

  it("prevents a second simultaneous write", async () => {
    let resolveCreate;
    const create = vi.fn(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const { controller, defaults, refresh } = setup({ createBoard: create });
    const first = controller.create("Board");
    await expect(controller.delete("board-1")).resolves.toBe(false);
    expect(defaults.deleteBoard).not.toHaveBeenCalled();
    resolveCreate("board-new");
    await expect(first).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the completed write successful when list refresh fails", async () => {
    const { controller, refresh, render } = setup();
    refresh.mockRejectedValueOnce(new Error("private detail"));
    await expect(controller.create("Board")).resolves.toBe(true);
    expect(render).toHaveBeenLastCalledWith({
      busy: false,
      message: "공유 보드를 만들었습니다. 목록을 다시 불러오지 못했습니다. 목록의 다시 시도를 눌러 주세요.",
      kind: "success",
    });
    expect(JSON.stringify(render.mock.calls)).not.toContain("private detail");
  });

  it("maps unexpected errors to a safe generic message", async () => {
    const { controller, render } = setup({ deleteBoard: vi.fn().mockRejectedValue(new Error("secret")) });
    await expect(controller.delete("board-1")).resolves.toBe(false);
    expect(render).toHaveBeenLastCalledWith({
      busy: false,
      message: "보드 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      kind: "error",
    });
  });
});
