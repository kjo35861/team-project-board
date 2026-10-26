import { BoardRepositoryError } from "./board-repository.js";
import { acceptBoardInvite } from "./member-repository.js";

const GENERIC_ERROR = "초대를 수락하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";

function messageFor(error) {
  if (error instanceof BoardRepositoryError) {
    if (error.code === "invalid_input") return "초대 링크가 잘못되었거나 형식이 올바르지 않습니다.";
    if (error.code === "invite_unavailable") return "초대 링크가 만료되었거나 취소 또는 이미 사용되었습니다. 보드 소유자에게 새 링크를 요청해 주세요.";
    return error.message;
  }
  return GENERIC_ERROR;
}

/** Accept the pending one-time invite only after an authenticated app session. */
export function createInviteAcceptanceController({
  client,
  token,
  render = () => {},
  repository = acceptBoardInvite,
  onAccepted = async () => {},
  onFinished = () => {},
  clearToken = () => {},
}) {
  let state = { status: "ready", busy: false, message: "", kind: "info" };
  let disposed = false;
  let completed = false;
  function getState() { return { ...state }; }
  function publish(next) {
    state = next;
    if (!disposed) render(getState());
  }

  async function accept() {
    if (disposed || state.busy || state.status === "success") return false;
    publish({ ...state, busy: true, message: "초대를 확인하고 보드에 참여하는 중…", kind: "info" });
    let boardId;
    try {
      boardId = await repository(client, token);
    } catch (error) {
      if (!disposed) publish({ status: "error", busy: false, message: messageFor(error), kind: "error" });
      return false;
    }
    if (disposed) return true;
    // Clear the bearer token immediately after successful RPC, before any
    // list-refresh callback or UI update can fail.
    clearToken();
    completed = true;
    publish({ status: "success", busy: true, message: "보드에 참여했습니다. 보드 목록을 새로 불러오는 중…", kind: "success" });
    try {
      await onAccepted(boardId);
      if (disposed) return true;
      publish({ status: "success", busy: false, message: "보드에 참여했습니다. 보드가 공유 목록에 표시됩니다.", kind: "success" });
      onFinished();
      return true;
    } catch {
      if (!disposed) publish({ status: "success", busy: false, message: "초대는 수락했지만 보드 목록을 새로 불러오지 못했습니다. 공유 보드 목록에서 다시 시도해 주세요.", kind: "warning" });
      onFinished();
      return true;
    }
  }

  return {
    accept,
    getState,
    dispose() {
      disposed = true;
      if (!completed) clearToken();
    },
  };
}
