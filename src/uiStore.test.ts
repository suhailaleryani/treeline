import { beforeEach, describe, expect, it } from "vitest";
import { setSectionOpen, useUi } from "./uiStore";

describe("sidebar sections are remembered per repository", () => {
  beforeEach(() => useUi.setState({ sections: {} }));

  it("keeps each repository's choice separate", () => {
    setSectionOpen("a", "Branches", false);
    setSectionOpen("b", "Branches", true);
    const s = useUi.getState().sections;
    expect(s.a.Branches).toBe(false);
    expect(s.b.Branches).toBe(true);
  });

  it("leaves sections the user never touched undecided", () => {
    setSectionOpen("a", "Tags", true);
    expect(useUi.getState().sections.b?.Tags).toBeUndefined();
    expect(useUi.getState().sections.a.Stashes).toBeUndefined();
  });

  it("keeps a repository's choices when its tab is closed and it is opened again", () => {
    setSectionOpen("/work/orchard", "Branches", true);
    setSectionOpen("/work/other", "Tags", true);
    // nothing forgets a closed tab: the folder is the key, so reopening it finds the same layout
    expect(useUi.getState().sections["/work/orchard"].Branches).toBe(true);
  });

  it("keeps only the most recently changed repositories", () => {
    for (let i = 0; i < 320; i++) setSectionOpen(`/r/${i}`, "Branches", true);
    const keys = Object.keys(useUi.getState().sections);
    expect(keys.length).toBe(300);
    expect(keys).toContain("/r/319");
    expect(keys).not.toContain("/r/0");
  });
});
