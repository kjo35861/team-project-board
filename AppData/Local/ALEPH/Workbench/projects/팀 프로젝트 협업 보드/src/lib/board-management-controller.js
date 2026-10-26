import {
  BoardRepositoryError,
  createBoard,
  deleteBoard,
  renameBoard,
} from "./board-repository.js";

const GENERIC_ERROR = "보드 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** Coordinate server-side board mutations and refresh the visible board list. */
export function createBoardManagementController({
  client,
  refresh = async () => {},
  render = () => {},
  repository = { createBoard, renameBoard, deleteBoard },
}) {
  let busy = false;
  let state = { busy: false, message: "", kind: "info" };

  function publish(next) {
    state = next;
    render({ ...state });
  }

  async function perform(operation, successMessage) {
    if (busy) return false;
    busy = true;
    publish({ ...state, busy: true, message: "", kind: "info" });

    try {
      await operation();
      let message = successMessage;
      try {
        await refresh();
      } catch {
        message += " 목록을 다시 불러오지 못했습니다. 목록의 다시 시도를 눌러 주세요.";
      }
      publish({ busy: false, message, kind: "success" });
      return true;
    } catch (error) {
      const message = error instanceof BoardRepositoryError ? error.message : GENERIC_ERROR;
      publish({ busy: false, message, kind: "error" });
      return false;
    } finally {
      busy = false;
    }
  }

  return {
    create(name) {
      return perform(() => repository.createBoard(client, name), "공유 보드를 만들었습니다.");
    },
    rename(boardId, name) {
      return perform(() => repository.renameBoard(client, boardId, name), "보드 이름을 변경했습니다.");
    },
    delete(boardId) {
      return perform(() => repository.deleteBoard(client, boardId), "보드와 포함된 업무를 삭제했습니다.");
    },
    isBusy() {
      return busy;
    },
    getState() {
      return { ...state };
    },
  };
}
