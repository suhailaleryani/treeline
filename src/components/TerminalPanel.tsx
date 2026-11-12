import { useEffect, useRef, useState } from "react";
import { useSplit } from "../hooks";
import { applyTerminalTheme, attachTerminal, focusTerminal, refitTerminal } from "../lib/terminalRegistry";
import { useApp } from "../store";
import { addTab, closeGroup, closeTab, focusGroup, moveGroup, newGroup, restartTab, selectTab, useTerminals, type Dock, type TermGroup, type TermTab } from "../terminalStore";
import { useUi } from "../uiStore";
import { Icon } from "./Icon";
import "@xterm/xterm/css/xterm.css";

const MIN_H = 100;
const MIN_W = 240;

const folderName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;

/** Shows one terminal. The shell itself lives in the registry, so moving a group does not end it. */
function TerminalView({ tab, focused }: { tab: TermTab; focused: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    attachTerminal(tab.id, tab.path, el);
    const ro = new ResizeObserver(() => refitTerminal(tab.id));
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab.id, tab.path, tab.gen]);
  useEffect(() => {
    if (focused) focusTerminal(tab.id);
  }, [focused, tab.id, tab.gen]);
  return <div className="terminal-body" ref={host} />;
}

function GroupView({ group, focused, activePath }: { group: TermGroup; focused: boolean; activePath: string | null }) {
  const cur = group.tabs.find((t) => t.id === group.current) ?? group.tabs[0];
  const other: Dock = group.dock === "bottom" ? "right" : "bottom";
  return (
    <div className={`terminal-group${focused ? " focused" : ""}`} onMouseDownCapture={() => focusGroup(group.id)}>
      <div className="terminal-head">
        <div className="terminal-tabs" role="tablist" aria-label="Terminals">
          {group.tabs.map((t, i) => (
            <span key={t.id} className={`terminal-tab${t.id === cur.id ? " active" : ""}`} role="tab" aria-selected={t.id === cur.id} title={t.path} onClick={() => selectTab(group.id, t.id)}>
              <span className="ellipsis">
                {i + 1}: {folderName(t.path)}
              </span>
              <button
                className="icon-btn"
                aria-label={`Close terminal ${i + 1}`}
                title="Close this terminal"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(group.id, t.id);
                }}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
          <button className="icon-btn" disabled={!activePath} aria-label="New terminal tab" title="New terminal tab here, in the active repository" onClick={() => activePath && addTab(group.id, activePath)}>
            <Icon name="plus" size={12} />
          </button>
        </div>
        <button className="btn tiny" disabled={!activePath} onClick={() => activePath && newGroup(activePath, group.dock)} title={group.dock === "bottom" ? "Divide: a new piece beside this one" : "Divide: a new piece below this one"}>
          Divide
        </button>
        <button className="btn tiny" onClick={() => moveGroup(group.id, other)} title={`Move this piece to the ${other}`}>
          Move {other}
        </button>
        <button className="btn tiny" disabled={!activePath} onClick={() => activePath && restartTab(group.id, cur.id, activePath)} title="Start a new shell in the active repository, replacing this one">
          Restart here
        </button>
        <button className="icon-btn" aria-label="Close this group" title="Close this group and end its shells" onClick={() => closeGroup(group.id)}>
          <Icon name="x" size={12} />
        </button>
      </div>
      <TerminalView key={`${cur.id}:${cur.gen}`} tab={cur} focused={focused} />
    </div>
  );
}

/**
 * One side of the terminal area: all the groups docked at `dock`. Mounted once for the whole app, below (bottom) or
 * beside (right) the repository view, so it keeps its place in History, Files and every tab. Hiding it does not end
 * the shells.
 */
export function TerminalDock({ dock }: { dock: Dock }) {
  const open = useUi((s) => s.terminalOpen);
  const theme = useApp((s) => s.theme);
  const activePath = useApp((s) => s.tabs.find((t) => t.id === s.activeId)?.path ?? null);
  const all = useTerminals((s) => s.groups);
  const focusedGroup = useTerminals((s) => s.focusedGroup);
  const groups = all.filter((g) => g.dock === dock);
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const bottom = dock === "bottom";
  // Each dock remembers its own size: a height at the bottom, a width on the right.
  const [size, onSplit, resetSplit] = useSplit(bottom ? "terminal-h" : "terminal-w", bottom ? 260 : 480, bottom ? MIN_H : MIN_W, Math.round((bottom ? win.h : win.w) * 0.7), bottom ? "y" : "x", true);

  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => applyTerminalTheme(), [theme]);

  // Opening the panel with no terminals starts one at the bottom, in the active repository.
  useEffect(() => {
    if (bottom && open && all.length === 0 && activePath) newGroup(activePath, "bottom");
  }, [bottom, open, all.length, activePath]);

  const shown = open && groups.length > 0;
  return (
    <section className={`terminal-dock ${dock}`} style={{ ...(bottom ? { height: size } : { width: size }), display: shown ? undefined : "none" }} aria-label={`Terminals, ${dock}`}>
      <div className={`splitter${bottom ? " h" : ""}`} onMouseDown={onSplit} onDoubleClick={() => resetSplit()} role="separator" aria-orientation={bottom ? "horizontal" : "vertical"} title="Drag to resize. Double-click to reset." />
      <div className={`terminal-groups${groups.length > 1 ? " multi" : ""}`}>
        {groups.map((g) => (
          <GroupView key={g.id} group={g} focused={g.id === focusedGroup} activePath={activePath} />
        ))}
      </div>
    </section>
  );
}
