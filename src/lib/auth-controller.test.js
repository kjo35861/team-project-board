import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthController, getAuthMessage, mountConfigurationScreen } from "./auth-controller.js";

function createClient(session = null) {
  let authCallback;
  const methods = {
    signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
    onAuthStateChange: vi.fn((callback) => { authCallback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  };
  return { auth: methods, emit: (event, nextSession) => authCallback?.(event, nextSession) };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("auth controller", () => {
  beforeEach(() => { document.body.innerHTML = '<div class="app-shell" hidden></div>'; });

  it("does not reveal board for unconfirmed restored sessions", async () => {
    const client = createClient({ user: { id: "u1", email: "person@example.com" } });
    const onAuthenticated = vi.fn();
    createAuthController({ client, onAuthenticated });
    await tick();
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(document.querySelector("#auth-confirmation-panel").hidden).toBe(false);
  });

  it("opens board only for verified sessions and hides it after sign out", async () => {
    const client = createClient({ user: { id: "u1", email: "person@example.com", email_confirmed_at: "2026-01-01" } });
    const onAuthenticated = vi.fn(); const onUnauthenticated = vi.fn();
    createAuthController({ client, onAuthenticated, onUnauthenticated });
    await tick();
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
    client.emit("SIGNED_OUT", null);
    await tick();
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("renders explicit setup guidance without a board fallback", () => {
    const screen = mountConfigurationScreen("not-configured");
    expect(screen.querySelector("#auth-config-panel").hidden).toBe(false);
    expect(screen.querySelector("#auth-form-panel").hidden).toBe(true);
    expect(document.querySelector(".app-shell").hidden).toBe(true);
  });

  it("maps common Supabase auth failures to actionable Korean messages", () => {
    expect(getAuthMessage({ code: "invalid_credentials" })).toContain("이메일 또는 비밀번호");
    expect(getAuthMessage({ message: "Failed to fetch" })).toContain("네트워크");
  });
});
