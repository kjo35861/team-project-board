import { createInviteAcceptanceController } from "./board-invite-acceptance-controller.js";
import { clearPendingInvite } from "./invite-link-session.js";

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Show a safe invite handoff panel; token material is never rendered as text. */
export function mountInviteAcceptanceUI({
  client,
  token,
  captureStatus = "captured",
  root,
  onAccepted,
  onFinished = () => {},
  storage = globalThis.sessionStorage,
}) {
  if (!root) throw new TypeError("An invite-acceptance UI root is required.");
  const panel = element("section", "invite-acceptance-panel");
  panel.setAttribute("aria-labelledby", "invite-acceptance-title");
  const heading = element("h2", "invite-acceptance-title", "보드 초대");
  heading.id = "invite-acceptance-title";
  const description = element("p", "invite-acceptance-description");
  const message = element("p", "invite-acceptance-message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const actions = element("div", "invite-acceptance-actions");
  const acceptButton = element("button", "invite-acceptance-accept", "초대 수락");
  acceptButton.type = "button";
  const dismissButton = element("button", "invite-acceptance-dismiss", "링크 닫기");
  dismissButton.type = "button";
  const retryButton = element("button", "invite-acceptance-retry", "다시 시도");
  retryButton.type = "button";
  retryButton.hidden = true;
  actions.append(acceptButton, retryButton, dismissButton);
  panel.append(heading, description, message, actions);
  root.replaceChildren(panel);

  let controller = null;
  let disposed = false;

  function finish() {
    if (disposed) return;
    disposed = true;
    controller?.dispose();
    onFinished();
    panel.remove();
  }

  if (captureStatus === "invalid") {
    description.textContent = "초대 링크 형식이 올바르지 않거나 링크가 중복되었습니다. 보드 소유자에게 새 링크를 요청하세요.";
    message.textContent = "유효한 초대 토큰을 확인할 수 없습니다.";
    message.dataset.kind = "error";
    message.setAttribute("role", "alert");
    acceptButton.hidden = true;
    dismissButton.addEventListener("click", finish);
    return { dispose: finish };
  }

  if (captureStatus === "storage_error" || typeof token !== "string" || !token) {
    description.textContent = "초대 링크를 이 탭에서 안전하게 보관하지 못했습니다. 원래 초대 링크를 다시 열어 주세요.";
    message.textContent = "링크 정보를 준비할 수 없습니다.";
    message.dataset.kind = "warning";
    acceptButton.hidden = true;
    dismissButton.addEventListener("click", finish);
    return { dispose: finish };
  }

  description.textContent = "로그인된 계정으로 초대를 수락하면 이 계정이 보드 구성원으로 추가됩니다. 링크는 만료·취소·수락 후 다시 사용할 수 없습니다.";
  controller = createInviteAcceptanceController({
    client,
    token,
    onAccepted,
    onFinished: finish,
    clearToken: () => clearPendingInvite(storage),
    render(state) {
      message.textContent = state.message;
      message.dataset.kind = state.kind;
      message.setAttribute("role", state.kind === "error" ? "alert" : "status");
      message.hidden = !state.message;
      acceptButton.disabled = state.busy || state.status === "success";
      retryButton.hidden = state.status !== "error";
      retryButton.disabled = state.busy;
      dismissButton.disabled = state.busy;
      if (state.status === "success" && !state.busy) acceptButton.hidden = true;
    },
  });
  acceptButton.addEventListener("click", () => controller.accept());
  retryButton.addEventListener("click", () => controller.accept());
  dismissButton.addEventListener("click", finish);
  return { dispose: finish };
}

/** Render a safe message if a bearer link could not be captured from the URL. */
export function mountInviteCaptureNotice({ root, status }) {
  if (!root) return null;
  const notice = element("p", "invite-acceptance-message", status === "storage_error"
    ? "초대 링크를 안전한 탭 저장소에 보관하지 못했습니다. 초대 링크를 다시 열어 주세요."
    : "초대 링크 형식이 올바르지 않거나 중복되었습니다. 보드 소유자에게 새 링크를 요청해 주세요.");
  notice.setAttribute("role", "alert");
  root.replaceChildren(notice);
  return notice;
}
