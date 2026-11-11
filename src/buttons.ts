import { create } from "zustand";
import { api, errorMessage } from "./api";
import { ICON_CHOICES, isIconName, type IconName } from "./components/Icon";
import { setInMore } from "./lib/toolbarItems";
import { useApp } from "./store";
import type { ButtonInput, ButtonKind, ButtonScope, CustomButton } from "./types";

/**
 * Custom toolbar buttons. The commands are kept and run by the backend; this side only lists them, edits them and asks
 * for one to be run by its id (see src-tauri/src/buttons.rs). Where a button sits in the toolbar, and whether it is in
 * the More menu, is decided together with the built-in buttons (see lib/toolbarItems.ts).
 */

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

/** The buttons that apply to each open tab, in their default order. */
export const useButtons = create<{ byTab: Record<string, CustomButton[]> }>(() => ({ byTab: {} }));

const NO_BUTTONS: CustomButton[] = [];

/** The buttons of one tab (a stable empty list until they are loaded). */
export function useTabButtons(tabId: string): CustomButton[] {
  return useButtons((s) => s.byTab[tabId] ?? NO_BUTTONS);
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

export async function deleteButton(tabId: string, id: string): Promise<void> {
  await api.deleteButton(tabPath(tabId), tabId, id);
  // The button is gone for good, so its place in the toolbar order is not needed any more.
  const { toolbar, setToolbar } = useApp.getState();
  setToolbar({ ...toolbar, order: toolbar.order.filter((x) => x !== id), more: toolbar.more.filter((x) => x !== id) });
  await loadAllButtons();
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

/** Runs a button, after showing its exact command when it asks first. */
export function runButton(tabId: string, b: CustomButton): void {
  const go = () => {
    const path = tabPath(tabId);
    if (!path) return;
    const opens = b.kind === "terminal" || b.kind === "url";
    void useApp.getState().run(
      tabId,
      `Running ${b.label}…`,
      async () => {
        const res = await api.runButton(path, tabId, b.id);
        // A command that succeeds without printing anything still deserves a word.
        return res.ok && !res.output.trim() && !opens ? { ...res, output: `${b.label} finished` } : res;
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

/** The dialog to add a button, or to change `existing`. */
export function openButtonDialog(tabId: string, existing?: CustomButton): void {
  const options = <K extends string>(labels: Record<K, string>) =>
    (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));
  const inToolbar = existing ? !useApp.getState().toolbar.more.includes(existing.id) : true;
  useApp.getState().openDialog({
    title: existing ? `Edit “${existing.label}”` : "Add a custom button",
    description:
      "Use {branch}, {repo} and {remote} in the command to insert the current branch, the repository folder and the remote's address.\n" +
      "Buttons are saved in Treeline's own settings on this computer, never inside a repository.",
    submitLabel: existing ? "Save" : "Add button",
    fields: [
      { key: "label", label: "Name", type: "text", value: existing?.label ?? "", placeholder: "Run tests" },
      { key: "kind", label: "What it does", type: "select", value: existing?.kind ?? "shell", options: options(KIND_LABEL) },
      {
        key: "command",
        label: "Command, git arguments or link",
        type: "text",
        value: existing?.command ?? "",
        placeholder: "npm test   ·   fetch --prune   ·   https://example.com/{branch}",
      },
      {
        key: "icon",
        label: "Icon",
        type: "icons",
        value: isIconName(existing?.icon) ? existing?.icon : "",
        options: ICON_CHOICES.map((value) => ({ value, label: value })),
      },
      { key: "scope", label: "Save it for", type: "select", value: existing?.scope ?? "repo", options: options(SCOPE_LABEL) },
      { key: "pinned", label: "Show it in the toolbar (otherwise only in the More menu)", type: "checkbox", value: inToolbar },
      { key: "confirm", label: "Ask before running it", type: "checkbox", value: existing?.confirm ?? true },
    ],
    onSubmit: async (v) => {
      const saved = await saveButton(tabId, {
        id: existing?.id,
        label: String(v.label),
        kind: v.kind as ButtonKind,
        command: String(v.command),
        scope: v.scope as ButtonScope,
        icon: String(v.icon) || null,
        confirm: !!v.confirm,
      });
      const { toolbar, setToolbar } = useApp.getState();
      setToolbar(setInMore(toolbar, saved.id, !v.pinned));
    },
  });
}
