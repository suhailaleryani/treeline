import { describe, expect, it } from "vitest";
import { fileManagerName, toolbarLayout } from "./toolbarLayout";

describe("toolbarLayout", () => {
  it("fits the eight built-in buttons with labels on a wide window", () => {
    expect(toolbarLayout(1150)).toEqual({ capacity: 8, labels: true });
    expect(toolbarLayout(1249)).toEqual({ capacity: 8, labels: true });
  });
  it("adds room for one more item for every 100 px", () => {
    expect(toolbarLayout(1250).capacity).toBe(9);
    expect(toolbarLayout(1440).capacity).toBe(10);
  });
  it("makes room for fewer items as the window narrows, still with labels", () => {
    expect(toolbarLayout(1149)).toEqual({ capacity: 6, labels: true });
    expect(toolbarLayout(1000)).toEqual({ capacity: 6, labels: true });
    expect(toolbarLayout(999)).toEqual({ capacity: 4, labels: true });
    expect(toolbarLayout(860)).toEqual({ capacity: 4, labels: true });
  });
  it("drops the labels only on a very narrow window", () => {
    expect(toolbarLayout(859)).toEqual({ capacity: 4, labels: false });
  });
  it("keeps everything until the width is known", () => {
    expect(toolbarLayout(0)).toEqual({ capacity: Number.POSITIVE_INFINITY, labels: true });
  });
});

describe("fileManagerName", () => {
  it("names the platform's file manager", () => {
    expect(fileManagerName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Finder");
    expect(fileManagerName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Explorer");
    expect(fileManagerName("Mozilla/5.0 (X11; Linux x86_64)")).toBe("file manager");
  });
});
