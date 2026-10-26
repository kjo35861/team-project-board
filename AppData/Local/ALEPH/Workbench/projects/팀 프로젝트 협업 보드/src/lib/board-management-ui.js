import { createBoardManagementController } from "./board-management-controller.js";
import { createBoardListController } from "./board-list-controller.js";
import { createBoardSelection } from "./board-selection.js";
import {
  createBoard as defaultCreateBoard,
  deleteBoard as defaultDeleteBoard,
  listBoards as defaultListBoards,
  renameBoard as defaultRenameBoard,
} from "./board-repository.js";
import { mountBoardInviteUI } from "./board-invite-ui.js";
import { mountBoardMemberUI } from "./board-member-ui.js";

const ERROR_MESSAGE = "공유 보드 목록을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";

function element(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Mount server-backed boards, owner management, members and invitation UI. */
export function mountBoardManagementUI({ client, userId, root, repository = {}, onBoardSelected = () => {} }) {
  if (!root) throw new TypeError("A shared-board root is required.");

  const content = element("div", "shared-board-management");
  const toolbar = element("div", "shared-board-toolbar");
  const createButton = element("button", "shared-board-create", "＋ 공유 보드 만들기");
  createButton.type = "button";
  toolbar.append(createButton);

  const status = element("p", "shared-board-message");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  const list = element("div", "shared-board-list-content");
  content.append(toolbar, status, list);
  root.replaceChildren(content);

  const dialog = element("dialog", "shared-board-dialog");
  dialog.setAttribute("aria-labelledby", "shared-board-dialog-title");
  const form = element("form", "shared-board-form");
  form.noValidate = true;
  const heading = element("h2", "shared-board-dialog-title");
  heading.id = "shared-board-dialog-title";
  const intro = element("p", "shared-board-dialog-intro", "이름은 앞뒤 공백을 제거한 뒤 1~60자로 저장됩니다.");
  const label = element("label", "shared-board-label", "보드 이름");
  const input = element("input", "shared-board-input");
  input.type = "text";
  input.name = "name";
  input.maxLength = 60;
  input.autocomplete = "off";
  input.required = true;
  label.append(input);
  const fieldError = element("p", "shared-board-field-error");
  fieldError.setAttribute("aria-live", "polite");
  const dialogMessage = element("p", "shared-board-dialog-message");
  dialogMessage.setAttribute("role", "status");
  dialogMessage.setAttribute("aria-live", "polite");
  dialogMessage.hidden = true;
  const actions = element("div", "shared-board-dialog-actions");
  const cancelButton = element("button", "shared-board-cancel", "취소");
  cancelButton.type = "button";
  const submitButton = element("button", "shared-board-submit", "저장");
  submitButton.type = "submit";
  actions.append(cancelButton, submitButton);
  form.append(heading, intro, label, fieldError, dialogMessage, actions);
  dialog.append(form);
  document.body.append(dialog);

  let listController;
  let memberUI = null;
  let inviteUI = null;
  let expandedMemberBoardId = null;
  let operation = "create";
  let editingBoardId = null;
  let mutationState = { busy: false, message: "", kind: "info" };
  let listState = "loading";

  function clearExpandedPanels() {
    memberUI?.dispose();
    inviteUI?.dispose();
    memberUI = null;
    inviteUI = null;
  }

  const selection = createBoardSelection({
    onChange(change) {
      clearExpandedPanels();
      onBoardSelected(change.board, { previousId: change.previousId, revision: change.revision, reason: change.reason });
    },
  });

  function renderList(boards) {
    clearExpandedPanels();
    if (listState === "success" || listState === "empty") selection.update(boards);
    const currentBoards = selection.getBoards();
    const activeBoardId = selection.getActive()?.id || null;
    if (expandedMemberBoardId && !currentBoards.some((board) => board.id === expandedMemberBoardId)) {
      expandedMemberBoardId = null;
    }
    list.replaceChildren();
    if (listState === "loading") {
      const loading = element("p", "shared-board-state", "공유 보드를 불러오는 중…");
      loading.setAttribute("role", "status");
      list.append(loading);
      return;
    }
    if (listState === "error") {
      const error = element("p", "shared-board-state shared-board-error", ERROR_MESSAGE);
      error.setAttribute("role", "alert");
      const retry = element("button", "shared-board-retry", "다시 시도");
      retry.type = "button";
      retry.addEventListener("click", () => listController.retry());
      list.append(error, retry);
      return;
    }
    if (!currentBoards.length) {
      const empty = element("p", "shared-board-state", "아직 참여 중인 공유 보드가 없습니다.");
      empty.setAttribute("role", "status");
      expandedMemberBoardId = null;
      list.append(empty);
      return;
    }

    const items = element("ul", "shared-board-list");
    for (const board of currentBoards) {
      const item = element("li", "shared-board-item");
      const selected = board.id === activeBoardId;
      const name = element("button", `shared-board-name${selected ? " is-selected" : ""}`, board.name);
      name.type = "button";
      if (selected) name.setAttribute("aria-current", "true");
      name.setAttribute("aria-label", `공유 보드 선택: ${board.name}`);
      name.addEventListener("click", () => selection.select(board.id));
      const role = element("span", "shared-board-role", board.owner_id === userId ? "소유자" : "구성원");
      const summary = element("div", "shared-board-summary");
      summary.append(name, role);
      item.append(summary);

      const controls = element("div", "shared-board-actions");
      const memberToggle = element("button", "shared-board-action", expandedMemberBoardId === board.id ? "관리 패널 닫기" : "구성원 · 초대");
      memberToggle.type = "button";
      memberToggle.setAttribute("aria-expanded", String(expandedMemberBoardId === board.id));
      memberToggle.disabled = mutationState.busy;
      memberToggle.addEventListener("click", () => {
        clearExpandedPanels();
        expandedMemberBoardId = expandedMemberBoardId === board.id ? null : board.id;
        renderList(selection.getBoards());
      });
      controls.append(memberToggle);

      if (board.owner_id === userId) {
        const rename = element("button", "shared-board-action", "이름 변경");
        rename.type = "button";
        rename.disabled = mutationState.busy;
        rename.addEventListener("click", () => openDialog("rename", board));
        const remove = element("button", "shared-board-action shared-board-action-danger", "삭제");
        remove.type = "button";
        remove.disabled = mutationState.busy;
        remove.addEventListener("click", () => confirmDelete(board));
        controls.append(rename, remove);
      }
      item.append(controls);

      if (expandedMemberBoardId === board.id) {
        const panel = element("div", "shared-board-member-panel");
        panel.setAttribute("aria-label", `${board.name} 구성원 및 초대 관리`);
        const memberRoot = element("div", "shared-board-member-root");
        panel.append(memberRoot);
        item.append(panel);
        memberUI = mountBoardMemberUI({
          client,
          boardId: board.id,
          currentUserId: userId,
          root: memberRoot,
          onBoardLeft: async () => {
            expandedMemberBoardId = null;
            const result = await listController.refresh();
            if (result?.status === "error" || result?.status === "stale" || result?.status === "disposed") {
              throw new Error("Board list refresh failed");
            }
          },
        });
        if (board.owner_id === userId) {
          const inviteRoot = element("div", "shared-board-invite-root");
          panel.append(inviteRoot);
          inviteUI = mountBoardInviteUI({ client, boardId: board.id, root: inviteRoot });
        }
      }
      items.append(item);
    }
    list.append(items);
  }

  function showMutationState(next) {
    mutationState = next;
    status.hidden = !next.message;
    status.textContent = next.message;
    status.dataset.kind = next.kind;
    if (dialog.open) {
      dialogMessage.hidden = !next.message;
      dialogMessage.textContent = next.message;
      dialogMessage.dataset.kind = next.kind;
      dialogMessage.setAttribute("role", next.kind === "error" ? "alert" : "status");
    }
    createButton.disabled = next.busy;
    submitButton.disabled = next.busy;
    cancelButton.disabled = next.busy;
    renderList(selection.getBoards());
  }

  listController = createBoardListController({
    client,
    repository: repository.listBoards || defaultListBoards,
    render(next) {
      listState = next.status;
      renderList(next.boards);
    },
  });

  const managementController = createBoardManagementController({
    client,
    repository: {
      createBoard: repository.createBoard || defaultCreateBoard,
      renameBoard: repository.renameBoard || defaultRenameBoard,
      deleteBoard: repository.deleteBoard || defaultDeleteBoard,
    },
    async refresh() {
      const result = await listController.refresh();
      if (result?.status === "error" || result?.status === "stale" || result?.status === "disposed") {
        throw new Error("Board list refresh failed");
      }
    },
    render: showMutationState,
  });

  function openDialog(nextOperation, board = null) {
    if (mutationState.busy) return;
    operation = nextOperation;
    editingBoardId = board?.id || null;
    heading.textContent = operation === "create" ? "공유 보드 만들기" : "보드 이름 변경";
    submitButton.textContent = operation === "create" ? "보드 만들기" : "이름 저장";
    input.value = board?.name || "";
    fieldError.textContent = "";
    input.removeAttribute("aria-invalid");
    dialogMessage.hidden = true;
    dialogMessage.textContent = "";
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    queueMicrotask(() => input.focus());
  }

  function closeDialog() {
    if (dialog.close && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  async function confirmDelete(board) {
    if (mutationState.busy) return;
    const confirmed = typeof window.confirm === "function"
      ? window.confirm(`'${board.name}' 보드를 삭제할까요? 포함된 업무와 구성원도 함께 삭제되며 되돌릴 수 없습니다.`)
      : false;
    if (confirmed) await managementController.delete(board.id);
  }

  createButton.addEventListener("click", () => openDialog("create"));
  cancelButton.addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog && !mutationState.busy) closeDialog();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (mutationState.busy) return;
    const name = input.value.trim();
    if (!name || Array.from(name).length > 60) {
      fieldError.textContent = name ? "보드 이름은 60자 이내로 입력해 주세요." : "보드 이름을 입력해 주세요.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    fieldError.textContent = "";
    input.removeAttribute("aria-invalid");
    const succeeded = operation === "create"
      ? await managementController.create(name)
      : await managementController.rename(editingBoardId, name);
    if (succeeded) closeDialog();
  });

  void listController.load();
  return {
    reload: () => listController.refresh(),
    selectBoard(boardId) {
      const result = selection.select(boardId);
      if (!result.valid) return false;
      clearExpandedPanels();
      expandedMemberBoardId = null;
      renderList(selection.getBoards());
      return true;
    },
    getActiveBoard: () => selection.getActive(),
    getSelectionRevision: () => selection.getRevision(),
    dispose() {
      listController.dispose();
      clearExpandedPanels();
      selection.clear();
      if (dialog.open && dialog.close) dialog.close();
      dialog.remove();
      content.remove();
    },
  };
}
