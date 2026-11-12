// Commit messages used before, so the commit box can offer the latest and the most used ones again.

export interface UsedMessage {
  message: string;
  count: number;
  /** When it was last used (ms since 1970). */
  last: number;
}

export const MESSAGES_MAX = 100;
const KEY = "commit-messages";

/** Notes one use of `message`: bumps its count and time, or adds it. Keeps at most `max` entries, dropping the least recently used. */
export function recordMessage(list: UsedMessage[], message: string, now = Date.now(), max = MESSAGES_MAX): UsedMessage[] {
  const text = message.trim();
  if (!text) return list;
  const old = list.find((m) => m.message === text);
  const entry: UsedMessage = { message: text, count: (old?.count ?? 0) + 1, last: now };
  return [entry, ...list.filter((m) => m.message !== text)].sort((a, b) => b.last - a.last).slice(0, max);
}

/** The latest messages, newest first. */
export const latestMessages = (list: UsedMessage[], n = 8): UsedMessage[] => [...list].sort((a, b) => b.last - a.last).slice(0, n);

/** The messages used more than once, most used first (ties: most recent first). */
export const mostUsedMessages = (list: UsedMessage[], n = 8): UsedMessage[] =>
  list.filter((m) => m.count > 1).sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n);

export function loadMessages(): UsedMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((m) => m && typeof m.message === "string" && typeof m.count === "number" && typeof m.last === "number") : [];
  } catch {
    return [];
  }
}

export function saveMessages(list: UsedMessage[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the history is simply not kept */
  }
}
