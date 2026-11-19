import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { api, errorMessage } from "../api";

/**
 * The live terminals, kept outside React. A terminal's shell and xterm view must survive its panel being moved
 * between the bottom and the right (which remounts the React component), so they belong to this registry and are
 * only ended by `disposeTerminal`. A component just attaches the view to whatever element it currently has.
 */
interface Entry {
  term: Terminal;
  fit: FitAddon;
  path: string;
  session: number | null;
  starting: boolean;
  disposed: boolean;
  opened: boolean;
}

const entries = new Map<number, Entry>();
const bySession = new Map<number, Entry>();
/** Output and exits that arrive before `term_open` has returned the session id. */
const early = new Map<number, string[]>();
const earlyExit = new Set<number>();
/** Sessions we ended ourselves; their late events are ignored. */
const retired = new Set<number>();
let wired = false;

/**
 * The terminal's dark colours: the dark theme's own (`--bg`, `--text`, `--accent`, `--accent-soft` in App.css), with
 * xterm's default ANSI palette, which is made for a dark background. Used on the dark theme, and on every theme when
 * "Always dark" is on. Keep the background in step with `[data-terminal-dark]` in App.css.
 */
const DARK_THEME = {
  background: "#0f1115",
  foreground: "#e9ebf1",
  cursor: "#6b97ff",
  cursorAccent: "#0f1115",
  selectionBackground: "rgba(107, 151, 255, 0.3)",
};

const ALWAYS_DARK_KEY = "terminal-always-dark";

/** Whether the terminal stays dark on the light theme (Settings → Appearance). Off unless chosen. */
export function loadTerminalAlwaysDark(): boolean {
  try {
    return localStorage.getItem(ALWAYS_DARK_KEY) === "1";
  } catch {
    return false;
  }
}

let alwaysDark = loadTerminalAlwaysDark();

/** Marks the page so the CSS around the terminal (padding, scrollbar) matches its colours. */
function markPage() {
  document.documentElement.toggleAttribute("data-terminal-dark", alwaysDark);
}
markPage();

/** Turns "Always dark" on or off, remembers it, and recolours every open terminal at once. */
export function setTerminalAlwaysDark(on: boolean): void {
  alwaysDark = on;
  try {
    localStorage.setItem(ALWAYS_DARK_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts until the app closes */
  }
  markPage();
  applyTerminalTheme();
}

/** The 16 ANSI colours for a light background: xterm's defaults (yellow, white, cyan, bright) vanish on white. */
const LIGHT_ANSI = {
  black: "#1f2328", red: "#c0262d", green: "#17702f", yellow: "#8a5a00",
  blue: "#0b57d0", magenta: "#a01ea8", cyan: "#0e7490", white: "#4b5563",
  brightBlack: "#57606a", brightRed: "#a40e26", brightGreen: "#116329", brightYellow: "#7a4d00",
  brightBlue: "#0a3fa0", brightMagenta: "#8a1a92", brightCyan: "#0b5f75", brightWhite: "#374151",
};

/** True when the page shows the light theme: an explicit choice, or "system" on a light OS. */
function lightTheme() {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === "light" : window.matchMedia?.("(prefers-color-scheme: light)").matches === true;
}

/**
 * The terminal's colours: the dark ones, unless the app shows the light theme and "Always dark" is off. Then the light
 * theme's own colours, read from the CSS variables, with a palette that can be read on them.
 */
function terminalColors() {
  if (alwaysDark || !lightTheme()) return DARK_THEME;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  const background = v("--bg");
  return { background, foreground: v("--text"), cursor: v("--accent"), cursorAccent: background, selectionBackground: v("--accent-soft"), ...LIGHT_ANSI };
}

/** Recolours every open terminal; run whenever the page's theme or "Always dark" changes. */
function applyTerminalTheme() {
  for (const e of entries.values()) e.term.options.theme = terminalColors();
}

const ENDED = "\r\n\x1b[2m[The shell has ended. Use Restart here to open a new one.]\x1b[0m\r\n";

function wire() {
  if (wired) return;
  wired = true;
  // Follow the theme from the page itself: React runs the terminal's effects before the App effect that sets
  // `data-theme`, so recolouring from a component would read the previous theme's colours. A "system" theme also
  // changes with the OS, without any app state changing at all.
  new MutationObserver(applyTerminalTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", applyTerminalTheme);
  void listen<{ id: number; data: string }>("term-data", ({ payload }) => {
    if (retired.has(payload.id)) return;
    const e = bySession.get(payload.id);
    if (e) e.term.write(payload.data);
    else early.set(payload.id, [...(early.get(payload.id) ?? []), payload.data]);
  });
  void listen<number>("term-exit", ({ payload }) => {
    if (retired.has(payload)) return;
    const e = bySession.get(payload);
    if (e) {
      e.term.write(ENDED);
      e.session = null;
      bySession.delete(payload);
    } else earlyExit.add(payload);
  });
}

function entryFor(id: number, path: string): Entry {
  const known = entries.get(id);
  if (known) return known;
  wire();
  const term = new Terminal({ fontFamily: "Consolas, 'Cascadia Mono', Menlo, monospace", fontSize: 13, cursorBlink: true, scrollback: 5000, scrollOnUserInput: true, theme: terminalColors(),
    // Any text a program colours too close to the background (its own 256 or true colours too) is lightened or
    // darkened until it can be read: 4.5 is the WCAG contrast for normal text.
    minimumContrastRatio: 4.5 });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const e: Entry = { term, fit, path, session: null, starting: false, disposed: false, opened: false };
  term.onData((data) => {
    if (e.session !== null) void api.termWrite(e.session, data).catch(() => undefined);
  });
  // Let the app's own shortcuts (Ctrl+backtick, Ctrl+Tab) through instead of sending them to the shell.
  term.attachCustomKeyEventHandler((ev) => !(ev.ctrlKey && (ev.key === "`" || ev.key === "Tab")));
  entries.set(id, e);
  return e;
}

function start(e: Entry) {
  if (e.starting || e.session !== null || e.disposed) return;
  e.starting = true;
  api
    .termOpen(e.path, e.term.rows, e.term.cols)
    .then((session) => {
      if (e.disposed) return void api.termClose(session).catch(() => undefined);
      e.session = session;
      bySession.set(session, e);
      for (const chunk of early.get(session) ?? []) e.term.write(chunk);
      early.delete(session);
      if (earlyExit.delete(session)) {
        e.term.write(ENDED);
        e.session = null;
        bySession.delete(session);
      }
    })
    .catch((err) => e.term.write(`\r\n\x1b[31m${errorMessage(err)}\x1b[0m\r\n`));
}

/** Resizes the view to its element and tells the shell. */
export function refitTerminal(id: number) {
  const e = entries.get(id);
  if (!e || !e.opened || !e.term.element || e.term.element.clientHeight === 0) return;
  try {
    e.fit.fit();
  } catch {
    return; // not laid out yet
  }
  if (e.session !== null) void api.termResize(e.session, e.term.rows, e.term.cols).catch(() => undefined);
}

/** Shows terminal `id` inside `host`, creating it (and starting its shell in `path`) the first time. */
export function attachTerminal(id: number, path: string, host: HTMLElement) {
  const e = entryFor(id, path);
  if (!e.opened) {
    e.term.open(host);
    e.opened = true;
  } else if (e.term.element && e.term.element.parentElement !== host) {
    host.appendChild(e.term.element);
  }
  // A remounted view loses its scroll position; keep what the user was reading.
  const top = e.term.buffer.active.viewportY;
  try {
    e.fit.fit();
  } catch {
    /* not laid out yet; the resize observer refits */
  }
  e.term.refresh(0, Math.max(0, e.term.rows - 1));
  e.term.scrollToLine(top);
  start(e);
}

export function focusTerminal(id: number) {
  entries.get(id)?.term.focus();
}

/** Ends the shell and removes the view for good. */
export function disposeTerminal(id: number) {
  const e = entries.get(id);
  if (!e) return;
  e.disposed = true;
  if (e.session !== null) {
    retired.add(e.session);
    bySession.delete(e.session);
    void api.termClose(e.session).catch(() => undefined);
  }
  e.term.dispose();
  entries.delete(id);
}

