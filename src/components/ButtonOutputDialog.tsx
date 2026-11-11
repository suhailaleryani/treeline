import { useState } from "react";
import { useUi } from "../uiStore";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

/** What a custom button's command printed, with whether it worked, and a way to copy it. */
export function ButtonOutputDialog() {
  const out = useUi((s) => s.buttonOutput);
  const [copied, setCopied] = useState(false);
  if (!out) return null;
  const close = () => useUi.setState({ buttonOutput: null });
  const copy = () =>
    void navigator.clipboard?.writeText(out.output).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <Modal
      title={
        <span className="bo-title">
          <span className={`bo-status ${out.ok ? "ok" : "fail"}`}>
            <Icon name={out.ok ? "check" : "warn"} size={14} /> {out.ok ? "Finished" : "Failed"}
          </span>
          {out.title}
        </span>
      }
      label={`${out.title}: ${out.ok ? "finished" : "failed"}`}
      className="bo"
      onClose={close}
    >
      <code className="bo-command">{out.command}</code>
      <pre className="bo-output" tabIndex={0} aria-label="Output">
        {out.output || "(no output)"}
      </pre>
      <div className="modal-actions">
        <button className="btn" onClick={copy} disabled={!out.output}>
          {copied ? "Copied ✓" : "Copy output"}
        </button>
        <button className="btn primary" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}
