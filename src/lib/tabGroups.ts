import type { Tab } from "../types";

/** The tab that leads `tab`'s group: its parent repository for a submodule tab, otherwise the tab itself. */
export const groupRoot = (tabs: Tab[], tab: Tab): string => (tab.parentId && tabs.some((t) => t.id === tab.parentId) ? tab.parentId : tab.id);

/** True when the tab belongs to a group of two or more (a repository with a submodule opened from it). */
export function inGroup(tabs: Tab[], tab: Tab): boolean {
  const root = groupRoot(tabs, tab);
  return tabs.some((t) => t.id !== root && t.parentId === root) || root !== tab.id;
}

/** A stable colour for a group, as a hue in degrees. */
export function groupHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/** Where a submodule tab opened from `parentId` goes: at the end of its parent's group. Also gives the group's root. */
export function insertionForChild(tabs: Tab[], parentId: string): { index: number; root: string } | null {
  const parent = tabs.find((t) => t.id === parentId);
  if (!parent) return null;
  const root = groupRoot(tabs, parent);
  let index = tabs.findIndex((t) => t.id === root) + 1;
  while (index < tabs.length && tabs[index].parentId === root) index++;
  return { index, root };
}

/**
 * Moves a tab so it ends up at `toIndex`. A submodule tab stays inside its parent's group, to the right of the parent;
 * a repository tab moves together with its submodule tabs and never lands in the middle of another group.
 */
export function moveWithinGroups(tabs: Tab[], id: string, toIndex: number): Tab[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const tab = tabs[from];
  if (tab.parentId && tabs.some((t) => t.id === tab.parentId)) {
    const rootIdx = tabs.findIndex((t) => t.id === tab.parentId);
    let last = rootIdx;
    while (last + 1 < tabs.length && tabs[last + 1].parentId === tab.parentId) last++;
    const to = Math.max(rootIdx + 1, Math.min(toIndex, last));
    if (to === from) return tabs;
    const next = [...tabs];
    next.splice(from, 1);
    next.splice(to, 0, tab);
    return next;
  }
  let end = from + 1;
  while (end < tabs.length && tabs[end].parentId === id) end++;
  const block = tabs.slice(from, end);
  const rest = [...tabs.slice(0, from), ...tabs.slice(end)];
  let pos = Math.max(0, Math.min(toIndex, rest.length));
  if (toIndex < from) while (pos > 0 && pos < rest.length && rest[pos].parentId) pos--;
  else while (pos < rest.length && rest[pos].parentId) pos++;
  if (pos === from) return tabs;
  return [...rest.slice(0, pos), ...block, ...rest.slice(pos)];
}
