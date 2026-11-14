import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "../api";
import { repoActions } from "../actions";
import { useSplit } from "../hooks";
import { splitPath } from "../lib/format";
import { formatShortcut } from "../lib/shortcut";
import { useApp } from "../store";
import type { FileSel } from "../store";
import { openMenu, useUi } from "../uiStore";
import { latestMessages, loadMessages, mostUsedMessages, recordMessage, saveMessages } from "../lib/commitMessages";
import type { FileChange, Tab } from "../types";
import { ConflictResolver } from "./ConflictResolver";
import { DiffView, type PatchKind } from "./DiffView";
import { Icon } from "./Icon";

function badge(f: FileChange, staged: boolean): { code: string; kind: string; title: string } {
  if (f.conflicted) return { code: "!", kind: "conflict", title: "Conflict" };
  if (f.untracked) return { code: "U", kind: "added", title: "Untracked" };
  const code = staged ? f.index : f.worktree;
  const map: Record<string, [string, string]> = {
    M: ["modified", "Modified"],
    A: ["added", "Added"],
    D: ["deleted", "Deleted"],
    R: ["renamed", "Renamed"],
    C: ["added", "Copied"],
    T: ["modified", "Type changed"],
  };
  const [kind, title] = map[code] ?? ["modified", "Changed"];
  return { code, kind, title };
}

const CONFLICT_LABELS: Record<string, string> = {
  UU: "both modified",
  AA: "both added",
  DD: "both deleted",
  AU: "added by us",
  UA: "added by them",
  DU: "deleted by us",
  UD: "deleted by them",
};

export function FilesView({ tab }: { tab: Tab }) {
  const d = useApp((s) => s.data[tab.id]);
  const { run, setUi, notify } = useApp.getState();
  const a = repoActions(tab.id);
  const path = tab.path!;
  const status = d?.status;
  const sel = d?.ui.sel ?? null;
  const [width, onSplit] = useSplit("files-left", 340, 240, 620, "x");
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [filter, setFilter] = useState("");

  const files = status?.files ?? [];
  const match = (f: FileChange) => !filter || f.path.toLowerCase().includes(filter.toLowerCase());
  const conflicts = files.filter((f) => f.conflicted);
  const staged = files.filter((f) => !f.untracked && !f.conflicted && f.index !== ".").filter(match);
  const unstaged = files.filter((f) => !f.conflicted && (f.untracked || f.worktree !== ".")).filter(match);

  // Keep the selection valid, or fall back to the first sensible file.
  useEffect(() => {
    if (!status) return;
    const exists = (s: FileSel) =>
      s.kind === "conflict"
        ? conflicts.some((f) => f.path === s.path)
        : s.kind === "staged"
          ? staged.some((f) => f.path === s.path)
          : unstaged.some((f) => f.path === s.path);
    if (sel && exists(sel)) return;
    const first: FileSel | null = conflicts[0]
      ? { path: conflicts[0].path, kind: "conflict", untracked: false }
      : unstaged[0]
        ? { path: unstaged[0].path, kind: "unstaged", untracked: unstaged[0].untracked }
        : staged[0]
          ? { path: staged[0].path, kind: "staged", untracked: false }
          : null;
    if (JSON.stringify(first) !== JSON.stringify(sel)) setUi(tab.id, { sel: first });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Load the diff for the selected file. A token ignores out-of-order responses.
  const token = useRef(0);
  useEffect(() => {
    // Collapsed untracked directories ("dir/") have no single diff.
    if (!sel || sel.kind === "conflict" || sel.path.endsWith("/")) {
      setDiffText("");
      return;
    }
    const mine = ++token.current;
    setDiffLoading(true);
    api
      .fileDiff(path, sel.path, sel.kind === "staged", sel.untracked, 3)
      .then((t) => mine === token.current && (setDiffText(t), setDiffLoading(false)))
      .catch((e) => {
        if (mine !== token.current) return;
        setDiffText("");
        setDiffLoading(false);
        notify("error", errorMessage(e));
      });
  }, [path, sel?.path, sel?.kind, sel?.untracked, status, notify]);

  const select = (f: FileChange, kind: FileSel["kind"]) =>
    setUi(tab.id, { sel: { path: f.path, kind, untracked: f.untracked } });

  // Multi-selection: one list at a time (staged or unstaged). `sel` stays the file whose diff is shown.
  type ListKind = "staged" | "unstaged";
  const [multi, setMulti] = useState<{ kind: ListKind; paths: string[]; anchor: string } | null>(null);
  const listOf = (k: ListKind) => (k === "staged" ? staged : unstaged);
  const pickedPaths = new Set(multi ? listOf(multi.kind).map((f) => f.path).filter((p) => multi.paths.includes(p)) : []);
  const pickedFiles = (k: ListKind) => (multi?.kind === k ? listOf(k).filter((f) => pickedPaths.has(f.path)) : []);
  /** What an action on row `f` applies to: the whole selection when `f` is part of it, else just `f`. */
  const targets = (f: FileChange, k: FileSel["kind"]): FileChange[] =>
    k !== "conflict" && multi?.kind === k && pickedPaths.size > 1 && pickedPaths.has(f.path) ? pickedFiles(k) : [f];

  const clickRow = (e: React.MouseEvent, f: FileChange, kind: FileSel["kind"]) => {
    select(f, kind);
    if (kind === "conflict") return setMulti(null);
    const list = listOf(kind);
    if (e.shiftKey && multi?.kind === kind) {
      const a = list.findIndex((x) => x.path === multi.anchor);
      const b = list.findIndex((x) => x.path === f.path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        return setMulti({ kind, anchor: multi.anchor, paths: list.slice(lo, hi + 1).map((x) => x.path) });
      }
    }
    if (e.ctrlKey || e.metaKey) {
      // Start from the file already shown, if it is in this list, so the first Ctrl-click adds to it.
      const base = multi?.kind === kind ? pickedFiles(kind).map((x) => x.path) : sel?.kind === kind ? [sel.path] : [];
      const paths = base.includes(f.path) ? base.filter((p) => p !== f.path) : [...base, f.path];
      return setMulti({ kind, paths, anchor: f.path });
    }
    setMulti({ kind, paths: [f.path], anchor: f.path });
  };

  // Drag selection: press on a row, move over others in the same list, release. Plain left button only,
  // so Ctrl/Shift-click and the row buttons keep working as before.
  const drag = useRef<{ kind: ListKind; anchor: string; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  useEffect(() => {
    const end = () => {
      if (!drag.current) return;
      // The click that follows a drag lands on the list itself; remember it so it does not clear the selection.
      justDragged.current = drag.current.moved;
      drag.current = null;
      setTimeout(() => (justDragged.current = false), 0);
    };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, []);
  const dragStart = (e: React.MouseEvent, f: FileChange, kind: FileSel["kind"]) => {
    if (kind === "conflict" || e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { kind, anchor: f.path, moved: false };
  };
  const dragOver = (f: FileChange, kind: FileSel["kind"]) => {
    const dr = drag.current;
    if (!dr || dr.kind !== kind || (!dr.moved && f.path === dr.anchor)) return;
    const list = listOf(dr.kind);
    const a = list.findIndex((x) => x.path === dr.anchor);
    const b = list.findIndex((x) => x.path === f.path);
    if (a < 0 || b < 0) return;
    dr.moved = true;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    select(list[a], kind);
    setMulti({ kind, anchor: dr.anchor, paths: list.slice(lo, hi + 1).map((x) => x.path) });
  };

  const selectAll = () => {
    const kind: ListKind = multi?.kind ?? (sel?.kind === "staged" ? "staged" : "unstaged");
    const list = listOf(kind);
    if (!list.length) return;
    // Ctrl+A again, with everything already selected, deselects.
    if (multi?.kind === kind && pickedFiles(kind).length === list.length) return setMulti(null);
    setMulti({ kind, paths: list.map((f) => f.path), anchor: list[0].path });
  };

  /** A rename touches two paths; staging only the new one would leave the deletion behind. */
  const withOrig = (fs: FileChange[]) => fs.flatMap((f) => (f.orig_path ? [f.path, f.orig_path] : [f.path]));
  const stage = (paths: string[]) => run(tab.id, "Staging…", () => api.stage(path, paths), { quiet: true });
  const unstage = (paths: string[]) => run(tab.id, "Unstaging…", () => api.unstage(path, paths), { quiet: true });

  const discard = (fs: FileChange[]) =>
    useApp.getState().openDialog({
      title: fs.length === 1 ? `Discard changes to ${fs[0].path}?` : `Discard changes to ${fs.length} files?`,
      description: "This permanently throws away the changes. It cannot be undone.",
      fields: [],
      submitLabel: "Discard",
      danger: true,
      onSubmit: () =>
        void run(
          tab.id,
          "Discarding…",
          () =>
            api.discard(
              path,
              fs.filter((f) => !f.untracked).map((f) => f.path),
              fs.filter((f) => f.untracked).map((f) => f.path),
            ),
          { quiet: true },
        ),
    });

  const onPatch = (kind: PatchKind, patch: string) => {
    const go = () =>
      run(tab.id, kind === "stage" ? "Staging…" : kind === "unstage" ? "Unstaging…" : "Discarding…", () =>
        api.applyPatch(path, patch, kind !== "discard", kind !== "stage"), { quiet: true });
    if (kind !== "discard") return void go();
    useApp.getState().openDialog({
      title: "Discard these changes?",
      description: "The selected changes are permanently removed from the file.",
      fields: [],
      submitLabel: "Discard",
      danger: true,
      onSubmit: () => void go(),
    });
  };

  const fileMenu = (e: React.MouseEvent, f: FileChange, kind: FileSel["kind"]) => {
    const fs = targets(f, kind);
    const n = fs.length > 1 ? ` ${fs.length} files` : "";
    return openMenu(e, [
      kind === "staged"
        ? { label: `Unstage${n}`, onClick: () => unstage(withOrig(fs)) }
        : { label: `Stage${n}`, onClick: () => stage(withOrig(fs)) },
      ...(kind === "unstaged" ? [{ label: `Discard changes${n}…`, danger: true, onClick: () => discard(fs) }] : []),
      { separator: true },
      { label: "Copy path", onClick: () => a.copy(fs.map((x) => x.path).join("\n")) },
      ...(f.untracked || fs.length > 1
        ? []
        : [
            { separator: true },
            { label: "File history…", onClick: () => useUi.setState({ fileHistory: { repo: tab.path!, file: f.path, mode: "history" } }) },
            { label: "Blame (who changed each line)…", onClick: () => useUi.setState({ fileHistory: { repo: tab.path!, file: f.path, mode: "blame" } }) },
          ]),
    ]);
  };

  const row = (f: FileChange, kind: FileSel["kind"]) => {
    const b = badge(f, kind === "staged");
    const { dir, name } = splitPath(f.path);
    const picked = kind !== "conflict" && multi?.kind === kind && pickedPaths.has(f.path);
    // Only selected rows are highlighted; the file whose diff is shown (`sel`) is not, once the selection is cleared.
    const active = picked || (kind === "conflict" && sel?.kind === "conflict" && sel.path === f.path);
    return (
      <li
        key={`${kind}:${f.path}`}
        data-row={`${kind}:${f.path}`}
        className={`file-row${active ? " active" : ""}`}
        aria-selected={active}
        onClick={(e) => clickRow(e, f, kind)}
        onMouseDown={(e) => dragStart(e, f, kind)}
        onMouseEnter={() => dragOver(f, kind)}
        onDoubleClick={() => (kind === "staged" ? unstage(withOrig(targets(f, kind))) : kind === "unstaged" ? stage(withOrig(targets(f, kind))) : undefined)}
        onContextMenu={(e) => fileMenu(e, f, kind)}
        title={f.orig_path ? `${f.orig_path} → ${f.path}` : f.path}
      >
        <span className={`badge ${b.kind}`} title={b.title}>
          {b.code}
        </span>
        <span className="file-path">
          <span className="name">{name}</span>
          <span className="dir">{dir}</span>
        </span>
        {kind === "conflict" ? (
          <span className="muted small">{CONFLICT_LABELS[f.index + f.worktree] ?? "conflict"}</span>
        ) : (
          <span className="row-actions">
            {kind === "unstaged" && (
              <button className="icon-btn" title="Discard changes" aria-label="Discard changes" onClick={(e) => (e.stopPropagation(), discard(targets(f, kind)))}>
                <Icon name="undo" size={14} />
              </button>
            )}
            <button
              className="icon-btn"
              title={kind === "staged" ? "Unstage" : "Stage"}
              aria-label={kind === "staged" ? "Unstage" : "Stage"}
              onClick={(e) => (e.stopPropagation(), kind === "staged" ? unstage(withOrig(targets(f, kind))) : stage(withOrig(targets(f, kind))))}
            >
              <Icon name={kind === "staged" ? "x" : "plus"} size={14} />
            </button>
          </span>
        )}
      </li>
    );
  };

  // The right pane follows the selection: a file that is not selected any more (or never was) shows nothing.
  const shown = sel && (sel.kind === "conflict" || (multi?.kind === sel.kind && pickedPaths.has(sel.path))) ? sel : null;

  /** Arrow keys move through the rows in display order (conflicts, staged, unstaged); Shift extends the selection within a list. */
  const arrowNav = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const order = [
      ...conflicts.map((f) => ({ f, kind: "conflict" as FileSel["kind"] })),
      ...staged.map((f) => ({ f, kind: "staged" as FileSel["kind"] })),
      ...unstaged.map((f) => ({ f, kind: "unstaged" as FileSel["kind"] })),
    ];
    if (!order.length) return;
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const cur = shown ? order.findIndex((r) => r.kind === shown.kind && r.f.path === shown.path) : -1;
    const next = cur < 0 ? (dir > 0 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, cur + dir));
    const r = order[next];
    if (e.shiftKey && cur >= 0 && r.kind !== "conflict" && order[cur].kind === r.kind && multi?.kind === r.kind) {
      const list = listOf(r.kind as ListKind);
      const a = list.findIndex((x) => x.path === multi.anchor);
      const b = list.findIndex((x) => x.path === r.f.path);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        select(r.f, r.kind);
        setMulti({ kind: r.kind as ListKind, anchor: multi.anchor, paths: list.slice(lo, hi + 1).map((x) => x.path) });
      }
    } else if (e.shiftKey && cur >= 0 && order[cur].kind !== r.kind) {
      return; // Shift never reaches into another list.
    } else {
      select(r.f, r.kind);
      setMulti(r.kind === "conflict" ? null : { kind: r.kind as ListKind, paths: [r.f.path], anchor: r.f.path });
    }
    requestAnimationFrame(() => {
      for (const li of e.currentTarget.querySelectorAll<HTMLElement>("[data-row]")) {
        if (li.dataset.row === `${r.kind}:${r.f.path}`) li.scrollIntoView({ block: "nearest" });
      }
    });
  };

  const state = status?.state;
  const stateLabel = { merge: "Merge", rebase: "Rebase", "cherry-pick": "Cherry-pick", revert: "Revert" }[state ?? "merge"];

  return (
    <div className="files-view" style={{ gridTemplateColumns: `${width}px 6px 1fr` }}>
      <div className="files-left">
        {state && (
          <div className="banner warn" role="status">
            <Icon name="warn" size={16} />
            <span>
              <strong>{stateLabel} in progress</strong>
              {conflicts.length > 0 ? ` — ${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} to resolve` : " — ready to continue"}
            </span>
            <span className="banner-actions">
              <button className="btn tiny primary" disabled={conflicts.length > 0} onClick={() => a.sequencer(state, "continue")}>
                Continue
              </button>
              {state !== "merge" && (
                <button className="btn tiny" onClick={() => a.sequencer(state, "skip")}>
                  Skip
                </button>
              )}
              <button className="btn tiny danger-text" onClick={() => a.sequencer(state, "abort")}>
                Abort
              </button>
            </span>
          </div>
        )}

        <div className="filter-row">
          <Icon name="search" size={14} />
          <input placeholder="Filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter files" />
        </div>

        <div
          className="file-lists"
          tabIndex={0}
          aria-label="Changed files. Ctrl+A selects all, Ctrl-click and Shift-click select several."
          onClick={(e) => {
            // A click on empty space (not a row or button) clears the selection.
            if (justDragged.current) return;
            if (!(e.target as HTMLElement).closest("li, button")) setMulti(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
              e.preventDefault();
              selectAll();
            } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              arrowNav(e);
            } else if (e.key === "Escape" && multi) setMulti(null);
            else if (e.key === "Enter" && multi && pickedPaths.size > 0) {
              const fs = pickedFiles(multi.kind);
              void (multi.kind === "staged" ? unstage(withOrig(fs)) : stage(withOrig(fs)));
            }
          }}
        >
          {conflicts.length > 0 && (
            <section>
              <h3 className="list-title conflict-title">Conflicts <span className="count">{conflicts.length}</span></h3>
              <ul>{conflicts.map((f) => row(f, "conflict"))}</ul>
            </section>
          )}
          <section>
            <h3 className="list-title">
              Staged <span className="count">{staged.length === 0 ? "— nothing staged" : staged.length}</span>
              {pickedFiles("staged").length > 0 && (
                <button className="btn tiny" onClick={() => unstage(withOrig(pickedFiles("staged")))}>
                  Unstage selected ({pickedFiles("staged").length})
                </button>
              )}
              {staged.length > 0 && (
                <button className="btn tiny" onClick={() => run(tab.id, "Unstaging…", () => api.unstageAll(path), { quiet: true })}>
                  Unstage all
                </button>
              )}
            </h3>
            {staged.length > 0 && <ul>{staged.map((f) => row(f, "staged"))}</ul>}
          </section>
          <section>
            <h3 className="list-title">
              Unstaged <span className="count">{unstaged.length === 0 ? "— none" : unstaged.length}</span>
              {pickedFiles("unstaged").length > 0 && (
                <button className="btn tiny" onClick={() => stage(withOrig(pickedFiles("unstaged")))}>
                  Stage selected ({pickedFiles("unstaged").length})
                </button>
              )}
              {unstaged.length > 0 && (
                <button className="btn tiny" onClick={() => run(tab.id, "Staging…", () => api.stageAll(path), { quiet: true })}>
                  Stage all
                </button>
              )}
            </h3>
            {unstaged.length > 0 ? (
              <ul>{unstaged.map((f) => row(f, "unstaged"))}</ul>
            ) : (
              files.length === 0 && <p className="muted small pad">Working tree clean ✓</p>
            )}
          </section>
        </div>

        <CommitBox tab={tab} stagedCount={files.filter((f) => !f.untracked && !f.conflicted && f.index !== ".").length} conflicts={conflicts.length} />
      </div>

      <div className="splitter" onMouseDown={onSplit} role="separator" aria-orientation="vertical" />

      <div className="files-right">
        {shown?.kind === "conflict" ? (
          <ConflictResolver key={shown.path} tab={tab} file={shown.path} />
        ) : shown ? (
          <DiffView
            text={diffText}
            loading={diffLoading}
            fileLabel={shown.path}
            actions={shown.untracked ? [] : shown.kind === "staged" ? ["unstage"] : ["stage", "discard"]}
            onPatch={onPatch}
          />
        ) : files.length > 0 ? (
          <div className="empty">
            <Icon name="check" size={28} />
            <p>No file selected.</p>
            <p className="muted small">Click a file to see its changes.</p>
          </div>
        ) : (
          <div className="empty">
            <Icon name="check" size={28} />
            <p>No changes to show.</p>
            <p className="muted small">Edit a file in your editor and it will appear here automatically.</p>
          </div>
        )}
      </div>
      {d?.loading && !status && <div className="empty">Loading…</div>}
    </div>
  );
}

function CommitBox({ tab, stagedCount, conflicts }: { tab: Tab; stagedCount: number; conflicts: number }) {
  const d = useApp((s) => s.data[tab.id]);
  const { setUi, run } = useApp.getState();
  const a = repoActions(tab.id);
  const path = tab.path!;
  const msg = d?.ui.draft ?? "";
  const amend = d?.ui.amend ?? false;
  const first = msg.split("\n")[0] ?? "";
  const busy = !!d?.busy;
  const canCommit = !busy && conflicts === 0 && (amend ? true : stagedCount > 0 && msg.trim().length > 0);

  const doCommit = async (push: boolean) => {
    const ok = await run(tab.id, "Committing…", () => api.commit(path, msg, amend), { success: amend ? "Commit amended" : "Committed" });
    if (ok) {
      saveMessages(recordMessage(loadMessages(), msg));
      setUi(tab.id, { draft: "", amend: false });
      if (push) a.push();
    }
  };

  const toggleAmend = async (on: boolean) => {
    setUi(tab.id, { amend: on });
    if (on && !msg.trim()) {
      const m = await api.headMessage(path).catch(() => "");
      setUi(tab.id, { amend: true, draft: m });
    }
  };

  /** Earlier commit messages, listed under the box; a click puts one straight into the message box. */
  const [showMessages, setShowMessages] = useState(false);
  const used = showMessages ? loadMessages() : [];
  // The newest commits of this repository count as "latest" too, so the list is useful before any message was typed here.
  const fromRepo: { message: string; count: number; last: number }[] = [];
  for (const c of d?.log ?? []) {
    if (fromRepo.length >= 10) break;
    if (c.subject && !fromRepo.some((m) => m.message === c.subject)) fromRepo.push({ message: c.subject, count: 1, last: c.time * 1000 });
  }
  const latest = [...latestMessages(used, 10), ...fromRepo].filter((m, i, all) => all.findIndex((x) => x.message === m.message) === i).slice(0, 10);
  const top = mostUsedMessages(used, 5);
  const insert = (m: string) => {
    setUi(tab.id, { draft: m });
    setShowMessages(false);
  };
  const row = (m: { message: string; count: number }, key: string) => (
    <button key={key} className="msg-item" title={m.message} onClick={() => insert(m.message)}>
      <span className="ellipsis">{m.message.split(/\r?\n/)[0]}</span>
      {m.count > 1 && <span className="muted small">x{m.count}</span>}
    </button>
  );

  return (
    <div className="commit-box">
      <div className="msg-field">
        <textarea
          value={msg}
          placeholder={amend ? "Amend the last commit message…" : `Commit message (${formatShortcut("Mod+Enter")} to commit)`}
          aria-label="Commit message"
          onChange={(e) => setUi(tab.id, { draft: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canCommit) void doCommit(false);
          }}
          rows={3}
        />
        <button className="icon-btn msg-toggle" aria-label="Earlier commit messages" aria-expanded={showMessages} title="Earlier commit messages: click one to use it" onClick={() => {
            // The repository's latest commits come from the history, which is only loaded once History was opened.
            if (!showMessages && !d?.log.length && !d?.logLoading) void useApp.getState().loadLog(tab.id, true);
            setShowMessages((v) => !v);
          }}>
          <Icon name="history" size={14} />
        </button>
      </div>
      {showMessages && (
        <div className="msg-list" role="list" aria-label="Earlier commit messages">
          {latest.length === 0 && <p className="muted small pad">No commits yet.</p>}
          {latest.length > 0 && <div className="muted small msg-head">Latest</div>}
          {latest.map((m) => row(m, "l" + m.message))}
          {top.length > 0 && <div className="muted small msg-head">Most used</div>}
          {top.map((m) => row(m, "t" + m.message))}
        </div>
      )}
      <div className="commit-meta">
        <span
          className={first.length > 72 ? "warn-text small" : "muted small"}
          title="Length of the first line (the subject). Keep it within 72 characters so it is not cut off in git log and on hosting sites."
        >
          {first.length}/72
        </span>
        <label className="check inline">
          <input type="checkbox" checked={amend} onChange={(e) => void toggleAmend(e.target.checked)} />
          Amend last commit
        </label>
      </div>
      <div className="commit-actions">
        <button className="btn primary grow" disabled={!canCommit} onClick={() => void doCommit(false)}>
          {amend ? "Amend commit" : `Commit${stagedCount ? ` (${stagedCount})` : ""}`}
        </button>
        <button className="btn" disabled={!canCommit} onClick={() => void doCommit(true)} title="Commit, then open the push dialog">
          Commit &amp; push…
        </button>
      </div>
      {conflicts > 0 && <p className="warn-text small">Resolve all conflicts before committing.</p>}
    </div>
  );
}
