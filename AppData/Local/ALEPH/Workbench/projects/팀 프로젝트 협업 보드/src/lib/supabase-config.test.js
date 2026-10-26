import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "./supabase-config.js";

const URL = "https://example.supabase.co";
const PUBLIC_KEY = "sb_publishable_test123";
const LEGACY_ANON_KEY = "header.eyJyb2xlIjoiYW5vbiJ9.signature";

describe("resolveSupabaseConfig", () => {
  it("returns unconfigured when public settings are missing", () => {
    expect(resolveSupabaseConfig({})).toEqual({ configured: false, state: "not-configured" });
  });
  it("does not enable the client when only one setting is supplied", () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: URL })).toEqual({ configured: false, state: "incomplete" });
  });
  it("rejects invalid URLs, insecure remote HTTP, embedded credentials, query and fragment", () => {
    for (const url of ["ftp://example.supabase.co", "http://example.supabase.co", "https://user:password@example.supabase.co", `${URL}?token=x`, `${URL}#fragment`]) {
      expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLIC_KEY: PUBLIC_KEY })).toEqual({ configured: false, state: "invalid" });
    }
  });
  it("allows HTTP only for local development", () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLIC_KEY: PUBLIC_KEY })).toMatchObject({ configured: true, state: "configured" });
  });
  it("accepts publishable keys and legacy anon JWT keys", () => {
    for (const key of [PUBLIC_KEY, LEGACY_ANON_KEY]) expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLIC_KEY: key })).toMatchObject({ configured: true, state: "configured" });
  });
  it("rejects secret, service_role, malformed and arbitrary keys", () => {
    for (const key of ["sb_secret_do-not-use-in-browser", "header.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature", "public-test-key", "sb_publishable_", "header.not-base64.signature"]) {
      expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLIC_KEY: key })).toEqual({ configured: false, state: "invalid" });
    }
  });
  it("returns parsed URL and supplied public key", () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_URL: URL, VITE_SUPABASE_PUBLIC_KEY: PUBLIC_KEY })).toEqual({ configured: true, state: "configured", url: `${URL}/`, publicKey: PUBLIC_KEY });
  });
});
