const BOARD_COLUMNS = "id,name,owner_id,created_at,updated_at";

const ERROR_MESSAGES = {
  unauthenticated: "로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
  forbidden: "보드 작업을 수행할 권한이 없습니다.",
  network: "보드 작업을 완료하지 못했습니다. 네트워크 연결을 확인해 주세요.",
  invalid_input: "보드 이름 또는 식별자를 확인해 주세요.",
  invite_unavailable: "초대 링크가 만료되었거나 취소 또는 이미 사용되었습니다. 보드 소유자에게 새 링크를 요청해 주세요.",
  request_failed: "보드 작업을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

export class BoardRepositoryError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.request_failed);
    this.name = "BoardRepositoryError";
    this.code = ERROR_MESSAGES[code] ? code : "request_failed";
  }
}

function toRepositoryError(error) {
  if (error instanceof BoardRepositoryError) return error;

  const code = typeof error?.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const status = Number(error?.status);

  if (status === 401 || code === "28000" || code === "PGRST301"
    || message.includes("jwt") || message.includes("not authenticated")) {
    return new BoardRepositoryError("unauthenticated");
  }
  if (status === 403 || code === "42501" || message.includes("permission denied")
    || message.includes("row-level security")) {
    return new BoardRepositoryError("forbidden");
  }
  if (code === "22023" && (message.includes("invitation") || message.includes("invite"))) {
    return new BoardRepositoryError("invite_unavailable");
  }
  if (code === "22023" || (status === 400 && message.includes("board name"))) {
    return new BoardRepositoryError("invalid_input");
  }
  if (error instanceof TypeError || message.includes("network") || message.includes("fetch")
    || message.includes("timeout") || message.includes("connection")) {
    return new BoardRepositoryError("network");
  }
  return new BoardRepositoryError("request_failed");
}

async function requireAuthenticatedUser(client) {
  if (typeof client?.auth?.getUser !== "function") {
    throw new BoardRepositoryError("request_failed");
  }

  let authResult;
  try {
    authResult = await client.auth.getUser();
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (authResult?.error) throw toRepositoryError(authResult.error);
  if (typeof authResult?.data?.user?.id !== "string" || !authResult.data.user.id) {
    throw new BoardRepositoryError("unauthenticated");
  }
}

function normalizeBoardName(name) {
  if (typeof name !== "string") throw new BoardRepositoryError("invalid_input");
  const normalized = name.trim();
  if (!normalized || Array.from(normalized).length > 60) {
    throw new BoardRepositoryError("invalid_input");
  }
  return normalized;
}

function normalizeBoardId(boardId) {
  if (typeof boardId !== "string" || !boardId.trim()) {
    throw new BoardRepositoryError("invalid_input");
  }
  return boardId.trim();
}

async function callBoardRpc(client, functionName, args, expectedId = null) {
  if (typeof client?.rpc !== "function") throw new BoardRepositoryError("request_failed");
  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client.rpc(functionName, args);
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  if (typeof result?.data !== "string" || !result.data
    || (expectedId !== null && result.data !== expectedId)) {
    throw new BoardRepositoryError("request_failed");
  }
  return result.data;
}

/**
 * Return boards visible to the signed-in user.
 * The boards SELECT policy is the authority for membership filtering: do not
 * filter owner_id here, because ordinary members must also see shared boards.
 */
export async function listBoards(client) {
  if (typeof client?.auth?.getUser !== "function" || typeof client?.from !== "function") {
    throw new BoardRepositoryError("request_failed");
  }

  await requireAuthenticatedUser(client);

  let result;
  try {
    result = await client
      .from("boards")
      .select(BOARD_COLUMNS)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true });
  } catch (error) {
    throw toRepositoryError(error);
  }

  if (result?.error) throw toRepositoryError(result.error);
  if (!Array.isArray(result?.data)) throw new BoardRepositoryError("request_failed");

  // Return only the fields requested from the database, not arbitrary response
  // properties. RLS limits these rows to boards the current user belongs to.
  return result.data.map((board) => ({
    id: board.id,
    name: board.name,
    owner_id: board.owner_id,
    created_at: board.created_at,
    updated_at: board.updated_at,
  }));
}

/** Create a board and its owner membership through the atomic database RPC. */
export async function createBoard(client, name) {
  const normalizedName = normalizeBoardName(name);
  return callBoardRpc(client, "create_board", { p_name: normalizedName });
}

/** Rename an existing board; the database RPC enforces owner authorization. */
export async function renameBoard(client, boardId, name) {
  const id = normalizeBoardId(boardId);
  const normalizedName = normalizeBoardName(name);
  return callBoardRpc(client, "rename_board", { p_board_id: id, p_name: normalizedName }, id);
}

/** Permanently delete a board; the database RPC enforces owner authorization. */
export async function deleteBoard(client, boardId) {
  const id = normalizeBoardId(boardId);
  return callBoardRpc(client, "delete_board", { p_board_id: id }, id);
}

export { toRepositoryError };
