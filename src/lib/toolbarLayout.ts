// How much of the toolbar fits at a given width; the items that do not fit go into the "More" menu.

/**
 * How many items (built-in and custom, in the user's order) the toolbar can hold. A window that shows every built-in
 * button with its label fits eight; below that it is six, then four. Each further 100 px adds room for one more item.
 * Labels go only on a very narrow window. A width of 0 (not measured yet) keeps the full layout so the first paint
 * matches the next.
 */
export function toolbarLayout(width: number): { capacity: number; labels: boolean } {
  if (width === 0) return { capacity: Number.POSITIVE_INFINITY, labels: true };
  if (width >= 1150) return { capacity: 8 + Math.floor((width - 1150) / 100), labels: true };
  if (width >= 1000) return { capacity: 6, labels: true };
  return { capacity: 4, labels: width >= 860 };
}

/** What the platform calls its file manager, for "Show in …". */
export function fileManagerName(userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent): string {
  if (/Mac|iPhone|iPad/.test(userAgent)) return "Finder";
  if (/Windows/.test(userAgent)) return "Explorer";
  return "file manager";
}
