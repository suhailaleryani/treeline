import { useRef, useState } from "react";
import { errorMessage } from "../api";
import { iconOf, KIND_INFO, SCOPE_LABEL, submitButton } from "../buttons";
import { useApp } from "../store";
import type { ButtonKind, ButtonScope, CustomButton } from "../types";
import { ErrorBox } from "./ErrorBox";
import { Icon, ICON_CHOICES } from "./Icon";
import { Modal } from "./Modal";

const KINDS = Object.keys(KIND_INFO) as ButtonKind[];
const SCOPES = Object.keys(SCOPE_LABEL) as ButtonScope[];

/** What each placeholder stands for, shown on its chip. */
const TOKENS = [
  { token: "{branch}", hint: "The branch that is checked out" },
  { token: "{repo}", hint: "The repository's folder" },
  { token: "{remote}", hint: "The first remote's address, without any password" },
];

/** Adds or changes a custom toolbar button: what it does, what it looks like, and where it is saved. */
export function ButtonDialog({ tabId, existing, onClose }: { tabId: string; existing?: CustomButton; onClose: () => void }) {
  const inToolbar = existing ? !useApp.getState().toolbar.more.includes(existing.id) : true;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [kind, setKind] = useState<ButtonKind>(existing?.kind ?? "shell");
  const [command, setCommand] = useState(existing?.command ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [scope, setScope] = useState<ButtonScope>(existing?.scope ?? "repo");
  const [pinned, setPinned] = useState(inToolbar);
  const [confirm, setConfirm] = useState(existing?.confirm ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commandInput = useRef<HTMLInputElement>(null);

  const info = KIND_INFO[kind];
  const ready = label.trim() !== "" && command.trim() !== "";

  /** Inserts a placeholder where the cursor is in the command. */
  const insert = (token: string) => {
    const el = commandInput.current;
    const start = el?.selectionStart ?? command.length;
    const end = el?.selectionEnd ?? command.length;
    setCommand(command.slice(0, start) + token + command.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitButton(tabId, { id: existing?.id, label, kind, command, scope, icon: icon || null, confirm }, pinned);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? `Edit “${existing.label}”` : "Add a custom button"}
      className="bd"
      onClose={onClose}
      busy={busy}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <div className="bd-top">
        <div className="bd-preview" aria-label="How the button will look">
          <span className="tool bd-preview-tool">
            <span className="tool-icon">
              <Icon name={iconOf({ icon, kind })} size={18} />
            </span>
            <span className="tool-label">{label.trim() || "Name"}</span>
          </span>
        </div>
        <label className="bd-name">
          Name
          <input autoFocus value={label} placeholder="Run tests" maxLength={40} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>

      <div className="field">
        <span id="bd-kind">What it does</span>
        <div className="bd-kinds" role="radiogroup" aria-labelledby="bd-kind">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={`bd-kind${kind === k ? " on" : ""}`}
              onClick={() => setKind(k)}
            >
              <strong>{KIND_INFO[k].title}</strong>
              <span>{KIND_INFO[k].summary}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="bd-command">{kind === "url" ? "Link" : kind === "git" ? "Git arguments" : "Command"}</label>
        <div className="bd-command">
          {info.prefix && <code className="bd-prefix">{info.prefix}</code>}
          <input id="bd-command" ref={commandInput} value={command} placeholder={info.placeholder} spellCheck={false} onChange={(e) => setCommand(e.target.value)} />
        </div>
        <div className="bd-tokens">
          <span className="muted small">Insert:</span>
          {TOKENS.map((t) => (
            <button key={t.token} type="button" className="btn tiny" title={t.hint} onClick={() => insert(t.token)}>
              {t.token}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span id="bd-icon">Icon</span>
        <div className="icon-grid" role="radiogroup" aria-labelledby="bd-icon">
          {["", ...ICON_CHOICES].map((name) => (
            <button
              key={name || "auto"}
              type="button"
              role="radio"
              aria-checked={icon === name}
              aria-label={name || "Automatic icon for this kind of button"}
              title={name || "Automatic: the icon of this kind of button"}
              className={`icon-choice${icon === name ? " on" : ""}`}
              onClick={() => setIcon(name)}
            >
              {name ? <Icon name={name as (typeof ICON_CHOICES)[number]} size={18} /> : <span className="icon-default">Auto</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span id="bd-scope">Save it for</span>
        <div className="bd-scopes" role="radiogroup" aria-labelledby="bd-scope">
          {SCOPES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={scope === s} className={`bd-scope${scope === s ? " on" : ""}`} onClick={() => setScope(s)}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
        Show it in the toolbar (otherwise only in the More menu)
      </label>
      <label className="check">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        Show the command and ask before running it
      </label>

      {error && <ErrorBox text={error} compact />}
      <div className="modal-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => void submit()} disabled={!ready || busy}>
          {existing ? "Save" : "Add button"}
        </button>
      </div>
    </Modal>
  );
}
