import { listBoards } from "./board-repository.js";

/**
 * Coordinate the remote board-list loading states without coupling the request
 * lifecycle to a specific DOM implementation. Only one ordinary request may
 * be active; forced refreshes supersede older requests so stale snapshots are
 * ignored after a write or disposal.
 */
export function createBoardListController({ client, render, repository = listBoards }) {
  if (typeof render !== "function" || typeof repository !== "function") {
    throw new TypeError("A renderer and board-list repository are required.");
  }

  let pendingRequest = null;
  let requestVersion = 0;
  let disposed = false;

  async function load(force = false) {
    if (disposed) return { status: "disposed" };
    if (pendingRequest && !force) return pendingRequest;

    const version = ++requestVersion;
    render({ status: "loading", boards: [] });

    const request = (async () => {
      try {
        const boards = await repository(client);
        if (!Array.isArray(boards)) throw new TypeError("Invalid board-list response.");
        if (disposed || version !== requestVersion) return { status: "stale" };
        const status = boards.length ? "success" : "empty";
        render({ status, boards });
        return { status, boards };
      } catch {
        if (disposed || version !== requestVersion) return { status: "stale" };
        // Do not pass raw database/network errors to the UI.
        render({ status: "error", boards: [] });
        return { status: "error", boards: [] };
      } finally {
        if (version === requestVersion) pendingRequest = null;
      }
    })();

    pendingRequest = request;
    return request;
  }

  function dispose() {
    disposed = true;
    requestVersion += 1;
    pendingRequest = null;
  }

  return {
    load: () => load(false),
    retry: () => load(false),
    refresh: () => load(true),
    dispose,
  };
}
