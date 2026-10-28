import { listBoardMembers } from "./lib/member-repository.js";
import { supabaseClient } from "./lib/supabase-client.js";
import {
  createTask,
  deleteTask as deleteRemoteTask,
  listTasks,
  updateTask,
  updateTaskStatus,
} from "./lib/task-repository.js";
import { validateTaskInput } from "./lib/task-validation.js";

(() => {
  "use strict";

  const userId = typeof window.__TEAMBOARD_AUTH_USER_ID === "string"
    ? window.__TEAMBOARD_AUTH_USER_ID.trim()
    : "";
  if (!userId || !supabaseClient) return;

  const STATUSES = [
    { id: "todo", label: "할 일" },
    { id: "in_progress", label: "진행 중" },
    { id: "done", label: "완료" },
  ];
  const STATUS_LABELS = Object.fromEntries(STATUSES.map((item) => [item.id, item.label]));
  const AVATAR_CLASSES = ["avatar-sky", "avatar-rose", "avatar-amber", "avatar-violet", "avatar-profile"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const taskLists = new Map(STATUSES.map(({ id }) => [id, $(`[data-task-list="${id}"]`)]));
  const taskCounts = new Map(STATUSES.map(({ id }) => [id, $(`[data-task-count="${id}"]`)]));
  const taskDialog = $("#task-dialog");
  const taskForm = $("#task-form");
  const taskTitleInput = $("#task-title");
  const taskDescriptionInput = $("#task-description");
  const taskAssigneeInput = $("#task-assignee");
  const taskDueDateInput = $("#task-due-date");
  const taskStatusInput = $("#task-status");
  const taskTitleError = $("#task-title-error");
  const taskFormError = $("#task-form-error");
  const searchInput = $("#task-search");
  const visibleTaskCount = $("#visible-task-count");
  const resultSummary = $("#task-result-summary");
  const statusFilterCount = $("#status-filter-count");
  const assigneeFilterCount = $("#assignee-filter-count");
  const clearFiltersButton = $("#clear-filters-button");
  const sortButton = $("#sort-due-button");
  const toast = $("#toast");
  const appNotice = $("#app-notice");
  const boardTitle = $("#board-title");
  const breadcrumbBoardName = $("#breadcrumb-board-name");
  const taskDialogTitle = $("#task-dialog-title");
  const taskSubmitButton = $("#task-submit-button");

  const state = {
    board: null,
    members: [],
    tasks: [],
    status: "no-board",
    revision: 0,
    requestId: 0,
    busyTaskIds: new Set(),
    busy: false,
    rosterError: false,
  };
  let activeStatuses = null;
  let activeAssignees = null;
  let sortDirection = "asc";
  let editingTaskId = null;
  let toastTimer = null;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function koreanToday() {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function formatDate(value) {
    if (!value) return "마감일 미정";
    const [year, month, day] = value.split("-").map(Number);
    return year === Number(koreanToday().slice(0, 4))
      ? `${month}월 ${day}일`
      : `${year}년 ${month}월 ${day}일`;
  }

  function memberName(member) {
    return typeof member?.displayName === "string" && member.displayName.trim()
      ? member.displayName.trim()
      : "이름 미설정 구성원";
  }

  function memberMap() {
    return new Map(state.members.map((member, index) => [member.userId, {
      ...member,
      name: memberName(member),
      avatarClass: AVATAR_CLASSES[index % AVATAR_CLASSES.length],
    }]));
  }

  function showNotice(message, kind = "warning") {
    if (!appNotice) return;
    appNotice.textContent = message;
    appNotice.dataset.kind = kind;
    appNotice.hidden = !message;
  }

  function announce(message, kind = "success") {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = `toast ${kind === "error" ? "toast-error" : "toast-success"}`;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
  }

  function errorMessage(error, fallback = "업무 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
    if (error?.code === "unauthenticated") return "로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.";
    if (error?.code === "forbidden") return "이 업무를 변경할 권한이 없습니다.";
    if (error?.code === "network") return "업무 작업을 완료하지 못했습니다. 네트워크 연결을 확인해 주세요.";
    return fallback;
  }

  function resetFilters() {
    searchInput.value = "";
    activeStatuses = null;
    activeAssignees = null;
  }

  function clearTaskErrors() {
    taskTitleError.textContent = "";
    taskTitleInput.removeAttribute("aria-invalid");
    taskFormError.textContent = "";
    taskFormError.hidden = true;
  }

  function showTaskError(error) {
    const fields = error?.fieldErrors || {};
    if (fields.title) {
      taskTitleError.textContent = fields.title;
      taskTitleInput.setAttribute("aria-invalid", "true");
      taskTitleInput.focus();
      return;
    }
    taskFormError.textContent = fields.description || fields.status || fields.dueDate
      || fields.assigneeId || errorMessage(error);
    taskFormError.hidden = false;
  }

  function taskCompare(a, b) {
    if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate) * (sortDirection === "asc" ? 1 : -1);
    }
    return (Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)) || a.id.localeCompare(b.id);
  }

  function visibleTasks() {
    const query = searchInput.value.trim().toLocaleLowerCase("ko-KR");
    return state.tasks.filter((task) => {
      const text = `${task.title}\n${task.description}`.toLocaleLowerCase("ko-KR");
      return (!query || text.includes(query))
        && (activeStatuses === null || activeStatuses.has(task.status))
        && (activeAssignees === null || activeAssignees.has(task.assigneeId || "__unassigned__"));
    }).sort(taskCompare);
  }

  function renderAssigneeControls() {
    const members = [...memberMap().values()];
    taskAssigneeInput.replaceChildren(new Option("담당자 미정", ""));
    for (const member of members) taskAssigneeInput.append(new Option(member.name, member.userId));

    const fieldset = $("#assignee-filter-popover fieldset");
    if (!fieldset) return;
    fieldset.replaceChildren();
    const legend = document.createElement("legend");
    legend.textContent = "표시할 담당자";
    fieldset.append(legend);
    const options = [{ value: "__unassigned__", label: "담당자 미정" }, ...members.map((member) => ({ value: member.userId, label: member.name }))];
    for (const option of options) {
      const label = document.createElement("label");
      label.className = "filter-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.assigneeFilter = "";
      input.value = option.value;
      input.checked = activeAssignees === null || activeAssignees.has(option.value);
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(input, text);
      fieldset.append(label);
      input.addEventListener("change", () => {
        const selected = new Set($$("[data-assignee-filter]").filter((item) => item.checked).map((item) => item.value));
        activeAssignees = selected.size === options.length ? null : selected;
        render();
      });
    }
  }

  function taskCard(task) {
    const member = memberMap().get(task.assigneeId);
    const overdue = task.dueDate && task.dueDate < koreanToday() && task.status !== "done";
    const description = task.description ? `<p class="task-description">${escapeHtml(task.description)}</p>` : "";
    const due = task.dueDate
      ? `<time datetime="${escapeHtml(task.dueDate)}">${escapeHtml(formatDate(task.dueDate))}</time>`
      : "<span>마감일 미정</span>";
    const assignee = member
      ? `<span class="avatar ${member.avatarClass}" aria-hidden="true">${escapeHtml(member.name.slice(0, 1))}</span><span>${escapeHtml(member.name)}</span>`
      : '<span class="avatar avatar-unassigned" aria-hidden="true">?</span><span>담당자 미정</span>';
    const disabled = state.busyTaskIds.has(task.id) ? " disabled" : "";
    return `<article class="task-card${task.status === "done" ? " task-card-complete" : ""}" data-task-id="${escapeHtml(task.id)}"><div class="task-card-top"><label class="status-control"><span class="visually-hidden">업무 상태 변경</span><select data-task-status="${escapeHtml(task.id)}" aria-label="업무 상태 변경: ${escapeHtml(STATUS_LABELS[task.status])}"${disabled}>${STATUSES.map(({ id, label }) => `<option value="${id}"${task.status === id ? " selected" : ""}>${label}</option>`).join("")}</select></label><details class="card-menu"><summary class="card-more" aria-label="${escapeHtml(task.title)} 업무 메뉴">···</summary><div class="card-menu-content"><button type="button" data-edit-task="${escapeHtml(task.id)}">수정</button><button type="button" class="menu-danger" data-delete-task="${escapeHtml(task.id)}">삭제</button></div></details></div><h3>${escapeHtml(task.title)}</h3>${description}<div class="task-footer"><span class="due-date${overdue ? " due-date-overdue" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>${due}${overdue ? '<span class="overdue-label">지연</span>' : ""}</span><span class="assignee">${assignee}</span></div></article>`;
  }

  function syncFilters() {
    $$("[data-status-filter]").forEach((input) => { input.checked = activeStatuses === null || activeStatuses.has(input.value); });
    $$("[data-assignee-filter]").forEach((input) => { input.checked = activeAssignees === null || activeAssignees.has(input.value); });
    statusFilterCount.hidden = activeStatuses === null;
    statusFilterCount.textContent = activeStatuses === null ? "" : String(activeStatuses.size);
    assigneeFilterCount.hidden = activeAssignees === null;
    assigneeFilterCount.textContent = activeAssignees === null ? "" : String(activeAssignees.size);
    const filtered = Boolean(searchInput.value.trim()) || activeStatuses !== null || activeAssignees !== null;
    clearFiltersButton.disabled = !filtered;
    return filtered;
  }

  function render() {
    renderAssigneeControls();
    const boardName = state.board?.name || "공유 보드 선택";
    boardTitle.textContent = boardName;
    breadcrumbBoardName.textContent = boardName;
    document.title = `${boardName} | 팀 프로젝트 협업 보드`;

    const tasks = visibleTasks();
    const filtered = syncFilters();
    visibleTaskCount.textContent = String(tasks.length);
    resultSummary.textContent = filtered ? `검색·필터 결과 · 전체 ${state.tasks.length}개` : "저장된 업무";
    for (const { id } of STATUSES) {
      const column = tasks.filter((task) => task.status === id);
      taskCounts.get(id).textContent = String(column.length).padStart(2, "0");
      if (state.status === "loading") taskLists.get(id).innerHTML = '<p class="empty-state">업무를 불러오는 중…</p>';
      else if (state.status === "error" && id === "todo") taskLists.get(id).innerHTML = '<div class="empty-state"><span>업무를 불러오지 못했습니다.</span><button type="button" data-retry-tasks>다시 시도</button></div>';
      else if (!state.board) taskLists.get(id).innerHTML = id === "todo" ? '<p class="empty-state">위의 공유 보드에서 보드를 선택해 주세요.</p>' : '<p class="empty-state">공유 보드를 선택하면 업무가 표시됩니다.</p>';
      else if (column.length) taskLists.get(id).innerHTML = column.map(taskCard).join("");
      else if (filtered && tasks.length === 0) taskLists.get(id).innerHTML = '<p class="empty-state">검색·필터 조건에 맞는 업무가 없습니다.</p>';
      else if (filtered) taskLists.get(id).innerHTML = '<p class="empty-state">이 상태에 표시할 업무가 없습니다.</p>';
      else if (state.tasks.length === 0 && id === "todo") taskLists.get(id).innerHTML = '<div class="empty-state empty-state-first"><span>아직 등록된 업무가 없어요.</span><button type="button" data-add-task data-status="todo">첫 업무 추가</button></div>';
      else taskLists.get(id).innerHTML = '<p class="empty-state">이 상태에 업무가 없습니다.</p>';
    }
    $$('[data-add-task]').forEach((button) => { button.disabled = !state.board || state.status !== "ready" || state.busy; });
    sortButton.setAttribute("aria-pressed", String(sortDirection === "desc"));
    sortButton.setAttribute("aria-label", sortDirection === "asc" ? "마감일 빠른 순 정렬 중. 늦은 순으로 바꾸기" : "마감일 늦은 순 정렬 중. 빠른 순으로 바꾸기");
  }

  async function loadBoard(board, metadata = {}) {
    const requestId = ++state.requestId;
    state.board = board ? { ...board } : null;
    state.revision = Number(metadata.revision ?? state.revision + 1);
    state.members = [];
    state.tasks = [];
    state.rosterError = false;
    resetFilters();
    state.status = board ? "loading" : "no-board";
    render();
    if (!board) {
      showNotice("공유 보드를 선택하면 업무가 서버에서 불러와집니다.", "platform-info");
      return;
    }

    const [tasksResult, membersResult] = await Promise.allSettled([
      listTasks(supabaseClient, board.id),
      listBoardMembers(supabaseClient, board.id),
    ]);
    if (requestId !== state.requestId || state.board?.id !== board.id) return;
    if (tasksResult.status === "rejected") {
      state.status = "error";
      showNotice(errorMessage(tasksResult.reason, "업무를 불러오지 못했습니다. 다시 시도해 주세요."), "warning");
      render();
      return;
    }
    state.tasks = tasksResult.value;
    if (membersResult.status === "fulfilled") state.members = membersResult.value;
    else {
      state.rosterError = true;
      showNotice("업무는 불러왔지만 구성원 목록을 불러오지 못했습니다. 담당자는 미정으로 표시됩니다.", "warning");
    }
    state.status = "ready";
    if (!state.rosterError) showNotice("업무 데이터가 선택한 공유 보드와 연결되었습니다.", "platform-info");
    render();
  }

  function openTaskDialog(task = null, status = "todo") {
    if (!state.board || state.status !== "ready" || state.busy) return;
    editingTaskId = task?.id || null;
    taskForm.reset();
    clearTaskErrors();
    taskTitleInput.value = task?.title || "";
    taskDescriptionInput.value = task?.description || "";
    taskAssigneeInput.value = task?.assigneeId || "";
    taskDueDateInput.value = task?.dueDate || "";
    taskStatusInput.value = task?.status || (STATUS_LABELS[status] ? status : "todo");
    taskDialogTitle.textContent = task ? "업무 수정" : "새 업무 추가";
    taskSubmitButton.textContent = task ? "변경 저장" : "업무 추가";
    if (taskDialog.showModal) taskDialog.showModal();
    else taskDialog.setAttribute("open", "");
    setTimeout(() => taskTitleInput.focus(), 0);
  }

  function closeTaskDialog() {
    if (taskDialog.close && taskDialog.open) taskDialog.close();
    else { taskDialog.removeAttribute("open"); editingTaskId = null; }
  }

  async function submitTask(event) {
    event.preventDefault();
    if (state.busy || !state.board || state.status !== "ready") return;
    clearTaskErrors();
    const input = {
      title: taskTitleInput.value,
      description: taskDescriptionInput.value,
      assigneeId: taskAssigneeInput.value,
      dueDate: taskDueDateInput.value,
      status: taskStatusInput.value,
    };
    const validation = validateTaskInput(input);
    if (!validation.valid) { showTaskError({ fieldErrors: validation.errors }); return; }
    if (input.assigneeId && !memberMap().has(input.assigneeId)) {
      showTaskError({ fieldErrors: { assigneeId: "현재 보드의 구성원만 담당자로 선택할 수 있습니다." } });
      return;
    }
    const boardId = state.board.id;
    const requestRevision = state.revision;
    const taskId = editingTaskId;
    state.busy = true;
    taskSubmitButton.disabled = true;
    taskSubmitButton.textContent = "저장 중…";
    try {
      const saved = taskId
        ? await updateTask(supabaseClient, boardId, taskId, input)
        : await createTask(supabaseClient, boardId, input);
      if (requestRevision !== state.revision || state.board?.id !== boardId) return;
      state.tasks = taskId ? state.tasks.map((task) => task.id === taskId ? saved : task) : [saved, ...state.tasks];
      render();
      closeTaskDialog();
      announce(taskId ? "업무를 수정했어요." : "새 업무를 추가했어요.");
    } catch (error) {
      showTaskError(error);
    } finally {
      state.busy = false;
      taskSubmitButton.disabled = false;
      taskSubmitButton.textContent = taskId ? "변경 저장" : "업무 추가";
      render();
    }
  }

  async function changeTaskStatus(taskId, status, select) {
    if (!state.board || state.status !== "ready" || state.busyTaskIds.has(taskId)) return;
    const boardId = state.board.id;
    const requestRevision = state.revision;
    state.busyTaskIds.add(taskId);
    select.disabled = true;
    try {
      const saved = await updateTaskStatus(supabaseClient, boardId, taskId, status);
      if (requestRevision !== state.revision || state.board?.id !== boardId) return;
      state.tasks = state.tasks.map((task) => task.id === taskId ? saved : task);
      announce(`업무 상태를 '${STATUS_LABELS[status]}'(으)로 변경했어요.`);
    } catch (error) {
      announce(errorMessage(error, "업무 상태를 변경하지 못했습니다. 기존 상태를 유지했어요."), "error");
    } finally {
      state.busyTaskIds.delete(taskId);
      render();
    }
  }

  async function deleteTask(taskId) {
    if (!state.board || state.status !== "ready") return;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || !window.confirm(`'${task.title}' 업무를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const boardId = state.board.id;
    const requestRevision = state.revision;
    state.busyTaskIds.add(taskId);
    render();
    try {
      await deleteRemoteTask(supabaseClient, boardId, taskId);
      if (requestRevision !== state.revision || state.board?.id !== boardId) return;
      state.tasks = state.tasks.filter((item) => item.id !== taskId);
      announce("업무를 삭제했어요.");
    } catch (error) {
      announce(errorMessage(error, "업무를 삭제하지 못했습니다. 기존 업무를 유지했어요."), "error");
    } finally {
      state.busyTaskIds.delete(taskId);
      render();
    }
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    if (target.closest("[data-retry-tasks]")) { void loadBoard(state.board, { revision: state.revision }); return; }
    const addTask = target.closest("[data-add-task]");
    if (addTask) { openTaskDialog(null, addTask.dataset.status || "todo"); return; }
    const editTask = target.closest("[data-edit-task]");
    if (editTask) {
      editTask.closest("details")?.removeAttribute("open");
      const task = state.tasks.find((item) => item.id === editTask.dataset.editTask);
      if (task) openTaskDialog(task);
      return;
    }
    const removeTask = target.closest("[data-delete-task]");
    if (removeTask) {
      removeTask.closest("details")?.removeAttribute("open");
      void deleteTask(removeTask.dataset.deleteTask);
      return;
    }
    if (target.closest("[data-close-dialog]")) { closeTaskDialog(); return; }
    if (target.closest("#clear-filters-button")) { resetFilters(); render(); searchInput.focus(); return; }
    if (target.closest("#sort-due-button")) { sortDirection = sortDirection === "asc" ? "desc" : "asc"; render(); }
  }

  function initialize() {
    $(".project-section")?.setAttribute("hidden", "");
    $(".mobile-board-switch")?.setAttribute("hidden", "");
    $("#board-dialog")?.setAttribute("hidden", "");
    taskForm.addEventListener("submit", submitTask);
    taskDialog.addEventListener("close", () => { editingTaskId = null; taskForm.reset(); clearTaskErrors(); });
    taskDialog.addEventListener("click", (event) => { if (event.target === taskDialog) closeTaskDialog(); });
    searchInput.addEventListener("input", render);
    $$("[data-status-filter]").forEach((input) => input.addEventListener("change", () => {
      const selected = new Set($$("[data-status-filter]").filter((item) => item.checked).map((item) => item.value));
      activeStatuses = selected.size === STATUSES.length ? null : selected;
      render();
    }));
    document.addEventListener("click", handleClick);
    document.addEventListener("change", (event) => {
      const select = event.target instanceof Element ? event.target.closest("[data-task-status]") : null;
      if (!select || !Object.hasOwn(STATUS_LABELS, select.value)) return;
      void changeTaskStatus(select.dataset.taskStatus, select.value, select);
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.focus(); }
    });
    window.__TEAMBOARD_SET_ACTIVE_BOARD = (board, metadata = {}) => { void loadBoard(board, metadata); };
    render();
    showNotice("공유 보드를 선택하면 업무가 서버에서 불러와집니다.", "platform-info");
  }

  initialize();
})();
