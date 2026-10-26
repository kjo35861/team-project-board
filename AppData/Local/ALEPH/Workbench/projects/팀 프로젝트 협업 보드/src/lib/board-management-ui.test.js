import { afterEach, describe, expect, it, vi } from "vitest";
import { mountBoardManagementUI } from "./board-management-ui.js";

const BOARD_A = { id: "board-a", name: "Alpha", owner_id: "user-a" };
const BOARD_B = { id: "board-b", name: "Beta", owner_id: "user-b" };

function setup({ boards = [BOARD_A, BOARD_B], repository = {} } = {}) {
  document.body.innerHTML = '<div id="root"></div>';
  const root = document.querySelector("#root");
  const selected = vi.fn();
  const repos = {
    listBoards: vi.fn().mockResolvedValue(boards),
    createBoard: vi.fn().mockResolvedValue("board-new"),
    renameBoard: vi.fn().mockResolvedValue(BOARD_A.id),
    deleteBoard: vi.fn().mockResolvedValue(BOARD_A.id),
    listBoardMembers: vi.fn().mockResolvedValue([
      { userId: "user-a", displayName: "Owner", role: "owner" },
      { userId: "user-b", displayName: "Member", role: "member" },
    ]),
    listBoardInvites: vi.fn().mockResolvedValue([]),
    ...repository,
  };
  const ui = mountBoardManagementUI({
    client: { id: "client" }, userId: "user-a", root, repository: repos,
    onBoardSelected: selected,
  });
  return { root, selected, repos, ui };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mountBoardManagementUI", () => {
  it("shows loading then selects the first available board and supports board switching", async () => {
    const { root, selected, ui } = setup();
    expect(root.textContent).toContain("공유 보드를 불러오는 중");
    await settle();
    expect(root.textContent).toContain("Alpha");
    expect(root.querySelector('[aria-current="true"]')?.textContent).toBe("Alpha");
    expect(selected).toHaveBeenCalledWith({ id: BOARD_A.id, name: BOARD_A.name, owner_id: BOARD_A.owner_id });
    expect(ui.selectBoard(BOARD_B.id)).toBe(true);
    expect(selected).toHaveBeenLastCalledWith({ id: BOARD_B.id, name: BOARD_B.name, owner_id: BOARD_B.owner_id });
    expect(root.querySelector('[aria-current="true"]')?.textContent).toBe("Beta");
    ui.dispose();
  });

  it("shows a safe retry state and clears selection when the list becomes empty", async () => {
    const { root, repos, ui } = setup({ repository: { listBoards: vi.fn().mockRejectedValueOnce(new Error("private output")).mockResolvedValueOnce([]) } });
    await settle();
    expect(root.textContent).toContain("공유 보드 목록을 불러오지 못했습니다");
    expect(root.textContent).not.toContain("private output");
    root.querySelector(".shared-board-retry").click();
    await settle();
    expect(repos.listBoards).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain("아직 참여 중인 공유 보드가 없습니다");
    expect(ui.selectBoard(BOARD_A.id)).toBe(false);
    ui.dispose();
  });

  it("mounts member and owner invite controls only in the expanded board panel", async () => {
    const { root, repos, ui } = setup();
    await settle();
    root.querySelector(".shared-board-action").click();
    await settle();
    expect(root.textContent).toContain("구성원");
    expect(root.textContent).toContain("초대 링크");
    expect(repos.listBoardMembers).toHaveBeenCalledWith({ id: "client" }, BOARD_A.id);
    expect(repos.listBoardInvites).toHaveBeenCalledWith({ id: "client" }, BOARD_A.id);
    ui.selectBoard(BOARD_B.id);
    root.querySelector(".shared-board-action").click();
    await settle();
    expect(root.textContent).toContain("구성원");
    expect(root.textContent).not.toContain("초대 링크 만들기");
    ui.dispose();
  });

  it("does not select a removed board after a server refresh", async () => {
    const selected = vi.fn();
    let currentBoards = [BOARD_A];
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.querySelector("#root");
    const ui = mountBoardManagementUI({
      client: { id: "client" }, userId: "user-a", root, onBoardSelected: selected,
      repository: { listBoards: vi.fn(async () => currentBoards) },
    });
    await settle();
    currentBoards = [];
    await ui.reload();
    expect(root.textContent).toContain("아직 참여 중인 공유 보드가 없습니다");
    expect(root.querySelector(".shared-board-name")).toBeNull();
    ui.dispose();
  });
});
