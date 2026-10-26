import { describe, expect, it, vi } from "vitest";
import { BoardRepositoryError } from "./board-repository.js";
import { createInviteAcceptanceController } from "./board-invite-acceptance-controller.js";

const TOKEN = "c".repeat(128);

function setup(options = {}) {
  const render = vi.fn();
  const onAccepted = vi.fn().mockResolvedValue(undefined);
  const onFinished = vi.fn();
  const repository = vi.fn().mockResolvedValue("board-1");
  const controller = createInviteAcceptanceController({
    client: { id: "client" }, token: TOKEN, render, repository, onAccepted, onFinished,
    ...options,
  });
  return { controller, render, onAccepted, onFinished, repository };
}

describe("createInviteAcceptanceController", () => {
  it("accepts once through RPC and refreshes the board list", async () => {
    const { controller, render, onAccepted, onFinished, repository } = setup();
    await expect(controller.accept()).resolves.toBe(true);
    expect(repository).toHaveBeenCalledWith({ id: "client" }, TOKEN);
    expect(onAccepted).toHaveBeenCalledWith("board-1");
    expect(onFinished).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({ status: "success", busy: false, kind: "success" });
    await expect(controller.accept()).resolves.toBe(false);
    expect(repository).toHaveBeenCalledOnce();
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ status: "success" }));
  });

  it("explains expired/canceled/reused invite failures without exposing raw errors", async () => {
    const { controller } = setup({
      repository: vi.fn().mockRejectedValue(new BoardRepositoryError("invite_unavailable")),
    });
    await expect(controller.accept()).resolves.toBe(false);
    expect(controller.getState()).toMatchObject({
      status: "error",
      kind: "error",
      message: "초대 링크가 만료되었거나 취소 또는 이미 사용되었습니다. 보드 소유자에게 새 링크를 요청해 주세요.",
    });

    const unknown = setup({ repository: vi.fn().mockRejectedValue(new Error("private database details")) });
    await unknown.controller.accept();
    expect(unknown.controller.getState().message).not.toContain("private database details");
  });

  it("does not claim that a failed list refresh undid a successful acceptance", async () => {
    const { controller, onFinished } = setup({ onAccepted: vi.fn().mockRejectedValue(new Error("offline")) });
    await expect(controller.accept()).resolves.toBe(true);
    expect(controller.getState()).toMatchObject({
      status: "success",
      kind: "warning",
      message: "초대는 수락했지만 보드 목록을 새로 불러오지 못했습니다. 공유 보드 목록에서 다시 시도해 주세요.",
    });
    expect(onFinished).toHaveBeenCalledOnce();
  });
});
