/** The order in which tabs were active, most recent last. Closing the active tab goes back to the one before it. */
export function noteActive(history: string[], id: string | null, limit = 50): string[] {
  if (!id) return history;
  const next = history.filter((x) => x !== id);
  next.push(id);
  return next.slice(-limit);
}

/**
 * The tab to show after `closing` is closed: the most recently active one that is still open, or else the tab that
 * now sits where the closed one was.
 */
export function tabAfterClose(history: string[], remaining: string[], closing: string, closedIndex: number): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] !== closing && remaining.includes(history[i])) return history[i];
  }
  return remaining[Math.min(closedIndex, remaining.length - 1)] ?? null;
}
