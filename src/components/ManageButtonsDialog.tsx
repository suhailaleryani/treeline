import { useRef, useState } from "react";
import { confirmRemoveButton, iconOf, KIND_LABEL, openButtonDialog, SCOPE_LABEL, useTabButtons } from "../buttons";
import {
  addSeparator,
  availableItems,
  BUILTIN_META,
  builtinLabel,
  DEFAULT_TOOLBAR,
  isBuiltin,
  isSeparator,
  moveItem,
  orderedItems,
  removeSeparator,
  setInMore,
} from "../lib/toolbarItems";
import { useApp } from "../store";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

/**
 * The toolbar's items, built-in and custom, in the order the toolbar shows them: drag them (or use the arrows) to change
 * the order, move any item between the toolbar and the More menu, and edit or remove the custom ones.
 */
export function ManageButtonsDialog({ tabId, onClose }: { tabId: string; onClose: () => void }) {
  const custom = useTabButtons(tabId);
  const prefs = useApp((s) => s.toolbar);
  const hasSubmodules = useApp((s) => (s.data[tabId]?.submodules.length ?? 0) > 0);
  const setToolbar = useApp((s) => s.setToolbar);

  const available = availableItems(prefs, hasSubmodules, custom.map((b) => b.id));
  const items = orderedItems(prefs.order, available);

  /** The row being dragged and the row the pointer is above (`items.length` = below the last one). */
  const [drag, setDrag] = useState<{ id: string; over: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const listRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const overAt = (y: number) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(".cb-row") ?? [])];
      const i = rows.findIndex((el) => y < el.getBoundingClientRect().top + el.offsetHeight / 2);
      return i < 0 ? rows.length : i;
    };
    const move = (ev: PointerEvent) => {
      const list = listRef.current;
      if (list) {
        // Scroll the list while the pointer is near its top or bottom edge.
        const r = list.getBoundingClientRect();
        if (ev.clientY < r.top + 28) list.scrollTop -= 12;
        else if (ev.clientY > r.bottom - 28) list.scrollTop += 12;
      }
      setDrag({ id, over: overAt(ev.clientY) });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey);
    };
    const end = () => {
      stop();
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const from = items.indexOf(id);
      const to = Math.max(0, Math.min(items.length - 1, d.over > from ? d.over - 1 : d.over));
      if (to !== from) setToolbar(moveItem(useApp.getState().toolbar, available, id, to));
    };
    const cancel = () => {
      stop();
      setDrag(null);
    };
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && cancel();
    setDrag({ id, over: overAt(e.clientY) });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey);
  };

  const rowClass = (id: string, i: number, extra = "") =>
    ["cb-row", extra, drag?.id === id && "dragging", drag?.over === i && "cb-drop-before", drag?.over === items.length && i === items.length - 1 && "cb-drop-end"]
      .filter(Boolean)
      .join(" ");

  const grip = (id: string, label: string) => (
    <button className="icon-btn cb-grip" aria-label={`Drag ${label} to a new place`} title="Drag to a new place (or use the arrows)" onPointerDown={(e) => startDrag(e, id)}>
      <Icon name="grip" size={14} />
    </button>
  );

  const arrows = (id: string, label: string, i: number) => (
    <>
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
    </>
  );

  return (
    <Modal title="Customize toolbar" className="cb" onClose={onClose}>
      <p className="muted small">
        Drag the grip at the start of a row to put a button where you want it. You can also press and hold a button in the toolbar itself, then drag it, and right-click
        one for more choices. A button that is not ticked under <em>Toolbar</em>, or that does not fit in a narrow window, is listed in the More menu in the same order.
      </p>
      <div className="cb-list" role="list" ref={listRef}>
        {items.map((id, i) => {
          if (isSeparator(id)) {
            return (
              <div key={id} className={rowClass(id, i, "cb-sep")} role="listitem">
                {grip(id, "the separator")}
                <span className="cb-sep-line" aria-hidden="true" />
                <div className="cb-text">
                  <strong className="ellipsis">Separator</strong>
                  <span className="muted small ellipsis">A divider between two groups of buttons</span>
                </div>
                <span className="cb-gap cb-gap-pin" aria-hidden="true" />
                <span className="cb-gap cb-gap-sep" aria-hidden="true" />
                {arrows(id, "separator", i)}
                <span className="cb-actions">
                  <button className="icon-btn" aria-label="Remove separator" title="Remove this separator" onClick={() => setToolbar(removeSeparator(prefs, id))}>
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              </div>
            );
          }
          const b = custom.find((c) => c.id === id);
          const meta = isBuiltin(id) ? BUILTIN_META[id] : null;
          const label = b?.label ?? (isBuiltin(id) ? builtinLabel(id) : id);
          return (
            <div key={id} className={rowClass(id, i)} role="listitem">
              {grip(id, label)}
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
              {arrows(id, label, i)}
              <span className="cb-actions">
                {b && (
                  <>
                    <button className="btn tiny" onClick={() => openButtonDialog(tabId, b)}>
                      Edit
                    </button>
                    <button className="icon-btn" aria-label={`Remove ${label}`} title="Remove" onClick={() => confirmRemoveButton(tabId, b)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </span>
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
