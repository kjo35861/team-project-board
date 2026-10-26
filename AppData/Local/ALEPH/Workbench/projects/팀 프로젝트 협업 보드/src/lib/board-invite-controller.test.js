import { describe, expect, it, vi } from "vitest";
import { BoardRepositoryError } from "./board-repository.js";
import { createBoardInviteController } from "./board-invite-controller.js";

const PENDING = {
  inviteId: "invite-1",
  createdAt: "2026-07-08T12:00:00.000Z",
  expiresAt: "2026-07-15T12:00:00.000Z",
  acceptedAt: null,
  acceptedBy: null,
  canceledAt: null,
  status: "pending",
};
const TOKEN = "a".repeat(128);

function setup({ repository = {}, render = vi.fn() } = {}) {
  const repo = {
    listBoardInvites: vi.fn().mockResolvedValue([PENDING]),
    createBoardInvite: vi.fn().mockResolvedValue({ inviteId: "invite-new", token: TOKEN, expiresAt: PENDING.expiresAt }),
    cancelBoardInvite: vi.fn().mockResolvedValue("invite-1"),
    ...repository,
  };
  const controller = createBoardInviteController({
    client: { id: "client" }, boardId: "board-1", render, repository: repo,
    origin: "https://teamboard.example",
  });
  return { controller, repo, render };
}

describe("createBoardInviteController", () => {
  it("loads safe invitation metadata and discards late responses after disposal", async () => {
    const { controller, repo, render } = setup();
    await expect(controller.load()).resolves.toMatchObject({ status: "success" });
    expect(repo.listBoardInvites).toHaveBeenCalledWith({ id: "client" }, "board-1");
    expect(controller.getState().invitations).toEqual([PENDING]);
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ status: "success" }));

    let resolve;
    repo.listBoardInvites.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = controller.retry();
    controller.dispose();
    resolve([PENDING]);
    await expect(pending).resolves.toEqual({ status: "stale" });
  });

  it("creates a share URL from the one-time token without retaining the raw token separately", async () => {
    const { controller, repo } = setup();
    await controller.load();
    await expect(controller.create()).resolves.toBe(true);
    expect(repo.createBoardInvite).toHaveBeenCalledWith({ id: "client" }, "board-1");
    expect(controller.getState().shareUrl).toBe(`https://teamboard.example/?invite=${TOKEN}`);
    expect(controller.getState().message).toContain("7일");
    expect(controller.getState().invitations).toEqual([PENDING]);
  });

  it("cancels only a pending invitation and refreshes the list", async () => {
    const canceled = { ...PENDING, canceledAt: "2026-07-08T13:00:00.000Z", status: "canceled" };
    const { controller, repo } = setup({ repository: {
      listBoardInvites: vi.fn().mockResolvedValueOnce([PENDING]).mockResolvedValueOnce([canceled]),
    } });
    await controller.load();
    await expect(controller.cancel("invite-1")).resolves.toBe(true);
    expect(repo.cancelBoardInvite).toHaveBeenCalledWith({ id: "client" }, "invite-1");
    expect(controller.getState()).toMatchObject({ invitations: [canceled], kind: "success", busy: false });

    const { controller: staleController, repo: staleRepo } = setup();
    await staleController.load();
    await expect(staleController.cancel("missing")).resolves.toBe(false);
    expect(staleRepo.cancelBoardInvite).not.toHaveBeenCalled();
  });

  it("blocks duplicate writes and turns unsafe failures into generic messages", async () => {
    let resolveCreate;
    const { controller, repo } = setup({ repository: {
      createBoardInvite: vi.fn(() => new Promise((resolve) => { resolveCreate = resolve; })),
    } });
    const first = controller.create();
    await expect(controller.create()).resolves.toBe(false);
    resolveCreate({ inviteId: "invite-new", token: TOKEN, expiresAt: PENDING.expiresAt });
    await expect(first).resolves.toBe(true);
    expect(repo.createBoardInvite).toHaveBeenCalledOnce();

    const failed = setup({ repository: {
      createBoardInvite: vi.fn().mockRejectedValue(new Error("private database output")),
    } });
    await expect(failed.controller.create()).resolves.toBe(false);
    expect(failed.controller.getState().message).not.toContain("private database output");

    const forbidden = setup({ repository: {
      cancelBoardInvite: vi.fn().mockRejectedValue(new BoardRepositoryError("forbidden")),
    } });
    await forbidden.controller.load();
    await expect(forbidden.controller.cancel("invite-1")).resolves.toBe(false);
    expect(forbidden.controller.getState().message).toBe("보드 작업을 수행할 권한이 없습니다.");
  });

  it("clears the link from state when the panel is disposed", async () => {
    const { controller } = setup();
    await controller.create();
    expect(controller.getState().shareUrl).toContain(TOKEN);
    controller.dispose();
    expect(controller.getState().shareUrl).toBe("");
  });
});
