import { describe, expect, it } from "vitest";
import { isEmailVerified } from "./auth-policy.js";

describe("isEmailVerified", () => {
  it("accepts either Supabase confirmation timestamp", () => {
    expect(isEmailVerified({ email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isEmailVerified({ confirmed_at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("rejects missing, null, or unconfirmed users", () => {
    expect(isEmailVerified(null)).toBe(false);
    expect(isEmailVerified(undefined)).toBe(false);
    expect(isEmailVerified({ email: "member@example.com", email_confirmed_at: null, confirmed_at: null })).toBe(false);
  });
});
