const SESSION_KEY = "teamboard.pending-invite.v1";
const TOKEN_PATTERN = /^[0-9a-f]{128}$/;

function validToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Capture a bearer invite into tab-scoped storage, then remove it from the URL. */
export function captureInviteLink({
  href = globalThis.location?.href,
  storage = globalThis.sessionStorage,
  history = globalThis.history,
} = {}) {
  if (typeof href !== "string") return { status: "none", token: null };
  let url;
  try {
    url = new URL(href);
  } catch {
    return { status: "invalid", token: null };
  }

  const values = url.searchParams.getAll("invite");
  if (values.length) {
    const token = values.length === 1 ? values[0] : "";
    try {
      if (validToken(token)) storage?.setItem(SESSION_KEY, token);
      else storage?.removeItem(SESSION_KEY);
    } catch {
      if (validToken(token)) return { status: "storage_error", token: null };
    }
    url.searchParams.delete("invite");
    try {
      history?.replaceState?.(history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Storage is the durable-in-tab handoff; retaining the URL is not required
      // for app operation, but the UI still avoids printing the token.
    }
    if (!validToken(token)) return { status: "invalid", token: null };
    return { status: "captured", token };
  }

  try {
    const token = storage?.getItem(SESSION_KEY) || "";
    if (validToken(token)) return { status: "restored", token };
    if (token) storage?.removeItem(SESSION_KEY);
  } catch {
    return { status: "storage_error", token: null };
  }
  return { status: "none", token: null };
}

export function clearPendingInvite(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isValidInviteToken(token) {
  return validToken(token);
}
