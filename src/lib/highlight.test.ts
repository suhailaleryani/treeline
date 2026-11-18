import { describe, expect, it } from "vitest";
import { highlightLines, languageOf } from "./highlight";

describe("highlightLines", () => {
  it("knows languages by extension and skips unknown files", () => {
    expect(languageOf("src/a.ts")).toBe("typescript");
    expect(languageOf("Dockerfile")).toBe("bash");
    expect(languageOf("notes.xyz")).toBeNull();
    expect(highlightLines("hello", "notes.xyz")).toBeNull();
  });

  it("gives one balanced line per source line, even inside a block comment", () => {
    const lines = highlightLines("/* one\ntwo */\nconst a = 1;", "a.js")!;
    expect(lines).toHaveLength(3);
    for (const l of lines) expect((l.match(/<span/g) ?? []).length).toBe((l.match(/<\/span>/g) ?? []).length);
    expect(lines[1]).toContain("hljs-comment");
  });

  it("escapes the file's own markup", () => {
    expect(highlightLines("<script>alert(1)</script>", "a.html")!.join("")).not.toContain("<script>");
  });
});
