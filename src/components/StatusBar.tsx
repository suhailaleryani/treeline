import { api, errorMessage } from "../api";
import { useAppVersion } from "../hooks";
import { GitHubStar } from "./GitHubStar";
import { Icon } from "./Icon";
import { useApp } from "../store";
import { useUi } from "../uiStore";

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
