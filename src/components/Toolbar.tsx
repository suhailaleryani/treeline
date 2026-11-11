import { useEffect, useRef, type ReactNode } from "react";
import { repoActions } from "../actions";
import { iconOf, loadButtons, openButtonDialog, runButton, useTabButtons } from "../buttons";
import { useElementWidth } from "../hooks";
import { arrange, availableItems, BUILTIN_IDS, BUILTIN_META, isSeparator, type BuiltinId } from "../lib/toolbarItems";
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
}: {
  icon: IconName;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  badge?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button className="tool" onClick={onClick} disabled={disabled} title={title ?? label}>
      <span className="tool-icon">
        <Icon name={icon} size={18} />
        {badge && <span className="tool-badge">{badge}</span>}
      </span>
      <span className="tool-label">{label}</span>
    </button>
  );
}

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
  useEffect(() => void loadButtons(tab.id), [tab.id, tab.path]);

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
    const { label, icon } = BUILTIN_META[id];
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
    }
  };

  const specs = new Map<string, ItemSpec>();
  for (const id of BUILTIN_IDS) if (id !== "subs" || hasSubmodules) specs.set(id, builtin(id));
  for (const b of custom) {
    const full = `${b.label}: ${b.kind === "git" ? "git " : ""}${b.command}`;
    specs.set(b.id, {
      button: <Btn key={b.id} icon={iconOf(b)} label={b.label} disabled={busy && b.kind !== "url"} title={full} onClick={() => runButton(tab.id, b)} />,
      menu: [{ label: b.label, hint: b.kind === "git" ? `git ${b.command}` : undefined, onClick: () => runButton(tab.id, b) }],
    });
  }

  // One list in the order the user chose; what does not fit the window, and what the user put in More, is listed there.
  const { toolbar, more } = arrange(prefs, availableItems(prefs, hasSubmodules, custom.map((b) => b.id)), layout.capacity);

  const openMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const moved: MenuItem[] = more.flatMap((id) => (isSeparator(id) ? [{ separator: true }] : (specs.get(id)?.menu ?? [])));
    openMenu({ clientX: r.right - 220, clientY: r.bottom + 4 }, [
      ...moved,
      ...(moved.length ? [{ separator: true as const }] : []),
      { label: "Merge into several branches…", onClick: () => useUi.setState({ multiMerge: { tabId: tab.id } }) },
      { label: "Clean up merged branches…", onClick: () => useUi.setState({ mergedBranches: { tabId: tab.id } }) },
      { separator: true },
      { label: "Open in Terminal", onClick: () => a.terminal() },
      { label: `Show in ${fileManagerName()}`, onClick: () => a.reveal() },
      { separator: true },
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

      <div className="tools">
        {toolbar.map((id) =>
          isSeparator(id) ? (
            <span key={id} className="sep" />
          ) : (
            <span key={id} className="tool-item">
              {specs.get(id)?.button}
            </span>
          ),
        )}
        <span className="sep" />
        <Btn icon="plus" label="Add" title="Add a custom button: a shell or git command, a terminal command or a link" onClick={() => openButtonDialog(tab.id)} />
        <Btn
          icon="more"
          label="More"
          title={`More actions: the buttons that do not fit, merge into several branches, clean up, Terminal, ${fileManagerName()}, customize the toolbar`}
          onClick={openMore}
        />
        <Btn icon="refresh" label="Refresh" disabled={d?.loading} onClick={() => void reload(tab.id)} />
      </div>
    </div>
  );
}
