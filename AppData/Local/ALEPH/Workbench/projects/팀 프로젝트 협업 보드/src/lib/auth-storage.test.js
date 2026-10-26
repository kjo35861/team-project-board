import { describe, expect, it } from "vitest";
import { getLocalDataKeys } from "./auth-storage.js";

describe("getLocalDataKeys", () => {
  it("preserves legacy local prototype keys when unauthenticated", () => {
    expect(getLocalDataKeys()).toEqual({
      storageKey: "teamboard.data.v1",
      legacyTasksKey: "teamboard.tasks.v1",
    });
  });

  it("namespaces local data by authenticated user without importing unscoped tasks", () => {
    expect(getLocalDataKeys("user/id one")).toEqual({
      storageKey: "teamboard.data.v1.auth.user%2Fid%20one",
      legacyTasksKey: null,
    });
  });

  it("treats blank IDs as unauthenticated", () => {
    expect(getLocalDataKeys("  ")).toEqual({
      storageKey: "teamboard.data.v1",
      legacyTasksKey: "teamboard.tasks.v1",
    });
  });
});
