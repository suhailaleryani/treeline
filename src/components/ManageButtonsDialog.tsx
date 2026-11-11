import { deleteButton, iconOf, KIND_LABEL, openButtonDialog, SCOPE_LABEL, useTabButtons } from "../buttons";
import { addSeparator, availableItems, BUILTIN_META, DEFAULT_TOOLBAR, isBuiltin, isSeparator, moveItem, orderedItems, removeSeparator, setInMore } from "../lib/toolbarItems";
import { useApp } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

/**
 * The toolbar's items, built-in and custom, in the order the toolbar shows them: change the order, move any item between
 * the toolbar and the More menu, and edit or remove the custom ones.
 */
export function ManageButtonsDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const custom = useTabButtons(tabId);
  const prefs = useApp((s) => s.toolbar);
  const hasSubmodules = useApp((s) => (s.data[tabId]?.submodules.length ?? 0) > 0);
  const setToolbar = useApp((s) => s.setToolbar);

  const available = availableItems(prefs, hasSubmodules, custom.map((b) => b.id));
  const items = orderedItems(prefs.order, available);

  const remove = (id: string, label: string) =>
    useApp.getState().openDialog({
      title: `Remove “${label}”?`,
      description: "The button is deleted from Treeline's settings. The command itself is not touched.",
      fields: [],
      submitLabel: "Remove",
      danger: true,
      onSubmit: () => deleteButton(tabId, id),
    });

  return (
    <Modal title="Customize toolbar" className="cb" onClose={onClose}>
      <p className="muted small">
        Buttons are shown in this order. A button that is not ticked under <em>Toolbar</em>, or that does not fit in a narrow window, is listed in the More menu
        in the same order. Use the separator button on a row to start a new group after it.
      </p>
      <div className="cb-list" role="list">
        {items.map((id, i) => {
          if (isSeparator(id)) {
            return (
              <div key={id} className="cb-row cb-sep" role="listitem">
                <span className="cb-sep-line" aria-hidden="true" />
                <div className="cb-text">
                  <strong className="ellipsis">Separator</strong>
                  <span className="muted small ellipsis">A divider between two groups of buttons</span>
                </div>
                <button className="icon-btn cb-up" aria-label="Move separator up" title="Move up" disabled={i === 0} onClick={() => setToolbar(moveItem(prefs, available, id, i - 1))}>
                  <Icon name="down" size={14} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Move separator down"
                  title="Move down"
                  disabled={i === items.length - 1}
                  onClick={() => setToolbar(moveItem(prefs, available, id, i + 1))}
                >
                  <Icon name="down" size={14} />
                </button>
                <button className="icon-btn" aria-label="Remove separator" title="Remove this separator" onClick={() => setToolbar(removeSeparator(prefs, id))}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          }
          const b = custom.find((c) => c.id === id);
          const meta = isBuiltin(id) ? BUILTIN_META[id] : null;
          const label = b?.label ?? meta?.label ?? id;
          return (
            <div key={id} className="cb-row" role="listitem">
              <Icon name={b ? iconOf(b) : (meta?.icon ?? "command")} size={16} />
              <div className="cb-text">
                <strong className="ellipsis">{label}</strong>
                <span className="muted small ellipsis" title={b?.command}>
                  {b ? (
                    <>
                      {KIND_LABEL[b.kind]} · {SCOPE_LABEL[b.scope]} · <code>{b.command}</code>
                    </>
                  ) : (
                    "Built in"
                  )}
                </span>
              </div>
              <label className="check cb-pin" title="Show in the toolbar; unticked, it is only in the More menu">
                <input type="checkbox" checked={!prefs.more.includes(id)} onChange={(e) => setToolbar(setInMore(prefs, id, !e.target.checked))} />
                Toolbar
              </label>
              <button
                className="btn tiny cb-add-sep"
                aria-label={`Add a separator after ${label}`}
                title="Add a separator after this button"
                onClick={() => setToolbar(addSeparator(prefs, available, id))}
              >
                <Icon name="separator" size={12} /> Separator
              </button>
              <button className="icon-btn cb-up" aria-label={`Move ${label} up`} title="Move up" disabled={i === 0} onClick={() => setToolbar(moveItem(prefs, available, id, i - 1))}>
                <Icon name="down" size={14} />
              </button>
              <button
                className="icon-btn"
                aria-label={`Move ${label} down`}
                title="Move down"
                disabled={i === items.length - 1}
                onClick={() => setToolbar(moveItem(prefs, available, id, i + 1))}
              >
                <Icon name="down" size={14} />
              </button>
              {b ? (
                <>
                  <button className="btn tiny" onClick={() => openButtonDialog(tabId, b)}>
                    Edit
                  </button>
                  <button className="icon-btn" aria-label={`Remove ${label}`} title="Remove" onClick={() => remove(b.id, b.label)}>
                    <Icon name="trash" size={14} />
                  </button>
                </>
              ) : (
                <span className="cb-fill" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
      <div className="modal-actions">
        <button className="btn" title="Put the buttons and separators back in their usual order, all in the toolbar. Your custom buttons are kept." onClick={() => setToolbar(DEFAULT_TOOLBAR)}>
          Reset order
        </button>
        <button className="btn" onClick={() => openButtonDialog(tabId)}>
          <Icon name="plus" size={14} /> Add a button
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
