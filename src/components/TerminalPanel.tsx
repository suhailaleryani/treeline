import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { api, errorMessage } from "../api";
import { useSplit } from "../hooks";
import { useApp } from "../store";
import { setTerminalPos, useUi } from "../uiStore";
import { Icon } from "./Icon";

const MIN_H = 100;

/** The colours of the current theme, read from the CSS variables so the terminal follows light and dark. */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || undefined;
  return { background: v("--bg"), foreground: v("--text"), cursor: v("--accent"), selectionBackground: v("--accent-soft") };
}

/**
 * The built-in terminal. Mounted once for the whole app, below the repository view, so it keeps its place and its
 * running shell whichever view or tab is showing. Hiding the panel does not end the shell.
 */
export function TerminalPanel() {
  const open = useUi((s) => s.terminalOpen);
  const pos = useUi((s) => s.terminalPos);
  const theme = useApp((s) => s.theme);
  const activePath = useApp((s) => s.tabs.find((t) => t.id === s.activeId)?.path ?? null);
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  // Each position remembers its own size: a height at the bottom, a width on the right.
  const [height, onSplitH, resetSplitH] = useSplit("terminal-h", 260, MIN_H, Math.round(win.h * 0.7), "y", true);
  const [width, onSplitW, resetSplitW] = useSplit("terminal-w", 480, 240, Math.round(win.w * 0.7), "x", true);
  const right = pos === "right";
  const size = right ? width : height;
  const onSplit = right ? onSplitW : onSplitH;
  const resetSplit = right ? resetSplitW : resetSplitH;
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<number | null>(null);
  const [cwd, setCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Create the xterm view once, the first time the panel is opened.
  useEffect(() => {
    if (!open || term.current || !host.current) return;
    const t = new Terminal({ fontFamily: "Consolas, 'Cascadia Mono', Menlo, monospace", fontSize: 13, cursorBlink: true, theme: themeColors() });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    t.onData((data) => {
      if (session.current !== null) void api.termWrite(session.current, data).catch(() => undefined);
    });
    // Let the app's own shortcuts (Ctrl+backtick, Ctrl+Tab) through instead of sending them to the shell.
    t.attachCustomKeyEventHandler((e) => !(e.ctrlKey && (e.key === "`" || e.key === "Tab")));
    term.current = t;
    fit.current = f;
  }, [open]);

  const start = useCallback(async (path: string) => {
    const t = term.current;
    if (!t) return;
    setError(null);
    if (session.current !== null) void api.termClose(session.current).catch(() => undefined);
    session.current = null;
    t.reset();
    try {
      fit.current?.fit();
      session.current = await api.termOpen(path, t.rows, t.cols);
      setCwd(path);
      t.focus();
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // Start the shell in the active repository the first time the panel opens.
  useEffect(() => {
    if (open && term.current && session.current === null && !cwd && !error && activePath) void start(activePath);
  }, [open, activePath, cwd, error, start]);

  useEffect(() => {
    const subs = [
      listen<{ id: number; data: string }>("term-data", ({ payload }) => {
        if (payload.id === session.current) term.current?.write(payload.data);
      }),
      listen<number>("term-exit", ({ payload }) => {
        if (payload !== session.current) return;
        session.current = null;
        term.current?.write("\r\n\x1b[2m[The shell has ended. Use Restart here to open a new one.]\x1b[0m\r\n");
      }),
    ];
    return () => subs.forEach((p) => void p.then((f) => f()));
  }, []);

  // Keep the shell's size matching the panel.
  useEffect(() => {
    const el = host.current;
    if (!el || !open) return;
    const refit = () => {
      const t = term.current;
      if (!t || !fit.current || el.clientHeight === 0) return;
      fit.current.fit();
      if (session.current !== null) void api.termResize(session.current, t.rows, t.cols).catch(() => undefined);
    };
    const ro = new ResizeObserver(refit);
    ro.observe(el);
    refit();
    return () => ro.disconnect();
  }, [open, size, pos]);

  useEffect(() => {
    if (term.current) term.current.options.theme = themeColors();
  }, [theme]);

  useEffect(() => {
    if (open) term.current?.focus();
  }, [open]);

  // End the shell when the app goes away.
  useEffect(
    () => () => {
      if (session.current !== null) void api.termClose(session.current).catch(() => undefined);
    },
    [],
  );

  return (
    <section className="terminal-panel" style={{ ...(right ? { width } : { height }), display: open ? undefined : "none" }} aria-label="Terminal">
      <div className={`splitter${right ? "" : " h"}`} onMouseDown={onSplit} onDoubleClick={() => resetSplit()} role="separator" aria-orientation={right ? "vertical" : "horizontal"} title="Drag to resize. Double-click to reset." />
      <div className="terminal-head">
        <span className="ellipsis" title={cwd ?? undefined}>
          Terminal{cwd ? ` — ${cwd}` : ""}
        </span>
        <button className="btn tiny" disabled={!activePath} onClick={() => activePath && void start(activePath)} title="Start a new shell in the active repository">
          Restart here
        </button>
        <button
          className="btn tiny"
          onClick={() => setTerminalPos(right ? "bottom" : "right")}
          title={right ? "Move the terminal to the bottom" : "Move the terminal to the right"}
        >
          {right ? "Move to bottom" : "Move to right"}
        </button>
        <button className="icon-btn" aria-label="Hide the terminal" title="Hide (the shell keeps running)" onClick={() => useUi.setState({ terminalOpen: false })}>
          <Icon name="x" size={12} />
        </button>
      </div>
      {error && <div className="error-banner" style={{ padding: "4px 10px" }}>{error}</div>}
      {!activePath && !error && <div className="muted small" style={{ padding: "6px 10px" }}>Open a repository to start a terminal in its folder.</div>}
      <div className="terminal-body" ref={host} />
    </section>
  );
}
