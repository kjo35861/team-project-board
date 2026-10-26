import { BoardRepositoryError } from "./board-repository.js";
import { cancelBoardInvite, createBoardInvite, listBoardInvites } from "./member-repository.js";

const GENERIC_ERROR = "초대 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";
const STATUS_VALUES = new Set(["pending", "accepted", "canceled", "expired"]);

function safeMessage(error) {
  return error instanceof BoardRepositoryError ? error.message : GENERIC_ERROR;
}

function makeInviteUrl(token, origin) {
  const base = typeof origin === "string" && origin ? origin : "http://localhost";
  const url = new URL("/", base);
  url.searchParams.set("invite", token);
  return url.toString();
}

/** Manage owner-only invitation metadata and one-time share links for one board. */
export function createBoardInviteController({
  client,
  boardId,
  render = () => {},
  repository = { listBoardInvites, createBoardInvite, cancelBoardInvite },
  origin = globalThis.location?.origin,
}) {
  let state = {
    status: "idle",
    invitations: [],
    busy: false,
    shareUrl: "",
    message: "",
    kind: "info",
  };
  let disposed = false;
  let requestVersion = 0;
  let pendingLoad = null;

  function getState() {
    return { ...state, invitations: state.invitations.map((invite) => ({ ...invite })) };
  }

  function publish(next) {
    state = next;
    if (!disposed) render(getState());
  }

  async function load(force = false) {
    if (disposed) return { status: "disposed" };
    if (pendingLoad && !force) return pendingLoad;
    const version = ++requestVersion;
    publish({ ...state, status: "loading", message: "", kind: "info" });

    const request = (async () => {
      try {
        const invitations = await repository.listBoardInvites(client, boardId);
        if (disposed || version !== requestVersion) return { status: "stale" };
        if (!Array.isArray(invitations) || invitations.some((invite) => !STATUS_VALUES.has(invite?.status))) {
          throw new BoardRepositoryError("request_failed");
        }
        publish({ ...state, status: "success", invitations, message: "", kind: "info" });
        return { status: "success", invitations };
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

  async function create() {
    if (disposed || state.busy) return false;
    publish({ ...state, busy: true, message: "", kind: "info" });
    try {
      const invitation = await repository.createBoardInvite(client, boardId);
      if (disposed) return false;
      const shareUrl = makeInviteUrl(invitation.token, origin);
      publish({ ...state, busy: false, shareUrl, message: "초대 링크를 만들었습니다. 링크는 7일 동안 유효하며 한 번만 사용할 수 있습니다.", kind: "success" });
      const refreshed = await load(true);
      if (disposed) return true;
      publish({
        ...state,
        busy: false,
        shareUrl,
        message: refreshed.status === "error"
          ? "초대 링크는 만들었지만 초대 목록을 새로 불러오지 못했습니다. 링크를 안전하게 전달하고 목록을 다시 시도해 주세요."
          : "초대 링크를 만들었습니다. 링크는 7일 동안 유효하며 한 번만 사용할 수 있습니다.",
        kind: refreshed.status === "error" ? "error" : "success",
      });
      return true;
    } catch (error) {
      if (!disposed) publish({ ...state, busy: false, message: safeMessage(error), kind: "error" });
      return false;
    }
  }

  async function cancel(inviteId) {
    if (disposed || state.busy) return false;
    const invitation = state.invitations.find((item) => item.inviteId === inviteId);
    if (!invitation || invitation.status !== "pending") {
      publish({ ...state, message: "취소할 수 있는 대기 중 초대를 찾지 못했습니다. 목록을 새로고침해 주세요.", kind: "error" });
      return false;
    }
    publish({ ...state, busy: true, message: "", kind: "info" });
    try {
      await repository.cancelBoardInvite(client, inviteId);
    } catch (error) {
      if (!disposed) publish({ ...state, busy: false, message: safeMessage(error), kind: "error" });
      return false;
    }
    if (disposed) return true;
    const refreshed = await load(true);
    if (disposed) return true;
    publish({
      ...state,
      busy: false,
      message: refreshed.status === "error"
        ? "초대를 취소했지만 목록을 새로 불러오지 못했습니다. 다시 시도해 주세요."
        : "초대를 취소했습니다. 기존 링크는 더 이상 사용할 수 없습니다.",
      kind: refreshed.status === "error" ? "error" : "success",
    });
    return true;
  }

  return {
    load: () => load(false),
    retry: () => load(true),
    create,
    cancel,
    getState,
    dispose() {
      disposed = true;
      requestVersion += 1;
      pendingLoad = null;
      // Do not keep the one-time bearer link in controller state after unmount.
      state = { ...state, shareUrl: "" };
    },
  };
}
