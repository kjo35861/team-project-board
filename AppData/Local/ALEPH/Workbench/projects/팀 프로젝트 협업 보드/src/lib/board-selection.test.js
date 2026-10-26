import { describe, expect, it, vi } from "vitest";
import { createBoardSelection } from "./board-selection.js";

describe("createBoardSelection", () => {
  it("selects the first available board and maintains an explicit selection", () => {
    const onChange = vi.fn();
    const selection = createBoardSelection({ onChange });
    const first = { id: "a", name: "A" };
    const second = { id: "b", name: "B" };
    expect(selection.update([first, second])).toMatchObject({ board: first, changed: true, revision: 1 });
    expect(selection.select("b")).toMatchObject({ board: second, changed: true, revision: 2, valid: true });
    expect(selection.isCurrent("b", 2)).toBe(true);
    expect(selection.isCurrent("b", 1)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("retains an available current board and falls back only after it disappears", () => {
    const selection = createBoardSelection();
    selection.update([{ id: "a", name: "A" }, { id: "b", name: "B" }]);
    selection.select("b");
    expect(selection.update([{ id: "a", name: "Renamed" }, { id: "b", name: "B" }]))
      .toMatchObject({ board: { id: "b" }, changed: false });
    expect(selection.update([{ id: "a", name: "A" }]))
      .toMatchObject({ board: { id: "a" }, changed: true, revision: 3 });
  });

  it("clears a removed board and rejects selections outside the latest list", () => {
    const selection = createBoardSelection();
    selection.update([{ id: "a", name: "A" }]);
    selection.update([]);
    expect(selection.getActive()).toBeNull();
    expect(selection.select("a").valid).toBe(false);
    expect(selection.isCurrent(null)).toBe(true);
  });
});
