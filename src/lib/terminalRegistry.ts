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

/** The colours of the current theme, read from the CSS variables so the terminal follows light and dark. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  return { background: v("--bg"), foreground: v("--text"), cursor: v("--accent"), selectionBackground: v("--accent-soft") };
}

const ENDED = "\r\n\x1b[2m[The shell has ended. Use Restart here to open a new one.]\x1b[0m\r\n";

function wire() {
  if (wired) return;
  wired = true;
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
  const term = new Terminal({ fontFamily: "Consolas, 'Cascadia Mono', Menlo, monospace", fontSize: 13, cursorBlink: true, theme: themeColors() });
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
  try {
    e.fit.fit();
  } catch {
    /* not laid out yet; the resize observer refits */
  }
  e.term.refresh(0, Math.max(0, e.term.rows - 1));
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

export function applyTerminalTheme() {
  for (const e of entries.values()) e.term.options.theme = themeColors();
}
