import { useSplit } from "../hooks";
import { useApp } from "../store";
import { ErrorBox } from "./ErrorBox";
import type { Tab } from "../types";
import { FilesView } from "./FilesView";
import { HistoryView } from "./HistoryView";
import { RepoSidebar } from "./RepoSidebar";
import { Toolbar } from "./Toolbar";

export function RepoView({ tab }: { tab: Tab }) {
  const d = useApp((s) => s.data[tab.id]);
  const [sideW, onSideSplit, resetSide] = useSplit("repo-sidebar", 248, 160, 600, "x");
  return (
    <div className="repo">
      <Toolbar tab={tab} />
      {d?.error && (
        <div className="error-banner-wrap">
          <ErrorBox text={d.error} compact />
        </div>
      )}
      <div className="repo-body">
        <RepoSidebar tab={tab} width={sideW} />
        <div className="splitter" onMouseDown={onSideSplit} onDoubleClick={() => resetSide()} role="separator" aria-orientation="vertical" title="Drag to resize the sidebar. Double-click to reset." />
        <div className="repo-main">
          {!d?.status && !d?.error ? (
            <div className="empty">Loading repository…</div>
          ) : d?.ui.view === "history" ? (
            <HistoryView tab={tab} />
          ) : (
            <FilesView tab={tab} />
          )}
        </div>
      </div>
    </div>
  );
}
