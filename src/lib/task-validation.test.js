import { describe, expect, it } from "vitest";
import { TASK_STATUSES, validateTaskInput } from "./task-validation.js";

describe("validateTaskInput", () => {
  it("normalizes valid title and description and applies defaults", () => {
    expect(validateTaskInput({ title: "  초안 작성  ", description: "  내용  " })).toEqual({
      valid: true,
      value: { title: "초안 작성", description: "내용", status: "todo", dueDate: null },
      errors: {},
    });
  });

  it("rejects an empty or whitespace-only title and enforces 120 Unicode characters", () => {
    expect(validateTaskInput({ title: "  " }).errors.title).toBe("업무 제목을 입력해 주세요.");
    expect(validateTaskInput({ title: "가".repeat(120) }).valid).toBe(true);
    expect(validateTaskInput({ title: "😀".repeat(121) }).errors.title).toBe("업무 제목은 120자 이내로 입력해 주세요.");
  });

  it("enforces description type and the 2,000 character boundary", () => {
    expect(validateTaskInput({ title: "ok", description: "x".repeat(2000) }).valid).toBe(true);
    expect(validateTaskInput({ title: "ok", description: "x".repeat(2001) }).errors.description).toBe("설명은 2,000자 이내로 입력해 주세요.");
    expect(validateTaskInput({ title: "ok", description: 42 }).errors.description).toBe("업무 설명을 확인해 주세요.");
  });

  it("only accepts the supported statuses", () => {
    expect(TASK_STATUSES).toEqual(["todo", "in_progress", "done"]);
    for (const status of TASK_STATUSES) expect(validateTaskInput({ title: "ok", status }).valid).toBe(true);
    expect(validateTaskInput({ title: "ok", status: "blocked" }).errors.status).toBe("진행 상태를 확인해 주세요.");
  });

  it("accepts valid date-only values and rejects malformed or impossible dates", () => {
    expect(validateTaskInput({ title: "ok", dueDate: "2024-02-29" }).value.dueDate).toBe("2024-02-29");
    expect(validateTaskInput({ title: "ok", dueDate: "2025-02-29" }).errors.dueDate).toBe("올바른 마감일을 선택해 주세요.");
    expect(validateTaskInput({ title: "ok", dueDate: "2025-13-01" }).valid).toBe(false);
    expect(validateTaskInput({ title: "ok", dueDate: "2025-1-01" }).valid).toBe(false);
    expect(validateTaskInput({ title: "ok", dueDate: null }).value.dueDate).toBeNull();
  });

  it("returns all relevant field errors without a partial value", () => {
    const result = validateTaskInput({ title: "", description: "x".repeat(2001), status: "bad", dueDate: "yesterday" });
    expect(result.valid).toBe(false);
    expect(result.value).toBeNull();
    expect(Object.keys(result.errors)).toEqual(["title", "description", "status", "dueDate"]);
  });
});
