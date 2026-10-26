function readEnvironmentValue(environment, key) {
  const value = environment?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function decodeJwtPayload(value) {
  const segments = value.split(".");
  if (segments.length < 2 || typeof globalThis.atob !== "function") return null;
  try {
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = globalThis.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function isValidPublicKey(value) {
  if (!value || /^sb_secret_/i.test(value)) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  // Accept only legacy anon JWT keys; reject service_role and arbitrary JWTs.
  return decodeJwtPayload(value)?.role === "anon";
}

/** Validate Supabase URL and browser-safe publishable/anon key configuration. */
export function resolveSupabaseConfig(environment = {}) {
  const url = readEnvironmentValue(environment, "VITE_SUPABASE_URL");
  const publicKey = readEnvironmentValue(environment, "VITE_SUPABASE_PUBLIC_KEY");

  if (!url && !publicKey) return { configured: false, state: "not-configured" };
  if (!url || !publicKey) return { configured: false, state: "incomplete" };

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { configured: false, state: "invalid" };
  }

  const secureProtocol = parsedUrl.protocol === "https:";
  const localDevelopmentUrl = parsedUrl.protocol === "http:" && isLoopbackHost(parsedUrl.hostname);
  if ((!secureProtocol && !localDevelopmentUrl)
    || !parsedUrl.hostname
    || parsedUrl.username
    || parsedUrl.password
    || parsedUrl.search
    || parsedUrl.hash
    || !isValidPublicKey(publicKey)) {
    return { configured: false, state: "invalid" };
  }

  return {
    configured: true,
    state: "configured",
    url: parsedUrl.toString(),
    publicKey,
  };
}
