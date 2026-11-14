import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Icon, type IconName } from "./Icon";
import { GitHubStar } from "./GitHubStar";
import { useUi } from "../uiStore";
import { useApp } from "../store";
import { open } from "@tauri-apps/plugin-dialog";
import { api, errorMessage } from "../api";
import type { Update } from "@tauri-apps/plugin-updater";
import { useAppVersion } from "../hooks";
import { openGuide } from "../guide";
import { checkForUpdate, installUpdate } from "../updater";
import type { GitInfo, ThemeMode } from "../types";
import { FETCH_SECOND_CHOICES, fetchSecondsLabel, loadFetchSeconds, saveFetchSeconds } from "../lib/autoFetch";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; percent: number | null }
  | { kind: "failed"; message: string };

/** One titled block of the dialog. */
function Section({ icon, title, hint, children, highlight }: { icon: IconName; title: string; hint?: string; children: ReactNode; highlight?: boolean }) {
  return (
    <section className={`set-section${highlight ? " highlight" : ""}`}>
      <header className="set-head">
        <Icon name={icon} size={15} />
        <h3>{title}</h3>
      </header>
      {hint && <p className="muted small set-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** App settings: the Git program, background fetch, appearance, and about / updates. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const version = useAppVersion();
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [fetchSeconds, setFetchSeconds] = useState(loadFetchSeconds);
  const found = useUi((s) => s.update);
  const [upd, setUpd] = useState<UpdateState>(found ? { kind: "available", update: found } : { kind: "idle" });

  const checkUpdates = async () => {
    setUpd({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      if (update) useUi.setState({ update });
      setUpd(update ? { kind: "available", update } : { kind: "latest" });
    } catch (e) {
      setUpd({ kind: "failed", message: errorMessage(e) });
    }
  };

  const install = async (update: Update) => {
    setInstallError(null);
    setUpd({ kind: "installing", percent: null });
    try {
      await installUpdate(update, (percent) => setUpd({ kind: "installing", percent }));
    } catch (e) {
      // Back to the offer, so it can be tried again.
      setUpd({ kind: "available", update });
      setInstallError(errorMessage(e));
    }
  };

  useEffect(() => {
    api.gitInfo().then(setInfo, (e) => setError(errorMessage(e)));
  }, []);

  const apply = useCallback(async (path: string | null) => {
    setBusy(true);
    setError(null);
    try {
      setInfo(await api.setGitPath(path));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const browse = async () => {
    const file = await open({
      multiple: false,
      directory: false,
      title: "Locate the Git program (git.exe)",
      filters: [{ name: "Git", extensions: ["exe"] }, { name: "All files", extensions: ["*"] }],
    });
    if (typeof file === "string") await apply(file);
  };

  const installing = upd.kind === "installing";
  const pending = upd.kind === "available" || installing;

  /** The update block: a call to action when a version is waiting, otherwise a plain "check" row. */
  const updateBody = (
    <>
      {upd.kind === "available" && (
        <>
          <div className="upd-line">
            <span className="upd-pill">New</span>
            <strong>Version {upd.update.version}</strong>
            <span className="muted small">is ready. You have {version ?? "an older version"}.</span>
          </div>
          {upd.update.body && <pre className="upd-notes">{upd.update.body}</pre>}
          <p className="muted small">Installing closes the app and starts the new version.</p>
          <div className="row">
            <button className="btn primary" onClick={() => void install(upd.update)}>
              <Icon name="down" size={14} /> Install update and restart
            </button>
          </div>
        </>
      )}
      {installing && (
        <div className="progress" aria-live="polite">
          <div className="bar">
            <div className="bar-fill" style={{ width: `${upd.percent ?? 5}%` }} />
          </div>
          <span className="muted small">{upd.percent === null ? "Downloading…" : `Downloading… ${upd.percent}%`} Please keep the app open.</span>
        </div>
      )}
      {!pending && (
        <div className="set-row">
          <span className="small">
            {upd.kind === "latest" ? (
              <span className="ok-text" role="status">✓ You have the latest version</span>
            ) : upd.kind === "failed" ? (
              <span className="err-text" role="alert">Could not check: {upd.message}</span>
            ) : (
              <span className="muted">Treeline looks for updates by itself every few hours.</span>
            )}
          </span>
          <button className="btn" onClick={() => void checkUpdates()} disabled={upd.kind === "checking"}>
            {upd.kind === "checking" ? "Checking…" : "Check for updates"}
          </button>
        </div>
      )}
      {installError && upd.kind === "available" && (
        <p className="err-text small" role="alert">The update could not be installed: {installError}</p>
      )}
    </>
  );

  return (
    <Modal title="Settings" className="settings" onClose={onClose} busy={installing}>
      <div className="set-body">
        {/* A waiting update comes first, so it is the first thing seen when the dialog opens from the status bar. */}
        {pending && (
          <Section icon="down" title="Update available" highlight>
            {updateBody}
          </Section>
        )}

        <Section icon="terminal" title="Git program">
          {info ? (
            <>
              <div className="set-row">
                <span className={`small ${info.version ? "ok-text" : "err-text"}`} role="status">
                  {info.version ? `✓ ${info.version}` : "✗ Git could not be started."}
                </span>
              </div>
              <p className="muted small set-path">
                {info.custom ? "Using the program you chose:" : "Found automatically:"} <code>{info.path}</code>
              </p>
            </>
          ) : (
            <p className="muted small">Checking…</p>
          )}
          <div className="row">
            <button className="btn" onClick={() => void browse()} disabled={busy}>
              Change…
            </button>
            <button className="btn" onClick={() => void apply(null)} disabled={busy || !info?.custom}>
              Use automatic detection
            </button>
          </div>
          {error && <p className="err-text small" role="alert">{error}</p>}
        </Section>

        <Section
          icon="refresh"
          title="Background fetch"
          hint="Looks for new commits and branches on the server in the tab you are viewing, so merges done on GitHub or GitLab show up by themselves. It only downloads; it never changes your files."
        >
          <label className="set-row">
            <span className="small">Check the server</span>
            <select
              value={fetchSeconds}
              aria-label="How often to fetch in the background"
              onChange={(e) => {
                const n = Number(e.target.value);
                setFetchSeconds(n);
                saveFetchSeconds(n);
              }}
            >
              {FETCH_SECOND_CHOICES.map((sec) => (
                <option key={sec} value={sec}>
                  {fetchSecondsLabel(sec)}
                </option>
              ))}
            </select>
          </label>
          {fetchSeconds > 0 && fetchSeconds < 60 && (
            <p className="warn-text small">Very short intervals use more network and battery, and some servers limit how often you may contact them.</p>
          )}
        </Section>

        <Section icon="sun" title="Appearance">
          <div className="set-row">
            <span className="small">Theme</span>
            <div className="seg" role="radiogroup" aria-label="Theme">
              {(["system", "light", "dark"] as ThemeMode[]).map((t) => (
                <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "active" : ""} onClick={() => setTheme(t)}>
                  {t === "system" ? "System" : t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon="help" title="About">
          <div className="set-row">
            <span className="small">
              <strong>Treeline</strong> {version ? <span className="muted">version {version}</span> : null}
            </span>
            <span className="row">
              <button className="btn tiny" onClick={() => void openGuide().catch((e) => useApp.getState().notify("error", errorMessage(e)))}>
                User guide
              </button>
            </span>
          </div>
          <div className="set-star">
            <span className="small">
              <strong>Enjoying Treeline?</strong> <span className="muted">A star on GitHub helps other people find it, and it is free.</span>
            </span>
            <button className="btn" onClick={() => void api.openProjectPage().catch((e) => useApp.getState().notify("error", errorMessage(e)))}>
              <GitHubStar size={14} /> Star on GitHub
            </button>
          </div>
          {!pending && updateBody}
        </Section>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose} disabled={installing}>
          Close
        </button>
      </div>
    </Modal>
  );
}
