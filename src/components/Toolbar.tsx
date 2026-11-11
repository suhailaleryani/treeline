import { useEffect, useRef, useState, type ReactNode } from "react";
import { repoActions } from "../actions";
import { confirmRemoveButton, iconOf, loadButtons, openButtonDialog, runButton, useButtons, useTabButtons } from "../buttons";
import { useElementWidth } from "../hooks";
import {
  addSeparator,
  arrange,
  availableItems,
  BUILTIN_IDS,
  BUILTIN_META,
  builtinLabel,
  dropInToolbar,
  isSeparator,
  moveItem,
  setInMore,
  type BuiltinId,
} from "../lib/toolbarItems";
import { fileManagerName, toolbarLayout } from "../lib/toolbarLayout";
import { useApp } from "../store";
import { openMenu, useUi, type MenuItem } from "../uiStore";
import type { Tab } from "../types";
import { Icon, type IconName } from "./Icon";

function Btn({
  icon,
  label,
  onClick,
  badge,
  disabled,
  title,
  running,
}: {
  icon: IconName;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  badge?: string;
  disabled?: boolean;
  title?: string;
  /** Its command is running now. */
  running?: boolean;
}) {
  return (
    <button className={`tool${running ? " running" : ""}`} onClick={onClick} disabled={disabled} title={title ?? label} aria-busy={running || undefined}>
      <span className="tool-icon">
        <Icon name={icon} size={18} />
        {badge && <span className="tool-badge">{badge}</span>}
      </span>
      <span className="tool-label">{label}</span>
    </button>
  );
}

/** How long a button is held before it can be dragged, and how far the pointer may wander before that counts as a swipe, not a hold. */
const LONG_PRESS_MS = 350;
const MOVE_SLOP = 6;

/** One toolbar item, built-in or custom: how it is drawn in the toolbar and how it is listed in the More menu. */
interface ItemSpec {
  button: ReactNode;
  menu: MenuItem[];
}

export function Toolbar({ tab }: { tab: Tab }) {
  const d = useApp((s) => s.data[tab.id]);
  const bookmarks = useApp((s) => s.bookmarks);
  const prefs = useApp((s) => s.toolbar);
  const { addBookmark, removeBookmark, reload, setUi } = useApp.getState();
  const a = repoActions(tab.id);
  const s = d?.status;
  const busy = !!d?.busy;
  const bookmark = bookmarks.find((b) => b.path === tab.path);
  const changes = s?.files.length ?? 0;
  const ref = useRef<HTMLDivElement>(null);
  const layout = toolbarLayout(useElementWidth(ref));
  const custom = useTabButtons(tab.id);
  const running = useButtons((st) => st.running);
  useEffect(() => void loadButtons(tab.id), [tab.id, tab.path]);
  /** The button being dragged, the place it would drop into (0 = the start), and whether it is over the More button. */
  const [drag, setDrag] = useState<{ id: string; slot: number; overMore: boolean } | null>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const toolsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);

  const hasSubmodules = (d?.submodules.length ?? 0) > 0;
  const mini = (label: string, disabled: boolean | undefined, items: MenuItem[]) => (
    <button
      className="tool mini"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        openMenu({ clientX: r.left - 40, clientY: r.bottom + 4 }, items);
      }}
    >
      <Icon name="down" size={12} />
    </button>
  );

  const branch = s?.branch;
  const builtin = (id: BuiltinId): ItemSpec => {
    const { icon } = BUILTIN_META[id];
    const label = builtinLabel(id);
    switch (id) {
      case "commit":
        return {
          button: <Btn icon={icon} label={label} badge={changes ? String(changes) : undefined} title="Show changes and commit" onClick={() => setUi(tab.id, { view: "files" })} />,
          menu: [{ label: "Show changes and commit", onClick: () => setUi(tab.id, { view: "files" }) }],
        };
      case "fetch":
        return {
          button: <Btn icon={icon} label={label} disabled={busy} onClick={() => a.fetch()} />,
          menu: [{ label: "Fetch", disabled: busy, onClick: () => a.fetch() }],
        };
      case "pull": {
        const options: MenuItem[] = [
          { label: "Pull — merge", onClick: () => a.pull("merge") },
          { label: "Pull — rebase", onClick: () => a.pull("rebase") },
          { label: "Pull — fast-forward only", onClick: () => a.pull("ff-only") },
        ];
        return {
          button: (
            <>
              <Btn
                icon={icon}
                label={label}
                badge={s?.behind ? String(s.behind) : undefined}
                disabled={busy}
                title="Pull (merge). The arrow next to it offers rebase and fast-forward only."
                onClick={(e) => {
                  if (e.shiftKey) return;
                  a.pull("merge");
                }}
              />
              {mini("More pull options", busy, options)}
            </>
          ),
          menu: options.map((o) => ({ ...o, disabled: busy })),
        };
      }
      case "push":
        return {
          button: <Btn icon={icon} label={label} badge={s?.ahead ? String(s.ahead) : undefined} disabled={busy} onClick={() => a.push()} />,
          menu: [{ label: "Push…", disabled: busy, onClick: () => a.push() }],
        };
      case "subs": {
        const options: MenuItem[] = branch
          ? [
              { label: "Sync — switch branches only", onClick: () => void a.switchSubmodules(branch) },
              { label: "Sync and pull — switch, then pull (fast-forward)", onClick: () => void a.switchSubmodules(branch, true) },
            ]
          : [];
        return {
          button: (
            <>
              <Btn
                icon={icon}
                label={label}
                disabled={busy || !branch}
                title={branch ? `Switch submodules to ${branch} (where that branch exists). The arrow offers Sync and pull` : "Check out a branch first"}
                onClick={() => branch && void a.switchSubmodules(branch)}
              />
              {mini("More sync options", busy || !branch, options)}
            </>
          ),
          menu: options.map((o) => ({ ...o, disabled: busy })),
        };
      }
      case "branch":
        return { button: <Btn icon={icon} label={label} onClick={() => a.newBranch()} />, menu: [{ label: "New branch…", onClick: () => a.newBranch() }] };
      case "merge":
        return { button: <Btn icon={icon} label={label} onClick={() => a.merge()} />, menu: [{ label: "Merge…", onClick: () => a.merge() }] };
      case "stash":
        return { button: <Btn icon={icon} label={label} onClick={() => a.stash()} />, menu: [{ label: "Stash…", onClick: () => a.stash() }] };
      case "tag":
        return { button: <Btn icon={icon} label={label} onClick={() => a.newTag()} />, menu: [{ label: "New tag…", onClick: () => a.newTag() }] };
      case "multimerge": {
        const open = () => useUi.setState({ multiMerge: { tabId: tab.id } });
        return {
          button: <Btn icon={icon} label={label} title="Merge one branch into several, with a conflict check first" onClick={open} />,
          menu: [{ label: "Merge into several branches…", onClick: open }],
        };
      }
      case "cleanup": {
        const open = () => useUi.setState({ mergedBranches: { tabId: tab.id } });
        return {
          button: <Btn icon={icon} label={label} title="Delete branches that are already merged" onClick={open} />,
          menu: [{ label: "Clean up merged branches…", onClick: open }],
        };
      }
      case "terminal":
        return {
          button: <Btn icon={icon} label={label} title="Open a terminal in the repository folder" onClick={() => a.terminal()} />,
          menu: [{ label: "Open in Terminal", onClick: () => a.terminal() }],
        };
      case "reveal":
        return {
          button: <Btn icon={icon} label={label} title={`Show the repository folder in ${label}`} onClick={() => a.reveal()} />,
          menu: [{ label: `Show in ${label}`, onClick: () => a.reveal() }],
        };
    }
  };

  const specs = new Map<string, ItemSpec>();
  for (const id of BUILTIN_IDS) if (id !== "subs" || hasSubmodules) specs.set(id, builtin(id));
  for (const b of custom) {
    const full = `${b.label}: ${b.kind === "git" ? "git " : ""}${b.command}`;
    specs.set(b.id, {
      button: <Btn key={b.id} icon={iconOf(b)} label={b.label} disabled={busy && b.kind !== "url"} running={running[b.id]} title={full} onClick={() => runButton(tab.id, b)} />,
      menu: [{ label: b.label, hint: b.kind === "git" ? `git ${b.command}` : undefined, onClick: () => runButton(tab.id, b) }],
    });
  }

  // One list in the order the user chose; what does not fit the window, and what the user put in More, is listed there.
  const available = availableItems(prefs, hasSubmodules, custom.map((b) => b.id));
  const { all, toolbar, more } = arrange(prefs, available, layout.capacity);

  // Brings a button out of More. When the toolbar is already full it takes the place of the last button there, which moves into More.
  const promote = (id: string) => {
    const next = setInMore(prefs, id, false);
    const shown = toolbar.filter((x) => !isSeparator(x));
    const last = shown[shown.length - 1];
    const full = shown.length >= layout.capacity && last !== undefined;
    useApp.getState().setToolbar(full ? moveItem(next, available, id, all.indexOf(last)) : next);
  };

  /**
   * Press and hold a button, then drag it: to another place in the toolbar, or onto More to hide it. A quick click still
   * runs the button, and moving the pointer before the hold is over (a swipe, a scroll) never starts a drag.
   */
  const startPress = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".mini")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    const where = (x: number, y: number) => {
      const others = [...(toolsRef.current?.querySelectorAll<HTMLElement>("[data-item]") ?? [])].filter((el) => el.dataset.item !== id);
      const slot = others.filter((el) => {
        const r = el.getBoundingClientRect();
        return x > r.left + r.width / 2;
      }).length;
      const m = moreRef.current?.getBoundingClientRect();
      const overMore = !!m && x >= m.left && x <= m.right && y >= m.top - 10 && y <= m.bottom + 10;
      return { id, slot, overMore };
    };
    const stop = () => {
      window.clearTimeout(timer);
      setPressing(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey);
    };
    const finish = (drop: boolean) => {
      const wasDragging = active;
      stop();
      if (!wasDragging) return;
      document.body.classList.remove("toolbar-dragging");
      const d = dragRef.current;
      setDrag(null);
      // The click that follows the release must not run the button.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 100);
      if (!drop || !d) return;
      const { toolbar: now, setToolbar } = useApp.getState();
      setToolbar(d.overMore ? setInMore(now, id, true) : dropInToolbar(now, available, toolbar, id, d.slot));
    };
    const move = (ev: PointerEvent) => {
      if (active) setDrag(where(ev.clientX, ev.clientY));
      else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > MOVE_SLOP) stop();
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && finish(false);
    const timer = window.setTimeout(() => {
      active = true;
      setPressing(null);
      document.body.classList.add("toolbar-dragging");
      setDrag(where(startX, startY));
    }, LONG_PRESS_MS);
    setPressing(id);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey);
  };

  /** Right-click on a toolbar button. */
  const itemMenu = (e: React.MouseEvent, id: string) => {
    const b = custom.find((c) => c.id === id);
    const at = toolbar.indexOf(id);
    const slide = (step: -1 | 1) => {
      const next = toolbar[at + step];
      if (next) useApp.getState().setToolbar(moveItem(prefs, available, id, all.indexOf(next)));
    };
    openMenu(e, [
      ...(b
        ? [
            { label: "Edit…", onClick: () => openButtonDialog(tab.id, b) },
            { label: "Remove…", danger: true, onClick: () => confirmRemoveButton(tab.id, b) },
            { separator: true as const },
          ]
        : []),
      { label: "Move left", disabled: at <= 0, onClick: () => slide(-1) },
      { label: "Move right", disabled: at < 0 || at >= toolbar.length - 1, onClick: () => slide(1) },
      { label: "Move to the More menu", onClick: () => useApp.getState().setToolbar(setInMore(prefs, id, true)) },
      { label: "Add a separator after", onClick: () => useApp.getState().setToolbar(addSeparator(prefs, available, id)) },
      { separator: true },
      { label: "Customize toolbar…", onClick: () => useUi.setState({ manageButtons: { tabId: tab.id } }) },
    ]);
  };

  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const moved: MenuItem[] = more.flatMap((id): MenuItem[] =>
      isSeparator(id)
        ? [{ separator: true }]
        : (specs.get(id)?.menu ?? []).map((m, i) =>
            i === 0 ? { ...m, aside: { label: "Show in toolbar", title: "Put this button in the toolbar", onClick: () => promote(id) } } : m,
          ),
    );
    openMenu({ clientX: r.right - 220, clientY: r.bottom + 4 }, [
      ...moved,
      ...(moved.length ? [{ separator: true as const }] : []),
      { label: "Add custom button…", onClick: () => openButtonDialog(tab.id) },
      { label: "Customize toolbar…", onClick: () => useUi.setState({ manageButtons: { tabId: tab.id } }) },
    ]);
  };

  return (
    <div className={`toolbar${layout.labels ? "" : " icons-only"}`} ref={ref}>
      <div className="repo-id">
        <strong className="repo-name">{tab.name}</strong>
        <span className="chip" title={s?.upstream ? `Tracking ${s.upstream}` : "No upstream branch"}>
          <Icon name="branch" size={13} /> {s?.branch ?? (s ? "detached HEAD" : "…")}
          {s && s.ahead > 0 && <span className="ahead"> ↑{s.ahead}</span>}
          {s && s.behind > 0 && <span className="behind"> ↓{s.behind}</span>}
        </span>
        <button
          className={`icon-btn star${bookmark ? " on" : ""}`}
          aria-label={bookmark ? "Remove bookmark" : "Bookmark this repository"}
          title={bookmark ? "Remove bookmark" : "Bookmark this repository"}
          onClick={() => (bookmark ? removeBookmark(bookmark.id) : tab.path && addBookmark(tab.path))}
        >
          <Icon name="star" size={16} />
        </button>
      </div>

      <div className="tools" ref={toolsRef}>
        {toolbar.map((id) => {
          if (isSeparator(id)) return <span key={id} data-item={id} className="sep" />;
          const others = drag ? toolbar.filter((x) => x !== drag.id) : [];
          const classes = [
            "tool-item",
            drag?.id === id && "dragging",
            pressing === id && "pressing",
            drag && !drag.overMore && others[drag.slot] === id && "drop-before",
            drag && !drag.overMore && drag.slot >= others.length && others[others.length - 1] === id && "drop-after",
          ];
          return (
            <span key={id} data-item={id} className={classes.filter(Boolean).join(" ")} onPointerDown={(e) => startPress(e, id)} onContextMenu={(e) => itemMenu(e, id)}>
              {specs.get(id)?.button}
            </span>
          );
        })}
        <span className="sep" />
        <Btn icon="plus" label="Add" title="Add a custom button: a shell or git command, a terminal command or a link" onClick={() => openButtonDialog(tab.id)} />
        <span ref={moreRef} className={`more-drop${drag?.overMore ? " drop-target" : ""}`}>
          <Btn
            icon="more"
            label="More"
            title={`More actions: the buttons that do not fit, merge into several branches, clean up, Terminal, ${fileManagerName()}, customize the toolbar`}
            onClick={openMore}
          />
        </span>
        <Btn icon="refresh" label="Refresh" disabled={d?.loading} onClick={() => void reload(tab.id)} />
      </div>
    </div>
  );
}
