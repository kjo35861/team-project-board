export const TASK_STATUSES = Object.freeze(["todo", "in_progress", "done"]);

const STATUS_SET = new Set(TASK_STATUSES);

function characterLength(value) {
  return Array.from(value).length;
}

/** Validate and normalize task form fields before any repository request. */
export function validateTaskInput(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const errors = {};

  const rawTitle = source.title;
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (!title) {
    errors.title = "업무 제목을 입력해 주세요.";
  } else if (characterLength(title) > 120) {
    errors.title = "업무 제목은 120자 이내로 입력해 주세요.";
  }

  const rawDescription = source.description ?? "";
  let description = "";
  if (typeof rawDescription !== "string") {
    errors.description = "업무 설명을 확인해 주세요.";
  } else {
    description = rawDescription.trim();
    if (characterLength(description) > 2000) {
      errors.description = "설명은 2,000자 이내로 입력해 주세요.";
    }
  }

  const status = source.status ?? "todo";
  if (typeof status !== "string" || !STATUS_SET.has(status)) {
    errors.status = "진행 상태를 확인해 주세요.";
  }

  const rawDueDate = source.dueDate ?? "";
  let dueDate = null;
  if (rawDueDate !== "") {
    if (typeof rawDueDate !== "string" || !isCalendarDate(rawDueDate)) {
      errors.dueDate = "올바른 마감일을 선택해 주세요.";
    } else {
      dueDate = rawDueDate;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    value: valid ? { title, description, status, dueDate } : null,
    errors,
  };
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}
