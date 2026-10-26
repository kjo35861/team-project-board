import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureInviteLink, clearPendingInvite, isValidInviteToken } from "./invite-link-session.js";

const TOKEN = "b".repeat(128);
const KEY = "teamboard.pending-invite.v1";

function storage() {
  const values = new Map();
  return {
    values,
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

describe("invite link session", () => {
  it("captures a valid token into tab storage and removes it from the URL", () => {
    const store = storage();
    const replaceState = vi.fn();
    const history = { state: { key: "state" }, replaceState };
    const result = captureInviteLink({
      href: `https://example.test/path?foo=bar&invite=${TOKEN}#main`,
      storage: store,
      history,
    });
    expect(result).toEqual({ status: "captured", token: TOKEN });
    expect(store.setItem).toHaveBeenCalledWith(KEY, TOKEN);
    expect(replaceState).toHaveBeenCalledWith({ key: "state" }, "", "/path?foo=bar#main");
  });

  it("restores a pending invite after authentication redirect without putting it in local storage", () => {
    const store = storage();
    store.setItem(KEY, TOKEN);
    expect(captureInviteLink({ href: "https://example.test/", storage: store, history: {} }))
      .toEqual({ status: "restored", token: TOKEN });
    expect([...store.values.keys()]).toEqual([KEY]);
  });

  it("rejects malformed or duplicated tokens and clears an older pending token", () => {
    const store = storage();
    store.setItem(KEY, TOKEN);
    expect(captureInviteLink({ href: "https://example.test/?invite=short", storage: store, history: {} }))
      .toEqual({ status: "invalid", token: null });
    expect(store.getItem(KEY)).toBeNull();
    expect(captureInviteLink({ href: `https://example.test/?invite=${TOKEN}&invite=${TOKEN}`, storage: store, history: {} }))
      .toEqual({ status: "invalid", token: null });
  });

  it("reports storage failures without returning the bearer token", () => {
    const broken = { setItem: () => { throw new Error("blocked"); }, removeItem: () => {} };
    expect(captureInviteLink({ href: `https://example.test/?invite=${TOKEN}`, storage: broken, history: {} }))
      .toEqual({ status: "storage_error", token: null });
  });

  it("clears tab state and validates exact token format", () => {
    const store = storage();
    store.setItem(KEY, TOKEN);
    expect(clearPendingInvite(store)).toBe(true);
    expect(store.getItem(KEY)).toBeNull();
    expect(isValidInviteToken(TOKEN)).toBe(true);
    expect(isValidInviteToken(TOKEN.toUpperCase())).toBe(false);
  });
});
