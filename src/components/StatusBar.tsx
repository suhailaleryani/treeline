import { api, errorMessage } from "../api";
import { useAppVersion } from "../hooks";
import { Icon } from "./Icon";
import { useApp } from "../store";
import { useUi } from "../uiStore";

/** The outlined star GitHub uses on its Star button (Octicons "star", MIT licence). */
function GitHubStar() {
  return (
    <svg className="icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z" />
    </svg>
  );
}

export function StatusBar() {
  const { tabs, activeId, data, progress } = useApp();
  const tab = tabs.find((t) => t.id === activeId);
  const d = activeId ? data[activeId] : undefined;
  const version = useAppVersion();
  const update = useUi((s) => s.update);
  const busy = d?.busy ?? (d?.loading ? "Refreshing…" : null);
  return (
    <footer className="statusbar">
      <span className="status-left">
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" /> {busy}
          </>
        ) : (
          <span className="muted">Ready</span>
        )}
        {busy && progress && progress.id === activeId && (
          <>
            <span className="bar mini">
              <span className="bar-fill" style={{ width: `${progress.percent ?? 8}%` }} />
            </span>
            <span className="muted ellipsis">{progress.line}</span>
          </>
        )}
      </span>
      <span className="muted ellipsis">{tab?.path ?? ""}</span>
      <span className="status-right">
      {update && (
        <button
          className="update-pill"
          aria-label={`Version ${update.version} is available. Open settings to update`}
          title={`Version ${update.version} is available — click to update`}
          onClick={() => useUi.setState({ settings: true })}
        >
          <Icon name="down" size={11} />
          Update available: v{update.version}
        </button>
      )}
      {version && (
        <button
          className="version-btn muted"
          aria-label={`Treeline version ${version}. Star Treeline on GitHub`}
          title={`Treeline v${version}\nCreated by suhailaleryani\nStar it on GitHub: suhailaleryani/treeline`}
          onClick={() => void api.openProjectPage().catch((e) => useApp.getState().notify("error", errorMessage(e)))}
        >
          v{version}
          <GitHubStar />
        </button>
      )}
      </span>
    </footer>
  );
}
