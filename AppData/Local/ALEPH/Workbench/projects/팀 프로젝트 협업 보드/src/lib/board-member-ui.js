import { createBoardMemberController } from "./board-member-controller.js";

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function memberLabel(member, currentUserId) {
  const name = typeof member.displayName === "string" && member.displayName.trim()
    ? member.displayName.trim()
    : "이름 미설정 구성원";
  return member.userId === currentUserId ? `${name} (나)` : name;
}

/** Mount a board-specific roster and role-limited management actions. */
export function mountBoardMemberUI({
  client,
  boardId,
  currentUserId,
  root,
  onBoardLeft,
  confirm = (message) => window.confirm(message),
}) {
  if (!root) throw new TypeError("A board-member UI root is required.");
  const shell = element("section", "board-member-management");
  shell.setAttribute("aria-label", "보드 구성원");
  const header = element("div", "board-member-header");
  const title = element("h3", "board-member-title", "구성원");
  const refreshButton = element("button", "board-member-refresh", "새로고침");
  refreshButton.type = "button";
  header.append(title, refreshButton);
  const message = element("p", "board-member-message");
  message.setAttribute("aria-live", "polite");
  message.hidden = true;
  const content = element("div", "board-member-content");
  shell.append(header, message, content);
  root.replaceChildren(shell);

  let controller;
  function render(state) {
    message.hidden = !state.message;
    message.textContent = state.message;
    message.dataset.kind = state.kind;
    content.replaceChildren();
    refreshButton.disabled = state.status === "loading" || Boolean(state.busyUserId) || state.leaving;
    if (state.status === "loading") {
      const loading = element("p", "board-member-state", "구성원 목록을 불러오는 중…");
      loading.setAttribute("role", "status");
      content.append(loading);
      return;
    }
    if (state.status === "error") {
      const retry = element("button", "board-member-retry", "다시 시도");
      retry.type = "button";
      retry.addEventListener("click", () => controller.retry());
      content.append(retry);
      return;
    }
    if (state.status !== "success") return;

    const currentMember = state.members.find((member) => member.userId === currentUserId);
    const isOwner = currentMember?.role === "owner";
    const roster = element("ul", "board-member-list");
    for (const member of state.members) {
      const item = element("li", "board-member-item");
      const identity = element("div", "board-member-identity");
      const avatar = element("span", "board-member-avatar", (member.displayName || "?").trim().slice(0, 1).toUpperCase() || "?");
      avatar.setAttribute("aria-hidden", "true");
      const name = element("span", "board-member-name", memberLabel(member, currentUserId));
      const role = element("span", `board-member-role board-member-role-${member.role}`, member.role === "owner" ? "소유자" : "팀원");
      identity.append(avatar, name, role);
      item.append(identity);
      if (isOwner && member.role === "member" && member.userId !== currentUserId) {
        const remove = element("button", "board-member-remove", "제거");
        remove.type = "button";
        remove.disabled = Boolean(state.busyUserId) || state.leaving;
        remove.setAttribute("aria-label", `${memberLabel(member, currentUserId)} 보드에서 제거`);
        remove.addEventListener("click", async () => {
          if (!confirm(`${memberLabel(member, currentUserId)} 님을 이 보드에서 제거할까요? 담당 업무는 미정으로 바뀌며 업무 자체는 유지됩니다.`)) return;
          await controller.removeMember(member.userId);
        });
        item.append(remove);
      }
      roster.append(item);
    }
    content.append(roster);

    if (!isOwner) {
      const leave = element("button", "board-member-leave", "보드 나가기");
      leave.type = "button";
      leave.disabled = state.leaving || Boolean(state.busyUserId);
      leave.addEventListener("click", async () => {
        if (!confirm("이 보드에서 나갈까요? 담당 업무는 미정으로 바뀌며 업무는 유지됩니다.")) return;
        await controller.leave();
      });
      content.append(leave);
    }
  }

  controller = createBoardMemberController({
    client,
    boardId,
    currentUserId,
    render,
    onBoardLeft,
  });
  refreshButton.addEventListener("click", () => controller.retry());
  void controller.load();

  return {
    reload: () => controller.load(),
    dispose() {
      controller.dispose();
      shell.remove();
    },
  };
}
