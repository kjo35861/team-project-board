import { createBoardListController } from "./board-list-controller.js";

const ERROR_MESSAGE = "공유 보드 목록을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";

function makeElement(tag, className, text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Mount the read-only remote-board list and return its load/dispose controller. */
export function mountBoardListUI({ client, root }) {
  if (!root) throw new TypeError("A board-list UI root is required.");

  const content = makeElement("div", "shared-board-list-content");
  root.replaceChildren(content);

  function render(state) {
    content.replaceChildren();

    if (state.status === "loading") {
      const loading = makeElement("p", "shared-board-state", "공유 보드를 불러오는 중…");
      loading.setAttribute("role", "status");
      content.append(loading);
      return;
    }

    if (state.status === "error") {
      const error = makeElement("p", "shared-board-state shared-board-error", ERROR_MESSAGE);
      error.setAttribute("role", "alert");
      const retry = makeElement("button", "shared-board-retry", "다시 시도");
      retry.type = "button";
      retry.addEventListener("click", () => controller.retry());
      content.append(error, retry);
      return;
    }

    if (state.status === "empty") {
      const empty = makeElement("p", "shared-board-state", "아직 참여 중인 공유 보드가 없습니다.");
      empty.setAttribute("role", "status");
      content.append(empty);
      return;
    }

    const list = makeElement("ul", "shared-board-list");
    for (const board of state.boards) {
      const item = makeElement("li", "shared-board-item");
      const name = makeElement("span", "shared-board-name", board.name);
      const role = makeElement("span", "shared-board-role", board.owner_id === window.__TEAMBOARD_AUTH_USER_ID ? "소유자" : "구성원");
      item.append(name, role);
      list.append(item);
    }
    content.append(list);
  }

  const controller = createBoardListController({ client, render });
  void controller.load();
  return controller;
}
