/** Workspace overview shares the sidebar's server snapshot and keeps browser navigation usable. */
export function mountWorkspaceUI({ userId, onSelect, onCreate, onRefresh }) {
  const root = document.querySelector('#workspace-page');
  const boardPage = document.querySelector('#board');
  const list = document.querySelector('#workspace-board-list');
  const count = document.querySelector('#workspace-count');
  const crumb = document.querySelector('#breadcrumb-board-name');
  const separator = document.querySelector('.breadcrumb-divider');
  const events = new AbortController();
  let state = { status: 'loading', boards: [] };
  let activeBoard = null;
  let firstSnapshot = true;
  let overview = window.location.hash === '#workspace';
  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    document.querySelector('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    const sidebar = document.querySelector('#app-sidebar');
    if (sidebar) sidebar.inert = Boolean(window.matchMedia?.('(max-width: 760px)').matches);
  }
  function display(isOverview, push = false, focus = false) {
    overview = isOverview;
    root.hidden = !overview;
    boardPage.hidden = overview;
    crumb.hidden = overview;
    if (separator) separator.hidden = overview;
    if (overview) document.title = '내 워크스페이스 | 팀 프로젝트 협업 보드';
    else if (activeBoard) {
      crumb.textContent = activeBoard.name;
      document.title = `${activeBoard.name} | 팀 프로젝트 협업 보드`;
    }
    if (push) {
      const hash = overview ? '#workspace' : `#board/${encodeURIComponent(activeBoard?.id || '')}`;
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    }
    closeSidebar();
    if (focus) (overview ? document.querySelector('#workspace-title') : document.querySelector('#board-title'))?.focus();
  }
  function node(tag, text, className) {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function render() {
    document.querySelector("[data-workspace-refresh]").disabled = state.status === "loading";
    list.replaceChildren();
    count.textContent = state.status === 'success' || state.status === 'empty' ? `전체 ${state.boards.length}개의 보드` : '';
    if (state.status === 'loading') { list.append(node('p', '보드를 불러오는 중…', 'workspace-state')); return; }
    if (state.status === 'error') {
      list.append(node('p', '보드 목록을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.', 'workspace-state'));
      return;
    }
    if (!state.boards.length) {
      const empty = node('div', '', 'workspace-state');
      empty.append(node('h2', '첫 보드를 만들어 보세요'), node('p', '새 프로젝트를 시작하거나 팀원의 초대를 수락하세요.'));
      list.append(empty); return;
    }
    const grid = node('div', '', 'workspace-board-grid');
    for (const board of state.boards) {
      const card = node('a', '', 'workspace-board-card');
      card.href = `#board/${encodeURIComponent(board.id)}`;
      card.dataset.workspaceBoard = board.id;
      card.append(node('span', '#', 'workspace-board-icon'), node('h2', board.name), node('span', board.owner_id === userId ? '소유자' : '구성원', 'workspace-board-role'), node('span', '보드 열기 →', 'workspace-board-open'));
      grid.append(card);
    }
    list.append(grid);
  }
  function route() {
    if (window.location.hash === '#workspace') { display(true, false, true); return; }
    if (window.location.hash.startsWith('#board/')) {
      let id;
      try { id = decodeURIComponent(window.location.hash.slice(7)); } catch { display(true); return; }
      if (!onSelect(id)) display(true);
    } else display(false);
  }
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-workspace-link]')) { event.preventDefault(); display(true, true, true); return; }
    const card = target.closest('[data-workspace-board]');
    if (card && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault(); onSelect(card.dataset.workspaceBoard); return;
    }
    if (target.closest('[data-workspace-create]')) onCreate();
    if (target.closest('[data-workspace-refresh]')) void onRefresh();
    if (overview && activeBoard && target.closest('[data-task-view], [data-focus-search], .sidebar-add')) display(false, true);
  }, { signal: events.signal });
  window.addEventListener('hashchange', route, { signal: events.signal });
  display(overview);
  return {
    update(next) {
      state = { status: next.status, boards: [...next.boards] };
      render();
      if (firstSnapshot && (next.status === 'success' || next.status === 'empty')) {
        firstSnapshot = false;
        if (window.location.hash.startsWith('#board/')) queueMicrotask(route);
      }
      if (overview) document.title = '내 워크스페이스 | 팀 프로젝트 협업 보드';
    },
    onBoardSelected(board, metadata = {}) {
      activeBoard = board;
      if (metadata.reason === 'user-selection') display(false, true, true);
      else if (!overview) display(false);
    },
    dispose() { events.abort(); list.replaceChildren(); },
  };
}
