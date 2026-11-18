import { describe, expect, it } from "vitest";
import { buildPatch, canSelectLines, countChanges, parseDiff, splitRows, type DiffLine } from "./diff";

const DIFF = [
  "diff --git a/f.txt b/f.txt",
  "index 111..222 100644",
  "--- a/f.txt",
  "+++ b/f.txt",
  "@@ -1,4 +1,5 @@ fn main",
  " one",
  "-two",
  "+TWO",
  "+extra",
  " three",
  " four",
].join("\n");

describe("parseDiff", () => {
  it("parses header, hunk and line numbers", () => {
    const d = parseDiff(DIFF + "\n");
    expect(d.header).toHaveLength(4);
    expect(d.hunks).toHaveLength(1);
    const h = d.hunks[0];
    expect(h.context).toBe("fn main");
    expect(h.lines.map((l) => [l.type, l.oldNo, l.newNo])).toEqual([
      ["ctx", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
      ["add", null, 3],
      ["ctx", 3, 4],
      ["ctx", 4, 5],
    ]);
    expect(countChanges(d)).toEqual({ added: 2, removed: 1 });
  });

  it("flags binary files and handles empty input", () => {
    expect(parseDiff("Binary files a/x and b/x differ").binary).toBe(true);
    expect(parseDiff("").hunks).toEqual([]);
  });

  it("keeps the no-newline marker on the previous line", () => {
    const d = parseDiff("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n");
    expect(d.hunks[0].lines[0].noNewline).toBe(true);
  });
});

describe("buildPatch", () => {
  const d = parseDiff(DIFF);

  it("returns the whole hunk when nothing is selected explicitly", () => {
    const p = buildPatch(d, 0, null, false)!;
    expect(p).toContain("@@ -1,4 +1,5 @@");
    expect(p).toContain("+TWO");
    expect(p.endsWith("\n")).toBe(true);
  });

  it("stages a subset: unselected '+' dropped, unselected '-' kept as context", () => {
    // select only the "+TWO" line (index 2)
    const p = buildPatch(d, 0, new Set([2]), false)!;
    expect(p).toContain("+TWO");
    expect(p).not.toContain("+extra");
    expect(p).toContain(" two"); // the unselected deletion stays as context
    expect(p).toContain("@@ -1,4 +1,5 @@");
  });

  it("reverse: unselected '+' becomes context and unselected '-' is dropped", () => {
    // unstage only "+extra" (index 3)
    const p = buildPatch(d, 0, new Set([3]), true)!;
    expect(p).toContain("+extra");
    expect(p).toContain(" TWO");
    expect(p).not.toContain("-two");
  });

  it("returns null when the selection has no changes", () => {
    expect(buildPatch(d, 0, new Set([0]), false)).toBeNull();
    expect(buildPatch(d, 5, null, false)).toBeNull();
  });
});

describe("no-newline hunks", () => {
  const d = parseDiff(
    ["@@ -1,2 +1,4 @@", " a", "-b", "\\ No newline at end of file", "+b", "+c", "+d", ""].join("\n"),
  );
  it("refuses partial line selection but allows the whole hunk", () => {
    expect(canSelectLines(d.hunks[0])).toBe(false);
    expect(buildPatch(d, 0, new Set([3]), false)).toBeNull();
    expect(buildPatch(d, 0, null, false)).not.toBeNull();
  });
});

describe("splitRows", () => {
  const line = (type: "ctx" | "add" | "del", text: string): DiffLine => ({ type, text, oldNo: null, newNo: null });
  it("puts an unchanged line on both sides and pairs removed lines with the added ones after them", () => {
    const rows = splitRows([line("ctx", "a"), line("del", "b"), line("del", "c"), line("add", "B"), line("ctx", "d")]);
    expect(rows.map((r) => [r.left?.line.text ?? null, r.right?.line.text ?? null])).toEqual([["a", "a"], ["b", "B"], ["c", null], ["d", "d"]]);
    expect(rows[1].left?.idx).toBe(1);
    expect(rows[1].right?.idx).toBe(3);
  });
  it("leaves the old side empty for lines that were only added", () => {
    const rows = splitRows([line("add", "x"), line("add", "y")]);
    expect(rows.map((r) => [r.left, r.right?.line.text])).toEqual([[null, "x"], [null, "y"]]);
  });
});
