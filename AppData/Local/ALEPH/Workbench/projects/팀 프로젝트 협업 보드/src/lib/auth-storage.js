const LEGACY_TASKS_KEY = "teamboard.tasks.v1";

/** Authenticated users receive a browser-local namespace, not a shared data store. */
export function getLocalDataKeys(userId) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) {
    return {
      storageKey: "teamboard.data.v1",
      legacyTasksKey: LEGACY_TASKS_KEY,
    };
  }

  return {
    storageKey: `teamboard.data.v1.auth.${encodeURIComponent(normalizedUserId)}`,
    // Never import the old, unscoped prototype data into an authenticated account.
    legacyTasksKey: null,
  };
}
