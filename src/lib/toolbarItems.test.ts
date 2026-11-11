import { describe, expect, it } from "vitest";
import {
  addSeparator,
  arrange,
  availableItems,
  cleanPrefs,
  DEFAULT_MORE,
  dropInToolbar,
  DEFAULT_TOOLBAR,
  moveItem,
  orderedItems,
  removeSeparator,
  setInMore,
  withOrder,
  type ToolbarPrefs,
} from "./toolbarItems";

const prefs = (p: Partial<ToolbarPrefs> = {}): ToolbarPrefs => ({ ...DEFAULT_TOOLBAR, ...p });
const available = ["commit", "fetch", "pull", "push", "branch", "merge", "stash", "tag", "b1", "b2"];

describe("availableItems", () => {
  it("starts with the usual separators and the rarer actions at the end", () => {
    expect(availableItems(DEFAULT_TOOLBAR, false, [])).toEqual([
      "commit", "sep:1", "fetch", "pull", "push", "sep:2", "branch", "merge", "stash", "tag",
      "multimerge", "cleanup", "sep:3", "terminal", "reveal",
    ]);
  });
  it("adds Sync subs only for a repository with submodules, and the custom buttons last", () => {
    const items = availableItems(DEFAULT_TOOLBAR, true, ["b1"]);
    expect(items.indexOf("subs")).toBe(items.indexOf("sep:2") + 1);
    expect(items[items.length - 1]).toBe("b1");
  });
  it("follows the separators the user kept", () => {
    expect(availableItems(prefs({ separators: ["sep:2", "sep:x"] }), false, [])).toEqual([
      "commit", "fetch", "pull", "push", "sep:2", "branch", "merge", "stash", "tag",
      "multimerge", "cleanup", "terminal", "reveal", "sep:x",
    ]);
    expect(availableItems(prefs({ separators: [] }), false, [])).not.toContain("sep:1");
  });
});

describe("orderedItems", () => {
  it("keeps the default order when nothing was chosen", () => {
    expect(orderedItems([], available)).toEqual(available);
  });
  it("follows the saved order and ignores items that do not exist now", () => {
    expect(orderedItems(["push", "gone", "commit"], ["commit", "fetch", "push"])).toEqual(["push", "commit", "fetch"]);
  });
  it("puts a new custom button at the end, not in front of the saved items", () => {
    const saved = ["tag", "commit", "fetch", "pull", "push", "branch", "merge", "stash"];
    const now = ["commit", "fetch", "pull", "push", "branch", "merge", "stash", "tag", "b1"];
    expect(orderedItems(saved, now)).toEqual([...saved, "b1"]);
  });
  it("puts a returning built-in back at its default place", () => {
    const withoutSubs = ["commit", "fetch", "pull", "push", "branch"];
    expect(orderedItems(withoutSubs, ["commit", "fetch", "pull", "push", "subs", "branch"])).toEqual(["commit", "fetch", "pull", "push", "subs", "branch"]);
  });
  it("does not repeat an item that was saved twice", () => {
    expect(orderedItems(["a", "a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("arrange", () => {
  const p = prefs({ more: ["fetch"] });
  it("keeps what fits in the toolbar and sends the rest, and the chosen ones, to More in order", () => {
    const r = arrange(p, available, 5);
    expect(r.toolbar).toEqual(["commit", "pull", "push", "branch", "merge"]);
    expect(r.more).toEqual(["fetch", "stash", "tag", "b1", "b2"]);
  });
  it("shows everything on a wide window", () => {
    expect(arrange(prefs({ more: [] }), available, Infinity).more).toEqual([]);
  });
  it("shows nothing when there is no room", () => {
    expect(arrange(DEFAULT_TOOLBAR, available, 0).toolbar).toEqual([]);
  });
});

describe("the rarer actions", () => {
  const items = availableItems(DEFAULT_TOOLBAR, false, []);
  it("start in More, grouped as they were in the menu", () => {
    const r = arrange(DEFAULT_TOOLBAR, items, Infinity);
    expect(r.toolbar).toEqual(["commit", "sep:1", "fetch", "pull", "push", "sep:2", "branch", "merge", "stash", "tag"]);
    expect(r.more).toEqual(["multimerge", "cleanup", "sep:3", "terminal", "reveal"]);
  });
  it("can be shown in the toolbar like any other button", () => {
    const r = arrange(setInMore(DEFAULT_TOOLBAR, "terminal", false), items, Infinity);
    expect(r.toolbar).toEqual(["commit", "sep:1", "fetch", "pull", "push", "sep:2", "branch", "merge", "stash", "tag", "sep:3", "terminal"]);
    expect(r.more).toEqual(["multimerge", "cleanup", "sep:3", "reveal"]);
  });
});

describe("separators in the layout", () => {
  const items = availableItems(DEFAULT_TOOLBAR, false, ["b1"]);
  it("are drawn between the groups and do not use up room", () => {
    const r = arrange(DEFAULT_TOOLBAR, items, 4);
    expect(r.toolbar).toEqual(["commit", "sep:1", "fetch", "pull", "push"]);
  });
  it("leave no stray line at the end of the toolbar or the start of More", () => {
    const r = arrange(DEFAULT_TOOLBAR, items, 4);
    expect(r.toolbar[r.toolbar.length - 1]).not.toMatch(/^sep:/);
    expect(r.more[0]).not.toMatch(/^sep:/);
    expect(r.more).toEqual(["branch", "merge", "stash", "tag", "multimerge", "cleanup", "sep:3", "terminal", "reveal", "b1"]);
  });
  it("collapse into one where a group has moved away", () => {
    // Fetch, Pull and Push in More: the two separators around them would meet in the toolbar
    const r = arrange(prefs({ more: ["fetch", "pull", "push"] }), items, Infinity);
    expect(r.toolbar).toEqual(["commit", "sep:1", "branch", "merge", "stash", "tag", "multimerge", "cleanup", "sep:3", "terminal", "reveal", "b1"]);
    expect(r.more).toEqual(["fetch", "pull", "push"]);
  });
  it("show up in More between its groups", () => {
    const r = arrange(DEFAULT_TOOLBAR, items, 1);
    expect(r.toolbar).toEqual(["commit"]);
    expect(r.more).toEqual(["fetch", "pull", "push", "sep:2", "branch", "merge", "stash", "tag", "multimerge", "cleanup", "sep:3", "terminal", "reveal", "b1"]);
  });
});

describe("addSeparator and removeSeparator", () => {
  const items = availableItems(DEFAULT_TOOLBAR, false, ["b1"]);
  it("adds a separator right after the chosen button", () => {
    const next = addSeparator(DEFAULT_TOOLBAR, items, "tag", "sep:new");
    const order = orderedItems(next.order, availableItems(next, false, ["b1"]));
    expect(order.indexOf("sep:new")).toBe(order.indexOf("tag") + 1);
    expect(next.separators).toEqual(["sep:1", "sep:2", "sep:3", "sep:new"]);
  });
  it("can add one between any two buttons, and again after that", () => {
    let p = addSeparator(DEFAULT_TOOLBAR, items, "merge", "sep:a");
    p = addSeparator(p, availableItems(p, false, ["b1"]), "stash", "sep:b");
    const order = orderedItems(p.order, availableItems(p, false, ["b1"]));
    expect(order.slice(order.indexOf("merge"), order.indexOf("merge") + 4)).toEqual(["merge", "sep:a", "stash", "sep:b"]);
  });
  it("removes a separator, even one of the defaults, and remembers that", () => {
    const p = removeSeparator(addSeparator(DEFAULT_TOOLBAR, items, "tag", "sep:new"), "sep:1");
    expect(p.separators).toEqual(["sep:2", "sep:3", "sep:new"]);
    expect(availableItems(p, false, [])).not.toContain("sep:1");
    expect(p.order).not.toContain("sep:1");
  });
  it("keeps the order the user chose when it adds one", () => {
    const moved = moveItem(DEFAULT_TOOLBAR, items, "tag", 0);
    const p = addSeparator(moved, items, "tag", "sep:new");
    expect(orderedItems(p.order, availableItems(p, false, ["b1"])).slice(0, 3)).toEqual(["tag", "sep:new", "commit"]);
  });
});

describe("moveItem", () => {
  it("moves an item, built-in or custom, to a new place", () => {
    expect(moveItem(DEFAULT_TOOLBAR, available, "b1", 0).order.slice(0, 3)).toEqual(["b1", "commit", "fetch"]);
    expect(moveItem(DEFAULT_TOOLBAR, available, "commit", 2).order.slice(0, 3)).toEqual(["fetch", "pull", "commit"]);
  });
  it("moves a separator like any other item", () => {
    const items = availableItems(DEFAULT_TOOLBAR, false, []);
    const p = moveItem(DEFAULT_TOOLBAR, items, "sep:1", items.length - 1);
    const ordered = orderedItems(p.order, items);
    expect(ordered[ordered.length - 1]).toBe("sep:1");
  });
  it("ignores a move that goes nowhere", () => {
    const p = prefs({ order: [...available] });
    expect(moveItem(p, available, "commit", 0)).toBe(p);
    expect(moveItem(p, available, "commit", 99)).toBe(p);
    expect(moveItem(p, available, "nope", 1)).toBe(p);
  });
});

describe("withOrder", () => {
  it("keeps the place of items that are absent now", () => {
    // b9 belongs to another repository; reordering a, b, c here must not push it around
    expect(withOrder(["a", "b9", "b", "c"], ["c", "b", "a"])).toEqual(["c", "b9", "b", "a"]);
  });
  it("adds items the saved order did not have", () => {
    expect(withOrder(["a"], ["b", "a"])).toEqual(["b", "a"]);
  });
});

describe("setInMore and cleanPrefs", () => {
  it("moves a button in and out of More", () => {
    const base = prefs({ more: [] });
    const a = setInMore(base, "tag", true);
    expect(a.more).toEqual(["tag"]);
    expect(setInMore(a, "tag", true).more).toEqual(["tag"]);
    expect(setInMore(a, "tag", false).more).toEqual([]);
  });
  it("starts with the rarer actions in More", () => {
    expect(cleanPrefs(undefined)).toEqual(DEFAULT_TOOLBAR);
    expect(DEFAULT_TOOLBAR.more).toEqual(DEFAULT_MORE);
  });
  it("drops saved values that are not lists of strings", () => {
    expect(cleanPrefs({ version: 2, order: ["a", 3, "", "a"], more: "x", separators: ["sep:1", "tag", 4] })).toEqual({
      version: 2,
      order: ["a"],
      more: [],
      separators: ["sep:1"],
    });
  });
  it("puts the rarer actions in More for a toolbar saved before they were buttons, but not after", () => {
    expect(cleanPrefs({ order: ["tag"], more: ["fetch"] }).more).toEqual(["fetch", ...DEFAULT_MORE]);
    expect(cleanPrefs({ version: 2, more: ["fetch"] }).more).toEqual(["fetch"]);
  });
  it("reads a toolbar saved before separators existed as having the default ones", () => {
    expect(cleanPrefs({ order: ["tag"], more: ["fetch"] }).separators).toBeNull();
  });
});

describe("dropInToolbar", () => {
  const items = availableItems(DEFAULT_TOOLBAR, false, ["b1"]);
  const shown = ["commit", "sep:1", "fetch", "pull", "push"];
  const order = (p: ToolbarPrefs) => orderedItems(p.order, items);
  it("drops a button at the start", () => {
    expect(order(dropInToolbar(DEFAULT_TOOLBAR, items, shown, "push", 0)).slice(0, 3)).toEqual(["push", "commit", "sep:1"]);
  });
  it("drops a button between two others", () => {
    // fetch is dragged and lands after pull: the others in front of it are commit, sep:1, pull
    const o = order(dropInToolbar(DEFAULT_TOOLBAR, items, shown, "fetch", 3));
    expect(o.slice(0, 5)).toEqual(["commit", "sep:1", "pull", "fetch", "push"]);
  });
  it("drops a button after the last one in the toolbar, ahead of what is in More", () => {
    const o = order(dropInToolbar(DEFAULT_TOOLBAR, items, shown, "commit", 99));
    expect(o.slice(0, 5)).toEqual(["sep:1", "fetch", "pull", "push", "commit"]);
  });
  it("brings a button out of More", () => {
    const p = prefs({ more: ["tag", "terminal"] });
    const r = dropInToolbar(p, items, shown, "tag", 1);
    expect(r.more).toEqual(["terminal"]);
    expect(orderedItems(r.order, items).slice(0, 3)).toEqual(["commit", "tag", "sep:1"]);
  });
  it("keeps the place of items that are not in this toolbar", () => {
    const p = prefs({ order: ["commit", "gone", "fetch", "pull", "push"] });
    const r = dropInToolbar(p, items, ["commit", "fetch", "pull", "push"], "push", 0);
    expect(r.order.indexOf("gone")).toBe(1);
  });
});
