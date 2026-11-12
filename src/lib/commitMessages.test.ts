import { describe, expect, it } from "vitest";
import { latestMessages, mostUsedMessages, recordMessage } from "./commitMessages";

describe("commitMessages", () => {
  it("counts repeats and ignores blanks", () => {
    let l = recordMessage([], "Fix bug", 1);
    l = recordMessage(l, "  ", 2);
    l = recordMessage(l, "Fix bug ", 3);
    expect(l).toEqual([{ message: "Fix bug", count: 2, last: 3 }]);
  });
  it("lists the latest first and the most used by count", () => {
    let l = recordMessage([], "a", 1);
    l = recordMessage(l, "b", 2);
    l = recordMessage(l, "a", 3);
    l = recordMessage(l, "c", 4);
    expect(latestMessages(l).map((m) => m.message)).toEqual(["c", "a", "b"]);
    expect(mostUsedMessages(l).map((m) => m.message)).toEqual(["a"]);
  });
  it("keeps at most max entries", () => {
    let l = recordMessage([], "a", 1, 2);
    l = recordMessage(l, "b", 2, 2);
    l = recordMessage(l, "c", 3, 2);
    expect(l.map((m) => m.message)).toEqual(["c", "b"]);
  });
});
