import type { IconName } from "../components/Icon";

// The toolbar is one ordered list of items: the built-in buttons, the user's custom ones and separators between groups.
// The user chooses the order, which buttons live in the More menu and where the separators are; all of it is saved as lists
// of ids, so an item that is not there now (a custom button of another repository, Sync subs in a repository without
// submodules) keeps its place for when it comes back.

/** The built-in buttons, in their default order. "subs" is only there for a repository that has submodules. */
export const BUILTIN_IDS = ["commit", "fetch", "pull", "push", "subs", "branch", "merge", "stash", "tag"] as const;
export type BuiltinId = (typeof BUILTIN_IDS)[number];

export const isBuiltin = (id: string): id is BuiltinId => (BUILTIN_IDS as readonly string[]).includes(id);

/** A separator is an item whose id starts with this. */
const SEPARATOR_PREFIX = "sep:";
export const isSeparator = (id: string): boolean => id.startsWith(SEPARATOR_PREFIX);

/** The separators a toolbar starts with: after Commit and after Push, where the groups of daily buttons end. */
export const DEFAULT_SEPARATORS = ["sep:1", "sep:2"];

/** Everything the toolbar starts with, in its default order. */
const DEFAULT_ITEMS = ["commit", "sep:1", "fetch", "pull", "push", "sep:2", "subs", "branch", "merge", "stash", "tag"];

/** How each built-in button is named and drawn (also in the dialog that orders them). */
export const BUILTIN_META: Record<BuiltinId, { label: string; icon: IconName }> = {
  commit: { label: "Commit", icon: "files" },
  fetch: { label: "Fetch", icon: "fetch" },
  pull: { label: "Pull", icon: "pull" },
  push: { label: "Push", icon: "push" },
  subs: { label: "Sync subs", icon: "submodule" },
  branch: { label: "Branch", icon: "branch" },
  merge: { label: "Merge", icon: "merge" },
  stash: { label: "Stash", icon: "stash" },
  tag: { label: "Tag", icon: "tag" },
};

/** What the user changed. All lists hold item ids; an empty `order` means the default order. */
export interface ToolbarPrefs {
  order: string[];
  /** Buttons the user put in the More menu instead of the toolbar. */
  more: string[];
  /** The separators that exist; null until the user adds or removes one, meaning the defaults. */
  separators: string[] | null;
}

export const DEFAULT_TOOLBAR: ToolbarPrefs = { order: [], more: [], separators: null };

/** Reads saved preferences defensively: anything that is not a list of short strings is dropped. */
export function cleanPrefs(value: unknown): ToolbarPrefs {
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 100))] : [];
  const o = (value ?? {}) as { order?: unknown; more?: unknown; separators?: unknown };
  return {
    order: list(o.order),
    more: list(o.more),
    separators: Array.isArray(o.separators) ? list(o.separators).filter(isSeparator) : null,
  };
}

/**
 * Every item that exists now, in its default order: the built-in buttons (with their default separators), the
 * separators the user added, then the custom buttons.
 */
export function availableItems(prefs: ToolbarPrefs, hasSubmodules: boolean, customIds: readonly string[]): string[] {
  const separators = prefs.separators ?? DEFAULT_SEPARATORS;
  const base = DEFAULT_ITEMS.filter((id) => (id === "subs" ? hasSubmodules : isSeparator(id) ? separators.includes(id) : true));
  return [...base, ...separators.filter((id) => !DEFAULT_ITEMS.includes(id)), ...customIds];
}

/**
 * All items that exist now, in the order the user chose. `available` is every item that exists now in its default order.
 * An item the saved order does not know yet goes to the end if it is a custom button; an item the toolbar starts with
 * goes right after the item that precedes it by default, so a returning "subs" lands between Push and Branch.
 */
export function orderedItems(order: readonly string[], available: readonly string[]): string[] {
  const exists = new Set(available);
  const out = order.filter((id, i) => exists.has(id) && order.indexOf(id) === i);
  available.forEach((id, i) => {
    if (out.includes(id)) return;
    let at = out.length;
    if (DEFAULT_ITEMS.includes(id)) {
      at = 0;
      for (let k = i - 1; k >= 0; k--) {
        const j = out.indexOf(available[k]);
        if (j >= 0) {
          at = j + 1;
          break;
        }
      }
    }
    out.splice(at, 0, id);
  });
  return out;
}

/** Drops separators at either end and keeps one where several meet, so a group that emptied out leaves no stray line. */
function tidy(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (isSeparator(id) && (out.length === 0 || isSeparator(out[out.length - 1]))) continue;
    out.push(id);
  }
  while (out.length && isSeparator(out[out.length - 1])) out.pop();
  return out;
}

/**
 * Splits the ordered items into those drawn in the toolbar (at most `capacity` buttons) and those in the More menu, in
 * order. Separators do not use up room; each list keeps only the ones that sit between two of its buttons.
 */
export function arrange(
  prefs: ToolbarPrefs,
  available: readonly string[],
  capacity: number,
): { all: string[]; toolbar: string[]; more: string[] } {
  const all = orderedItems(prefs.order, available);
  const shown = new Set(all.filter((id) => !isSeparator(id) && !prefs.more.includes(id)).slice(0, Math.max(0, capacity)));
  return {
    all,
    toolbar: tidy(all.filter((id) => isSeparator(id) || shown.has(id))),
    more: tidy(all.filter((id) => isSeparator(id) || !shown.has(id))),
  };
}

/**
 * The saved order after the items present now were put in `ordered` (a permutation of them): every present item takes
 * the place of one present item, and items that are absent now stay exactly where they were.
 */
export function withOrder(saved: readonly string[], ordered: readonly string[]): string[] {
  const present = new Set(ordered);
  const queue = [...ordered];
  const out = saved.map((id) => (present.has(id) ? (queue.shift() as string) : id));
  // Ids the saved order did not contain yet.
  for (const id of queue) if (!out.includes(id)) out.push(id);
  return [...new Set(out)];
}

/** Moves one item to a new place in the order. */
export function moveItem(prefs: ToolbarPrefs, available: readonly string[], id: string, to: number): ToolbarPrefs {
  const all = orderedItems(prefs.order, available);
  const from = all.indexOf(id);
  if (from < 0 || to < 0 || to >= all.length || from === to) return prefs;
  const next = [...all];
  next.splice(to, 0, ...next.splice(from, 1));
  return { ...prefs, order: withOrder(prefs.order, next) };
}

/** Puts a button in the More menu (`inMore`) or back in the toolbar. */
export function setInMore(prefs: ToolbarPrefs, id: string, inMore: boolean): ToolbarPrefs {
  const rest = prefs.more.filter((m) => m !== id);
  return { ...prefs, more: inMore ? [...rest, id] : rest };
}

/**
 * Adds a new separator right after the item `afterId` (at the end when that item is not there). `available` is the
 * list of items that exist now, without the new separator.
 */
export function addSeparator(
  prefs: ToolbarPrefs,
  available: readonly string[],
  afterId: string,
  newId = `${SEPARATOR_PREFIX}${Date.now().toString(36)}`,
): ToolbarPrefs {
  const next = orderedItems(prefs.order, available);
  const at = next.indexOf(afterId);
  next.splice(at < 0 ? next.length : at + 1, 0, newId);
  return {
    ...prefs,
    order: withOrder(prefs.order, next),
    separators: [...(prefs.separators ?? DEFAULT_SEPARATORS), newId],
  };
}

/** Removes a separator for good. */
export function removeSeparator(prefs: ToolbarPrefs, id: string): ToolbarPrefs {
  return {
    order: prefs.order.filter((x) => x !== id),
    more: prefs.more,
    separators: (prefs.separators ?? DEFAULT_SEPARATORS).filter((x) => x !== id),
  };
}
