import { describe, expect, it } from "vitest";
import type { Tab } from "../types";
import { insertionForChild, moveWithinGroups } from "./tabGroups";

const t = (id: string, parentId?: string): Tab => ({ id, path: "/" + id, name: id, parentId });
const ids = (tabs: Tab[]) => tabs.map((x) => x.id);

describe("tabGroups", () => {
  const tabs = [t("a"), t("a1", "a"), t("a2", "a"), t("b"), t("c")];
  it("opens a submodule at the end of its parent's group", () => {
    expect(insertionForChild(tabs, "a")).toEqual({ index: 3, root: "a" });
    expect(insertionForChild(tabs, "a1")).toEqual({ index: 3, root: "a" });
    expect(insertionForChild(tabs, "b")).toEqual({ index: 4, root: "b" });
  });
  it("keeps a submodule tab to the right of its parent", () => {
    expect(ids(moveWithinGroups(tabs, "a2", 0))).toEqual(["a", "a2", "a1", "b", "c"]);
    expect(ids(moveWithinGroups(tabs, "a1", 4))).toEqual(["a", "a2", "a1", "b", "c"]);
  });
  it("moves a parent with its submodules", () => {
    expect(ids(moveWithinGroups(tabs, "a", 1))).toEqual(["b", "a", "a1", "a2", "c"]);
    expect(ids(moveWithinGroups(tabs, "c", 0))).toEqual(["c", "a", "a1", "a2", "b"]);
  });
  it("never drops a repository into the middle of another group", () => {
    expect(ids(moveWithinGroups(tabs, "c", 2))).toEqual(["c", "a", "a1", "a2", "b"]);
    expect(ids(moveWithinGroups(tabs, "b", 1))).toEqual(["b", "a", "a1", "a2", "c"]);
  });
});
