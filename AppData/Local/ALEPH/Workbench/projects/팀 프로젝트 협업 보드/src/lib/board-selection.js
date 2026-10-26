/** Keep the active server board valid across list refreshes and invalidate old scopes. */
export function createBoardSelection({ onChange = () => {} } = {}) {
  let boards = [];
  let activeBoardId = null;
  let revision = 0;

  function activeBoard() {
    return boards.find((board) => board?.id === activeBoardId) || null;
  }

  function setActive(board, reason) {
    const previousId = activeBoardId;
    activeBoardId = board?.id || null;
    if (previousId !== activeBoardId) {
      revision += 1;
      onChange({ board: board ? { ...board } : null, previousId, revision, reason });
    }
    return { board: activeBoard(), changed: previousId !== activeBoardId, revision };
  }

  return {
    update(nextBoards) {
      boards = Array.isArray(nextBoards) ? nextBoards.filter((board) => typeof board?.id === "string") : [];
      const current = activeBoard();
      if (current) return { board: current, changed: false, revision };
      return setActive(boards[0] || null, "list-refresh");
    },
    select(boardId) {
      const selected = boards.find((board) => board.id === boardId);
      if (!selected) return { board: activeBoard(), changed: false, revision, valid: false };
      return { ...setActive(selected, "user-selection"), valid: true };
    },
    clear() {
      boards = [];
      return setActive(null, "clear");
    },
    getActive() {
      const board = activeBoard();
      return board ? { ...board } : null;
    },
    getBoards() {
      return boards.map((board) => ({ ...board }));
    },
    getRevision() {
      return revision;
    },
    isCurrent(boardId, expectedRevision = revision) {
      return boardId === activeBoardId && expectedRevision === revision;
    },
  };
}
