export type LineType = "ctx" | "add" | "del";

export interface DiffLine {
  type: LineType;
  text: string;
  oldNo: number | null;
  newNo: number | null;
  /** True when the line is followed by "\ No newline at end of file". */
  noNewline?: boolean;
}

export interface Hunk {
  header: string;
  oldStart: number;
  newStart: number;
  /** Text after the second "@@" (usually the enclosing function). */
  context: string;
  lines: DiffLine[];
}

export interface ParsedDiff {
  /** Everything before the first hunk ("diff --git", "index", "---", "+++" …). */
  header: string[];
  hunks: Hunk[];
  binary: boolean;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

export function parseDiff(text: string): ParsedDiff {
  const out: ParsedDiff = { header: [], hunks: [], binary: false };
  if (!text) return out;
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of lines) {
    const m = HUNK_RE.exec(raw);
    if (m) {
      hunk = { header: raw, oldStart: +m[1], newStart: +m[2], context: m[3], lines: [] };
      oldNo = hunk.oldStart;
      newNo = hunk.newStart;
      out.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      if (raw.startsWith("Binary files") || raw.startsWith("GIT binary patch")) out.binary = true;
      out.header.push(raw);
      continue;
    }
    const prev = hunk.lines[hunk.lines.length - 1];
    if (raw.startsWith("\\")) {
      if (prev) prev.noNewline = true;
      continue;
    }
    const c = raw[0];
    if (c === "+") hunk.lines.push({ type: "add", text: raw.slice(1), oldNo: null, newNo: newNo++ });
    else if (c === "-") hunk.lines.push({ type: "del", text: raw.slice(1), oldNo: oldNo++, newNo: null });
    else hunk.lines.push({ type: "ctx", text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
  }
  return out;
}

export function isChange(l: DiffLine): boolean {
  return l.type !== "ctx";
}

/**
 * Builds a patch for one hunk, optionally limited to `selected` line indices (into `hunk.lines`).
 *
 * - `reverse = false` (staging from an unstaged diff): unselected additions are dropped and
 *   unselected deletions become context.
 * - `reverse = true` (unstaging, or discarding, applied with `git apply --reverse`): unselected
 *   additions become context and unselected deletions are dropped.
 *
 * Returns null when the selection contains no change.
 */
export function buildPatch(
  diff: ParsedDiff,
  hunkIndex: number,
  selected: ReadonlySet<number> | null,
  reverse: boolean,
): string | null {
  const hunk = diff.hunks[hunkIndex];
  if (!hunk) return null;
  // Splitting a hunk that carries " No newline at end of file" would glue lines together.
  if (selected !== null && canSelectLines(hunk) === false) return null;
  const body: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let changes = 0;

  hunk.lines.forEach((l, i) => {
    const picked = selected === null || selected.has(i);
    let type: LineType | null = l.type;
    if (l.type === "add" && !picked) type = reverse ? "ctx" : null;
    if (l.type === "del" && !picked) type = reverse ? null : "ctx";
    if (type === null) return;
    if (type !== "ctx") changes++;
    const prefix = type === "add" ? "+" : type === "del" ? "-" : " ";
    body.push(prefix + l.text);
    if (l.noNewline) body.push("\\ No newline at end of file");
    if (type !== "add") oldCount++;
    if (type !== "del") newCount++;
  });
  if (changes === 0) return null;

  // Git recounts, so only the start line matters; use the side that is being matched.
  const start = reverse ? hunk.newStart : hunk.oldStart;
  const header = `@@ -${start},${oldCount} +${start},${newCount} @@`;
  return [...diff.header, header, ...body].join("\n") + "\n";
}

/** Line-level selection is unsafe in a hunk that has a "no newline at end of file" marker. */
export function canSelectLines(hunk: Hunk): boolean {
  return !hunk.lines.some((l) => l.noNewline);
}

export function countChanges(diff: ParsedDiff): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of diff.hunks)
    for (const l of h.lines) {
      if (l.type === "add") added++;
      else if (l.type === "del") removed++;
    }
  return { added, removed };
}

/** One row of a side-by-side diff: the old line on the left, the new line on the right (either may be empty). */
export interface SplitRow {
  left: { line: DiffLine; idx: number } | null;
  right: { line: DiffLine; idx: number } | null;
}

/**
 * Lays a hunk's lines out in two columns. An unchanged line shows on both sides; a run of removed lines is set beside
 * the run of added lines that follows it, and the shorter side is padded with empty cells. `idx` is the line's position
 * in `lines`, so a click on a cell can select the same line as in the one-column view.
 */
export function splitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type === "ctx") {
      rows.push({ left: { line: lines[i], idx: i }, right: { line: lines[i], idx: i } });
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (i < lines.length && lines[i].type === "del") dels.push(i++);
    while (i < lines.length && lines[i].type === "add") adds.push(i++);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      rows.push({
        left: k < dels.length ? { line: lines[dels[k]], idx: dels[k] } : null,
        right: k < adds.length ? { line: lines[adds[k]], idx: adds[k] } : null,
      });
    }
  }
  return rows;
}
