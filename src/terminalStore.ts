import { create } from "zustand";
import { disposeTerminal } from "./lib/terminalRegistry";
import { useUi } from "./uiStore";

export type Dock = "bottom" | "right";

/** One terminal in a group's tab strip. `gen` changes to restart its shell in `path`. */
export interface TermTab {
  id: number;
  path: string;
  gen: number;
}

/** A piece of the terminal area: its own tabs, docked at the bottom or on the right. */
export interface TermGroup {
  id: number;
  dock: Dock;
  tabs: TermTab[];
  current: number;
}

interface State {
  groups: TermGroup[];
  focusedGroup: number | null;
}

export const useTerminals = create<State>(() => ({ groups: [], focusedGroup: null }));

let seq = 1;
const tabFor = (path: string): TermTab => ({ id: seq++, path, gen: 0 });
const set = (fn: (s: State) => Partial<State>) => useTerminals.setState(fn);
const patchGroup = (groupId: number, fn: (g: TermGroup) => TermGroup) =>
  set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? fn(g) : g)) }));

/** A new piece of the terminal area with one terminal in it, docked at `dock` (next to the others there). */
export function newGroup(path: string, dock: Dock) {
  const tab = tabFor(path);
  const id = seq++;
  set((s) => ({ groups: [...s.groups, { id, dock, tabs: [tab], current: tab.id }], focusedGroup: id }));
}

export function addTab(groupId: number, path: string) {
  const tab = tabFor(path);
  patchGroup(groupId, (g) => ({ ...g, tabs: [...g.tabs, tab], current: tab.id }));
  set(() => ({ focusedGroup: groupId }));
}

export function selectTab(groupId: number, tabId: number) {
  patchGroup(groupId, (g) => ({ ...g, current: tabId }));
  set(() => ({ focusedGroup: groupId }));
}

export function focusGroup(groupId: number) {
  if (useTerminals.getState().focusedGroup !== groupId) set(() => ({ focusedGroup: groupId }));
}

/** Ends a terminal. The group goes with its last terminal, and the panel hides when none are left. */
export function closeTab(groupId: number, tabId: number) {
  disposeTerminal(tabId);
  const g = useTerminals.getState().groups.find((x) => x.id === groupId);
  if (!g) return;
  const i = g.tabs.findIndex((t) => t.id === tabId);
  const tabs = g.tabs.filter((t) => t.id !== tabId);
  if (tabs.length > 0) {
    patchGroup(groupId, (x) => ({ ...x, tabs, current: x.current === tabId ? tabs[Math.min(i, tabs.length - 1)].id : x.current }));
    return;
  }
  const groups = useTerminals.getState().groups.filter((x) => x.id !== groupId);
  set((s) => ({ groups, focusedGroup: s.focusedGroup === groupId ? (groups[0]?.id ?? null) : s.focusedGroup }));
  if (groups.length === 0) useUi.setState({ terminalOpen: false });
}

/** Closes a whole group: ends every shell in it and removes it. The other groups stay; the panel hides when none are left. */
export function closeGroup(groupId: number) {
  const g = useTerminals.getState().groups.find((x) => x.id === groupId);
  if (!g) return;
  for (const t of g.tabs) disposeTerminal(t.id);
  const groups = useTerminals.getState().groups.filter((x) => x.id !== groupId);
  set((s) => ({ groups, focusedGroup: s.focusedGroup === groupId ? (groups[0]?.id ?? null) : s.focusedGroup }));
  if (groups.length === 0) useUi.setState({ terminalOpen: false });
}

/** Moves a group to the other dock. Its shells keep running. */
export function moveGroup(groupId: number, dock: Dock) {
  patchGroup(groupId, (g) => ({ ...g, dock }));
}

/** Replaces the shell of one terminal with a new one in `path`. */
export function restartTab(groupId: number, tabId: number, path: string) {
  disposeTerminal(tabId);
  patchGroup(groupId, (g) => ({ ...g, tabs: g.tabs.map((t) => (t.id === tabId ? { ...t, path, gen: t.gen + 1 } : t)) }));
}
