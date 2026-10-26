import { describe, expect, it, vi } from "vitest";
import { BoardRepositoryError } from "./board-repository.js";
import { createBoardMemberController } from "./board-member-controller.js";

const OWNER_ID = "owner-1";
const MEMBER_ID = "member-1";
const MEMBERS = [
  { userId: OWNER_ID, displayName: "Owner", role: "owner" },
  { userId: MEMBER_ID, displayName: "Member", role: "member" },
];

function setup({ currentUserId = OWNER_ID, members = MEMBERS, repository = {}, onBoardLeft = vi.fn() } = {}) {
  const repo = {
    listBoardMembers: vi.fn().mockResolvedValue(members),
    removeBoardMember: vi.fn().mockResolvedValue(MEMBER_ID),
    leaveBoard: vi.fn().mockResolvedValue("board-1"),
    ...repository,
  };
  const render = vi.fn();
  const controller = createBoardMemberController({
    client: { id: "client" },
    boardId: "board-1",
    currentUserId,
    render,
    onBoardLeft,
    repository: repo,
  });
  return { controller, repo, render, onBoardLeft };
}

describe("createBoardMemberController", () => {
  it("loads the roster and ignores duplicate in-flight reads", async () => {
    let resolveRoster;
    const listBoardMembers = vi.fn(() => new Promise((resolve) => { resolveRoster = resolve; }));
    const { controller, repo, render } = setup({ repository: { listBoardMembers } });
    const first = controller.load();
    const second = controller.load();
    expect(repo.listBoardMembers).toHaveBeenCalledOnce();
    resolveRoster(MEMBERS);
    await expect(first).resolves.toMatchObject({ status: "success" });
    await expect(second).resolves.toMatchObject({ status: "success" });
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ status: "success", members: MEMBERS }));
  });

  it("lets an owner remove a regular member and refreshes the roster", async () => {
    const refreshed = [MEMBERS[0]];
    const { controller, repo, render } = setup({ repository: {
      listBoardMembers: vi.fn().mockResolvedValueOnce(MEMBERS).mockResolvedValueOnce(refreshed),
    } });
    await controller.load();
    await expect(controller.removeMember(MEMBER_ID)).resolves.toBe(true);
    expect(repo.removeBoardMember).toHaveBeenCalledWith({ id: "client" }, "board-1", MEMBER_ID);
    expect(repo.listBoardMembers).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({ status: "success", members: refreshed, kind: "success" });
    expect(render).toHaveBeenLastCalledWith(expect.objectContaining({ members: refreshed }));
  });

  it("does not call the removal RPC for the owner or a non-owner viewer", async () => {
    const owner = setup();
    await owner.controller.load();
    await expect(owner.controller.removeMember(OWNER_ID)).resolves.toBe(false);
    expect(owner.repo.removeBoardMember).not.toHaveBeenCalled();

    const member = setup({ currentUserId: MEMBER_ID });
    await member.controller.load();
    await expect(member.controller.removeMember(OWNER_ID)).resolves.toBe(false);
    await expect(member.controller.removeMember(MEMBER_ID)).resolves.toBe(false);
    expect(member.repo.removeBoardMember).not.toHaveBeenCalled();
    expect(member.controller.getState().message).toBe("이 작업을 수행할 권한이 없습니다.");
  });

  it("allows a regular member to leave and invokes the board-list callback", async () => {
    const onBoardLeft = vi.fn().mockResolvedValue(undefined);
    const setupState = setup({ currentUserId: MEMBER_ID, onBoardLeft });
    await setupState.controller.load();
    await expect(setupState.controller.leave()).resolves.toBe(true);
    expect(setupState.repo.leaveBoard).toHaveBeenCalledWith({ id: "client" }, "board-1");
    expect(onBoardLeft).toHaveBeenCalledOnce();
  });

  it("prevents the owner from leaving and keeps the owner protected", async () => {
    const { controller, repo } = setup();
    await controller.load();
    await expect(controller.leave()).resolves.toBe(false);
    expect(repo.leaveBoard).not.toHaveBeenCalled();
  });

  it("maps RPC failures safely and does not expose raw error details", async () => {
    const { controller } = setup({ repository: {
      removeBoardMember: vi.fn().mockRejectedValue(new BoardRepositoryError("forbidden")),
    } });
    await controller.load();
    await expect(controller.removeMember(MEMBER_ID)).resolves.toBe(false);
    expect(controller.getState()).toMatchObject({
      busyUserId: null,
      kind: "error",
      message: "보드 작업을 수행할 권한이 없습니다.",
    });

    const unexpected = setup({ repository: {
      removeBoardMember: vi.fn().mockRejectedValue(new Error("private db output")),
    } });
    await unexpected.controller.load();
    await unexpected.controller.removeMember(MEMBER_ID);
    expect(unexpected.controller.getState().message).not.toContain("private db output");
  });

  it("discards a late roster response after disposal", async () => {
    let resolveRoster;
    const { controller, render } = setup({ repository: {
      listBoardMembers: vi.fn(() => new Promise((resolve) => { resolveRoster = resolve; })),
    } });
    const pending = controller.load();
    controller.dispose();
    resolveRoster(MEMBERS);
    await expect(pending).resolves.toMatchObject({ status: "stale" });
    expect(render).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("loading");
  });
});
