import { create } from "zustand";
import { api, errorMessage } from "./api";
import { isIconName, type IconName } from "./components/Icon";
import { setInMore } from "./lib/toolbarItems";
import { useApp } from "./store";
import { useUi } from "./uiStore";
import type { ButtonInput, ButtonKind, ButtonScope, CustomButton } from "./types";

/**
 * Custom toolbar buttons. The commands are kept and run by the backend; this side only lists them, edits them and asks
 * for one to be run by its id (see src-tauri/src/buttons.rs). Where a button sits in the toolbar, and whether it is in
 * the More menu, is decided together with the built-in buttons (see lib/toolbarItems.ts).
 */

/** What each kind of button does, as the add/edit dialog explains it. */
export const KIND_INFO: Record<ButtonKind, { title: string; summary: string; placeholder: string; prefix?: string }> = {
  shell: {
    title: "Shell command",
    summary: "Runs in the repository folder. The output is shown when it ends.",
    placeholder: "npm test",
  },
  git: {
    title: "Git command",
    summary: "Runs git with these arguments, without a shell.",
    placeholder: "fetch --prune",
    prefix: "git",
  },
  terminal: {
    title: "Terminal window",
    summary: "Opens a terminal in the repository folder, runs the command and leaves the window open.",
    placeholder: "npm run dev",
  },
  url: {
    title: "Link",
    summary: "Opens a web or mail link in your browser.",
    placeholder: "https://example.com/{branch}",
  },
};

export const KIND_LABEL: Record<ButtonKind, string> = {
  shell: "Shell command",
  git: "Git command",
  terminal: "Command in a terminal window",
  url: "Open a link",
};

const KIND_ICON: Record<ButtonKind, IconName> = {
  shell: "command",
  git: "history",
  terminal: "terminal",
  url: "cloud",
};

/** The icon a button is drawn with: the one the user picked, or the one of its kind. */
export function iconOf(b: Pick<CustomButton, "icon" | "kind">): IconName {
  return isIconName(b.icon) ? b.icon : KIND_ICON[b.kind];
}

export const SCOPE_LABEL: Record<ButtonScope, string> = {
  app: "Every repository (the whole app)",
  repo: "This repository, in every tab",
  tab: "This tab only",
};

/** The buttons that apply to each open tab, in their default order, and which buttons are running right now. */
export const useButtons = create<{ byTab: Record<string, CustomButton[]>; running: Record<string, boolean> }>(() => ({ byTab: {}, running: {} }));

const NO_BUTTONS: CustomButton[] = [];

/** The buttons of one tab (a stable empty list until they are loaded). */
export function useTabButtons(tabId: string): CustomButton[] {
  return useButtons((s) => s.byTab[tabId] ?? NO_BUTTONS);
}

/** Whether this button's command is running now. */
export function useRunning(id: string): boolean {
  return useButtons((s) => !!s.running[id]);
}

const tabPath = (tabId: string) => useApp.getState().tabs.find((t) => t.id === tabId)?.path ?? "";

let lastReported = "";

/** Reads one tab's buttons from the backend. A problem with the saved file is reported once, not on every tab. */
export async function loadButtons(tabId: string): Promise<void> {
  const path = tabPath(tabId);
  if (!path) return;
  try {
    const list = await api.buttons(path, tabId);
    useButtons.setState((s) => ({ byTab: { ...s.byTab, [tabId]: list } }));
    lastReported = "";
  } catch (e) {
    const message = errorMessage(e);
    if (message !== lastReported) {
      lastReported = message;
      useApp.getState().notify("error", message);
    }
  }
}

/** App-level and repository-level buttons show in other tabs too, so every tab is read again after a change. */
export async function loadAllButtons(): Promise<void> {
  await Promise.all(useApp.getState().tabs.filter((t) => t.path).map((t) => loadButtons(t.id)));
}

/** Adds a button, or changes the one with `input.id`. Rejects with the backend's message when it is not valid. */
export async function saveButton(tabId: string, input: ButtonInput): Promise<CustomButton> {
  const saved = await api.saveButton(tabPath(tabId), tabId, input);
  await loadAllButtons();
  return saved;
}

/** Saves a button from the dialog and puts it in the toolbar or in More, as asked. */
export async function submitButton(tabId: string, input: ButtonInput, inToolbar: boolean): Promise<void> {
  const saved = await saveButton(tabId, input);
  const { toolbar, setToolbar } = useApp.getState();
  setToolbar(setInMore(toolbar, saved.id, !inToolbar));
}

export async function deleteButton(tabId: string, id: string): Promise<void> {
  await api.deleteButton(tabPath(tabId), tabId, id);
  // The button is gone for good, so its place in the toolbar order is not needed any more.
  const { toolbar, setToolbar } = useApp.getState();
  setToolbar({ ...toolbar, order: toolbar.order.filter((x) => x !== id), more: toolbar.more.filter((x) => x !== id) });
  await loadAllButtons();
}

/** Asks before a custom button is removed. */
export function confirmRemoveButton(tabId: string, b: Pick<CustomButton, "id" | "label">): void {
  useApp.getState().openDialog({
    title: `Remove “${b.label}”?`,
    description: "The button is deleted from Treeline's settings. The command itself is not touched.",
    fields: [],
    submitLabel: "Remove",
    danger: true,
    onSubmit: () => deleteButton(tabId, b.id),
  });
}

const describe = (b: CustomButton): string => {
  switch (b.kind) {
    case "git":
      return `Runs in this repository:\n\ngit ${b.command}`;
    case "terminal":
      return `Opens a terminal window in this repository's folder and runs:\n\n${b.command}`;
    case "url":
      return `Opens this link:\n\n${b.command}`;
    default:
      return `Runs in this repository's folder:\n\n${b.command}`;
  }
};

/**
 * Runs a button, after showing its exact command when it asks first. A shell or git command shows what it printed in a
 * panel when it failed or printed something; one that succeeds quietly just says so.
 */
export function runButton(tabId: string, b: CustomButton): void {
  const go = () => {
    const path = tabPath(tabId);
    if (!path) return;
    const opens = b.kind === "terminal" || b.kind === "url";
    const setRunning = (running: boolean) => useButtons.setState((s) => ({ running: { ...s.running, [b.id]: running } }));
    setRunning(true);
    void useApp.getState().run(
      tabId,
      `Running ${b.label}…`,
      async () => {
        try {
          const res = await api.runButton(path, tabId, b.id);
          const text = res.output.trim();
          if (opens || (res.ok && !text)) return opens ? res : { ...res, output: `${b.label} finished` };
          useUi.setState({
            buttonOutput: { title: b.label, command: b.kind === "git" ? `git ${b.command}` : b.command, ok: res.ok, output: text },
          });
          return { ok: true, output: "" }; // the panel says it, so no second message
        } finally {
          setRunning(false);
        }
      },
      { quiet: opens },
    );
  };
  if (!b.confirm) return go();
  useApp.getState().openDialog({
    title: `Run “${b.label}”?`,
    description: describe(b),
    fields: [],
    submitLabel: "Run",
    onSubmit: go,
  });
}

/** Opens the dialog to add a button, or to change `existing`. */
export function openButtonDialog(tabId: string, existing?: CustomButton): void {
  useUi.setState({ buttonDialog: { tabId, existing } });
}
