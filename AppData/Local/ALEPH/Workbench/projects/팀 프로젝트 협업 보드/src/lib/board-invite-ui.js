import { createBoardInviteController } from "./board-invite-controller.js";

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const STATUS_LABELS = {
  pending: "대기 중",
  accepted: "수락됨",
  canceled: "취소됨",
  expired: "만료됨",
};

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "날짜 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Mount owner-only invitation creation, link copying, list, and cancellation. */
export function mountBoardInviteUI({
  client,
  boardId,
  root,
  confirm = (message) => window.confirm(message),
  clipboard = globalThis.navigator?.clipboard,
}) {
  if (!root) throw new TypeError("An invitation UI root is required.");
  const shell = element("section", "board-invite-management");
  shell.setAttribute("aria-label", "보드 초대 관리");
  const toolbar = element("div", "board-invite-toolbar");
  const title = element("h3", "board-invite-title", "초대 링크");
  const createButton = element("button", "board-invite-create", "＋ 초대 링크 만들기");
  createButton.type = "button";
  toolbar.append(title, createButton);
  const message = element("p", "board-invite-message");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  const share = element("div", "board-invite-share");
  share.hidden = true;
  const linkLabel = element("label", "board-invite-link-label", "한 번만 표시되는 초대 링크");
  const linkInput = element("input", "board-invite-link");
  linkInput.type = "text";
  linkInput.readOnly = true;
  linkInput.autocomplete = "off";
  linkInput.spellcheck = false;
  linkInput.setAttribute("aria-label", "복사하거나 직접 공유할 초대 링크");
  const copyButton = element("button", "board-invite-copy", "링크 복사");
  copyButton.type = "button";
  linkLabel.append(linkInput);
  const shareHint = element("p", "board-invite-share-hint", "초대 링크에는 접근 권한이 포함됩니다. 신뢰하는 팀원에게만 전달하세요. 링크는 7일 후 만료되며 한 번 수락하면 다시 사용할 수 없습니다.");
  share.append(linkLabel, copyButton, shareHint);
  const listHeading = element("h4", "board-invite-list-heading", "발급한 초대");
  const list = element("ul", "board-invite-list");
  const content = element("div", "board-invite-content");
  content.append(listHeading, list);
  shell.append(toolbar, message, share, content);
  root.replaceChildren(shell);

  let controller;

  async function copyLink() {
    if (!linkInput.value) return;
    try {
      if (!clipboard || typeof clipboard.writeText !== "function") throw new Error("clipboard unavailable");
      await clipboard.writeText(linkInput.value);
      message.textContent = "초대 링크를 클립보드에 복사했습니다. 안전하게 전달해 주세요.";
      message.dataset.kind = "success";
    } catch {
      linkInput.focus();
      linkInput.select();
      message.textContent = "자동 복사에 실패했습니다. 선택된 링크를 직접 복사해 주세요.";
      message.dataset.kind = "warning";
    }
    message.hidden = false;
  }

  function render(state) {
    message.textContent = state.message;
    message.hidden = !state.message;
    message.dataset.kind = state.kind;
    createButton.disabled = state.busy;
    copyButton.disabled = state.busy || !state.shareUrl;
    share.hidden = !state.shareUrl;
    if (linkInput.value !== state.shareUrl) linkInput.value = state.shareUrl;
    list.replaceChildren();

    if (state.status === "loading") {
      const loading = element("li", "board-invite-state", "초대 목록을 불러오는 중…");
      loading.setAttribute("role", "status");
      list.append(loading);
      return;
    }
    if (state.status === "error") {
      const error = element("li", "board-invite-state", "초대 목록을 불러오지 못했습니다.");
      error.setAttribute("role", "status");
      const retry = element("button", "board-invite-retry", "다시 시도");
      retry.type = "button";
      retry.disabled = state.busy;
      retry.addEventListener("click", () => controller.retry());
      list.append(error, retry);
      return;
    }
    if (state.status !== "success") return;
    if (!state.invitations.length) {
      const empty = element("li", "board-invite-state", "발급한 초대가 없습니다.");
      empty.setAttribute("role", "status");
      list.append(empty);
      return;
    }

    for (const invite of state.invitations) {
      const item = element("li", "board-invite-item");
      const details = element("div", "board-invite-details");
      const status = element("span", `board-invite-status board-invite-status-${invite.status}`, STATUS_LABELS[invite.status] || "상태 확인 필요");
      const expiry = element("time", "board-invite-expiry", `만료 ${formatDate(invite.expiresAt)}`);
      if (Number.isFinite(Date.parse(invite.expiresAt))) expiry.dateTime = invite.expiresAt;
      details.append(status, expiry);
      item.append(details);
      if (invite.status === "pending") {
        const cancel = element("button", "board-invite-cancel", "초대 취소");
        cancel.type = "button";
        cancel.disabled = state.busy;
        cancel.setAttribute("aria-label", `초대 ${formatDate(invite.createdAt)} 취소`);
        cancel.addEventListener("click", async () => {
          if (!confirm("이 초대를 취소할까요? 취소한 링크는 더 이상 사용할 수 없습니다.")) return;
          await controller.cancel(invite.inviteId);
        });
        item.append(cancel);
      }
      list.append(item);
    }
  }

  controller = createBoardInviteController({ client, boardId, render });
  createButton.addEventListener("click", () => controller.create());
  copyButton.addEventListener("click", copyLink);
  void controller.load();

  return {
    reload: () => controller.load(),
    dispose() {
      controller.dispose();
      linkInput.value = "";
      shell.remove();
    },
  };
}
