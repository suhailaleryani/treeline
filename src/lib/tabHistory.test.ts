import { describe, expect, it } from "vitest";
import { noteActive, tabAfterClose } from "./tabHistory";

describe("tabHistory", () => {
  it("moves a re-activated tab to the end", () => {
    expect(noteActive(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  });
  it("returns to the previously active tab, not the next one", () => {
    // tabs a, sub-of-a (b), c: a was active, b opened from it, b closed
    expect(tabAfterClose(["a", "b"], ["a", "c"], "b", 1)).toBe("a");
  });
  it("skips tabs that no longer exist", () => {
    expect(tabAfterClose(["x", "b"], ["a", "c"], "b", 1)).toBe("c");
  });
  it("falls back to the neighbour, and to null when nothing is left", () => {
    expect(tabAfterClose([], ["a", "c"], "b", 1)).toBe("c");
    expect(tabAfterClose([], [], "b", 0)).toBeNull();
  });
});
