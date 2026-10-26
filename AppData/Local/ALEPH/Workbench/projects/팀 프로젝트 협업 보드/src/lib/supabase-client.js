import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseConfig } from "./supabase-config.js";

export const supabaseConfig = resolveSupabaseConfig(import.meta.env);

// Without valid configuration the app shows setup guidance, never a local auth bypass.
export const supabaseClient = supabaseConfig.configured
  ? createClient(supabaseConfig.url, supabaseConfig.publicKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    })
  : null;
