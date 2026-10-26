import { BoardRepositoryError } from "./board-repository.js";
import {
  leaveBoard,
  listBoardMembers,
  removeBoardMember,
} from "./member-repository.js";

const GENERIC_ERROR = "구성원 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const FORBIDDEN_MESSAGE = "이 작업을 수행할 권한이 없습니다.";

function safeMessage(error) {
  return error instanceof BoardRepositoryError ? error.message : GENERIC_ERROR;
}

/** Coordinate the roster UI; database RPCs remain the final authorization boundary. */
export function createBoardMemberController({
  client,
  boardId,
  currentUserId,
  render = () => {},
  onBoardLeft = async () => {},
  repository = { listBoardMembers, removeBoardMember, leaveBoard },
}) {
  let state = {
    status: "idle",
    members: [],
    message: "",
    kind: "info",
    busyUserId: null,
    leaving: false,
  };
  let disposed = false;
  let requestVersion = 0;
  let pendingLoad = null;

  function publish(next) {
    state = next;
    if (!disposed) render(getState());
  }

  function getState() {
    return { ...state, members: state.members.map((member) => ({ ...member })) };
  }

  async function load(force = false) {
    if (disposed) return { status: "disposed" };
    if (pendingLoad && !force) return pendingLoad;
    const version = ++requestVersion;
    publish({ ...state, status: "loading", message: "", kind: "info" });

    const request = (async () => {
      try {
        const members = await repository.listBoardMembers(client, boardId);
        if (disposed || version !== requestVersion) return { status: "stale" };
        publish({ ...state, status: "success", members, message: "", kind: "info" });
        return { status: "success", members };
      } catch (error) {
        if (disposed || version !== requestVersion) return { status: "stale" };
        publish({ ...state, status: "error", message: safeMessage(error), kind: "error" });
        return { status: "error" };
      } finally {
        if (version === requestVersion) pendingLoad = null;
      }
    })();

    pendingLoad = request;
    return request;
  }

  async function removeMember(userId) {
    if (disposed || state.status !== "success" || state.busyUserId || state.leaving) return false;
    const viewer = state.members.find((member) => member.userId === currentUserId);
    const target = state.members.find((member) => member.userId === userId);
    if (viewer?.role !== "owner" || !target || target.role !== "member" || userId === currentUserId) {
      publish({ ...state, message: FORBIDDEN_MESSAGE, kind: "error" });
      return false;
    }

    publish({ ...state, busyUserId: userId, message: "", kind: "info" });
    try {
      await repository.removeBoardMember(client, boardId, userId);
    } catch (error) {
      if (!disposed) publish({ ...state, busyUserId: null, message: safeMessage(error), kind: "error" });
      return false;
    }

    if (disposed) return true;
    const refreshed = await load(true);
    if (disposed) return true;
    publish({
      ...state,
      busyUserId: null,
      message: refreshed.status === "error"
        ? "구성원을 제거했지만 목록을 새로 불러오지 못했습니다. 다시 시도해 주세요."
        : "구성원을 보드에서 제거했습니다.",
      kind: refreshed.status === "error" ? "error" : "success",
    });
    return true;
  }

  async function leave() {
    if (disposed || state.status !== "success" || state.busyUserId || state.leaving) return false;
    const viewer = state.members.find((member) => member.userId === currentUserId);
    if (viewer?.role !== "member") {
      publish({ ...state, message: FORBIDDEN_MESSAGE, kind: "error" });
      return false;
    }

    publish({ ...state, leaving: true, message: "", kind: "info" });
    try {
      await repository.leaveBoard(client, boardId);
    } catch (error) {
      if (!disposed) publish({ ...state, leaving: false, message: safeMessage(error), kind: "error" });
      return false;
    }

    if (disposed) return true;
    publish({ ...state, leaving: false, message: "보드에서 나왔습니다.", kind: "success" });
    try {
      await onBoardLeft();
    } catch {
      if (!disposed) {
        publish({
          ...state,
          message: "보드에서 나왔지만 보드 목록을 갱신하지 못했습니다. 목록을 다시 불러와 주세요.",
          kind: "error",
        });
      }
    }
    return true;
  }

  return {
    load: () => load(false),
    retry: () => load(true),
    removeMember,
    leave,
    getState,
    dispose() {
      disposed = true;
      requestVersion += 1;
      pendingLoad = null;
    },
  };
}
