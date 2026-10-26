/** Supabase email-auth policy checks used before the local prototype UI is shown. */
export function isEmailVerified(user) {
  return Boolean(user && (user.email_confirmed_at || user.confirmed_at));
}
