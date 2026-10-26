import { describe, expect, it, vi } from "vitest";
import {
  BoardRepositoryError,
  createBoard,
  deleteBoard,
  listBoards,
  renameBoard,
} from "./board-repository.js";

function makeClient({ user = { id: "user-1" }, authError = null, queryResult = { data: [], error: null }, queryError = null } = {}) {
  const order = vi.fn();
  const select = vi.fn();
  const from = vi.fn();
  const builder = {
    then(resolve, reject) {
      return queryError
        ? Promise.reject(queryError).then(resolve, reject)
        : Promise.resolve(queryResult).then(resolve, reject);
    },
  };
  order.mockImplementation(() => builder);
  select.mockImplementation(() => builder);
  from.mockImplementation(() => builder);

  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: authError }) },
      from,
    },
    from,
    select,
    order,
  };
}

function makeRpcClient({ user = { id: "user-1" }, authError = null, rpcResult = { data: "board-1", error: null }, rpcError = null } = {}) {
  const rpc = vi.fn().mockImplementation(() => {
    if (rpcError) return Promise.reject(rpcError);
    return Promise.resolve(rpcResult);
  });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: authError });
  return { client: { auth: { getUser }, rpc }, getUser, rpc };
}

describe("listBoards", () => {
  it("queries visible boards only after confirming an authenticated user", async () => {
    const boards = [
      { id: "b1", name: "Shared board", owner_id: "other-user", created_at: "2026-01-01", updated_at: "2026-01-02", secret: "discard" },
    ];
    const setup = makeClient({ queryResult: { data: boards, error: null } });

    await expect(listBoards(setup.client)).resolves.toEqual([
      { id: "b1", name: "Shared board", owner_id: "other-user", created_at: "2026-01-01", updated_at: "2026-01-02" },
    ]);
    expect(setup.from).toHaveBeenCalledOnce();
    expect(setup.from).toHaveBeenCalledWith("boards");
    expect(setup.select).toHaveBeenCalledWith("id,name,owner_id,created_at,updated_at");
    expect(setup.order).toHaveBeenNthCalledWith(1, "updated_at", { ascending: false });
    expect(setup.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("never queries boards without a verified current user", async () => {
    const setup = makeClient({ user: null });

    await expect(listBoards(setup.client)).rejects.toMatchObject({
      name: "BoardRepositoryError",
      code: "unauthenticated",
    });
    expect(setup.from).not.toHaveBeenCalled();
  });

  it("maps access, network, and unknown failures to safe Korean errors", async () => {
    const forbidden = makeClient({ queryError: { code: "42501", message: "permission denied" } });
    await expect(listBoards(forbidden.client)).rejects.toBeInstanceOf(BoardRepositoryError);
    await expect(listBoards(forbidden.client)).rejects.toMatchObject({ code: "forbidden" });

    const network = makeClient({ queryError: new TypeError("Failed to fetch") });
    await expect(listBoards(network.client)).rejects.toMatchObject({ code: "network" });

    const unknown = makeClient({ queryResult: { data: null, error: { code: "XX000", message: "internal" } } });
    await expect(listBoards(unknown.client)).rejects.toMatchObject({ code: "request_failed" });
  });

  it("maps auth lookup errors and rejects malformed query data", async () => {
    const authFailure = makeClient({ authError: { status: 401 } });
    await expect(listBoards(authFailure.client)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(authFailure.from).not.toHaveBeenCalled();

    const malformed = makeClient({ queryResult: { data: null, error: null } });
    await expect(listBoards(malformed.client)).rejects.toMatchObject({ code: "request_failed" });
  });
});

describe("board management RPC repository functions", () => {
  it("creates a board with a trimmed name and returns the server identifier", async () => {
    const setup = makeRpcClient({ rpcResult: { data: "new-board", error: null } });
    await expect(createBoard(setup.client, "  Planning  ")).resolves.toBe("new-board");
    expect(setup.getUser).toHaveBeenCalledOnce();
    expect(setup.rpc).toHaveBeenCalledOnce();
    expect(setup.rpc).toHaveBeenCalledWith("create_board", { p_name: "Planning" });
  });

  it("renames a board only through the RPC and requires its returned id to match", async () => {
    const setup = makeRpcClient({ rpcResult: { data: "board-7", error: null } });
    await expect(renameBoard(setup.client, "board-7", "  New name  ")).resolves.toBe("board-7");
    expect(setup.rpc).toHaveBeenCalledWith("rename_board", { p_board_id: "board-7", p_name: "New name" });

    const mismatched = makeRpcClient({ rpcResult: { data: "different-board", error: null } });
    await expect(renameBoard(mismatched.client, "board-7", "New name")).rejects.toMatchObject({ code: "request_failed" });
  });

  it("deletes a board only through the RPC and requires the deleted id in response", async () => {
    const setup = makeRpcClient({ rpcResult: { data: "board-9", error: null } });
    await expect(deleteBoard(setup.client, "board-9")).resolves.toBe("board-9");
    expect(setup.rpc).toHaveBeenCalledWith("delete_board", { p_board_id: "board-9" });

    const malformed = makeRpcClient({ rpcResult: { data: null, error: null } });
    await expect(deleteBoard(malformed.client, "board-9")).rejects.toMatchObject({ code: "request_failed" });
  });

  it("validates board names and identifiers without sending a request", async () => {
    const setup = makeRpcClient();
    for (const name of ["", "   ", "x".repeat(61), null]) {
      await expect(createBoard(setup.client, name)).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(renameBoard(setup.client, "board-1", " ")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(renameBoard(setup.client, " ", "Valid")).rejects.toMatchObject({ code: "invalid_input" });
    await expect(deleteBoard(setup.client, "")).rejects.toMatchObject({ code: "invalid_input" });
    expect(setup.getUser).not.toHaveBeenCalled();
    expect(setup.rpc).not.toHaveBeenCalled();
  });

  it("does not call a write RPC without a verified user", async () => {
    const unauthenticated = makeRpcClient({ user: null });
    await expect(createBoard(unauthenticated.client, "Planning")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(unauthenticated.rpc).not.toHaveBeenCalled();

    const authError = makeRpcClient({ authError: { status: 401 } });
    await expect(deleteBoard(authError.client, "board-1")).rejects.toMatchObject({ code: "unauthenticated" });
    expect(authError.rpc).not.toHaveBeenCalled();
  });

  it("maps RPC authorization, validation, network, and unknown errors safely", async () => {
    const forbidden = makeRpcClient({ rpcResult: { data: null, error: { code: "42501", message: "permission denied" } } });
    await expect(renameBoard(forbidden.client, "board-1", "Name")).rejects.toMatchObject({ code: "forbidden" });

    const invalid = makeRpcClient({ rpcResult: { data: null, error: { code: "22023", message: "invalid input" } } });
    await expect(createBoard(invalid.client, "Name")).rejects.toMatchObject({ code: "invalid_input" });

    const network = makeRpcClient({ rpcError: new TypeError("Failed to fetch") });
    await expect(deleteBoard(network.client, "board-1")).rejects.toMatchObject({ code: "network" });

    const unknown = makeRpcClient({ rpcResult: { data: null, error: { code: "XX000", message: "internal" } } });
    const error = await createBoard(unknown.client, "Name").catch((caught) => caught);
    expect(error).toMatchObject({ code: "request_failed" });
    expect(error.message).not.toContain("internal");
  });
});
