import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import powershell from "highlight.js/lib/languages/powershell";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = { bash, c, cpp, csharp, css, go, ini, java, javascript, json, kotlin, markdown, php, powershell, python, ruby, rust, scss, sql, swift, typescript, xml, yaml };
for (const [name, def] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, def);

const BY_EXTENSION: Record<string, string> = {
  sh: "bash", bash: "bash", zsh: "bash",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp",
  cs: "csharp",
  css: "css", scss: "scss",
  go: "go",
  ini: "ini", toml: "ini", cfg: "ini", conf: "ini", properties: "ini",
  java: "java",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "json",
  kt: "kotlin", kts: "kotlin",
  md: "markdown", markdown: "markdown",
  php: "php",
  ps1: "powershell", psm1: "powershell",
  py: "python", pyw: "python",
  rb: "ruby",
  rs: "rust",
  sql: "sql",
  swift: "swift",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  html: "xml", htm: "xml", xml: "xml", svg: "xml", xaml: "xml", csproj: "xml", vue: "xml",
  yml: "yaml", yaml: "yaml",
};

/** The highlight language for a file name, or null when it is not one we colour. */
export function languageOf(file: string): string | null {
  const name = file.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile" || name === ".gitignore") return name === "dockerfile" ? "bash" : null;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? null : (BY_EXTENSION[name.slice(dot + 1)] ?? null);
}

/** Files above this size are shown plain: colouring them would freeze the window. */
const MAX_CHARS = 400_000;

/**
 * The file's lines as HTML, coloured by language, one string per line. Each line is self-contained: a token that
 * runs over several lines (a block comment) is closed at the end of a line and reopened on the next. Null when
 * the language is unknown, the file is too big or colouring fails; the caller then shows plain text.
 */
export function highlightLines(text: string, file: string): string[] | null {
  const language = languageOf(file);
  if (!language || text.length > MAX_CHARS) return null;
  try {
    const html = hljs.highlight(text.replace(/\r\n/g, "\n"), { language, ignoreIllegals: true }).value;
    const lines: string[] = [];
    let open: string[] = []; // the opening tags still unclosed at the end of the previous line
    for (const raw of html.split("\n")) {
      const line = open.join("") + raw;
      for (const tag of raw.matchAll(/<span[^>]*>|<\/span>/g)) {
        if (tag[0] === "</span>") open.pop();
        else open.push(tag[0]);
      }
      lines.push(line + "</span>".repeat(open.length));
    }
    return lines;
  } catch {
    return null;
  }
}
