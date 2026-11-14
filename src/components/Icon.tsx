const PATHS = {
  fetch: "M12 3v12m0 0l-4-4m4 4l4-4M4 19h16",
  pull: "M12 4v12m0 0l-4-4m4 4l4-4M5 20h14",
  push: "M12 20V8m0 0l-4 4m4-4l4 4M5 4h14",
  branch: "M6 3v12m0 0a3 3 0 103 3 3 3 0 00-3-3zm12-6a3 3 0 10-3-3 3 3 0 003 3zm0 0c0 5-6 3-9 6",
  merge: "M6 9v12M6 9a3 3 0 100-6 3 3 0 000 6zm0 0c0 5 4 9 9 9m0 0a3 3 0 106 0 3 3 0 00-6 0z",
  stash: "M4 7h16v4H4zM6 11v8h12v-8M10 15h4",
  tag: "M3 12V4h8l10 10-8 8L3 12zm5-5h.01",
  terminal: "M4 5h16v14H4zM8 10l3 2-3 2M13 15h3",
  folder: "M3 6h6l2 2h10v11H3z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  refresh: "M20 11a8 8 0 10-2.3 6M20 4v7h-7",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5L20 7",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  chevron: "M9 6l6 6-6 6",
  files: "M7 3h7l5 5v13H7zM14 3v5h5",
  history: "M12 7v5l3 2M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4",
  user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 20c0-4 3.6-6 8-6s8 2 8 6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm9 16l-4-4",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  warn: "M12 3l10 18H2zM12 10v5M12 18h.01",
  submodule: "M4 4h7v7H4zM13 13h7v7h-7zM11 7.5h4a2 2 0 012 2V13",
  cloud: "M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1A4.5 4.5 0 0117 18z",
  command: "M9 9V6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3z",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  copy: "M8 8h12v12H8zM4 4h12v2M4 4v12h2",
  down: "M6 9l6 6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  separator: "M12 3v18M5 8h4M15 8h4M5 16h4M15 16h4",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01",
  play: "M7 5l12 7-12 7z",
  rocket: "M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10zM12 10h.01M9 16l-2 4M15 16l2 4",
  bug: "M9 9a3 3 0 016 0v6a3 3 0 01-6 0zM12 9v9M5 9l4 2M19 9l-4 2M5 15l4-1M19 15l-4-1M9 6L7 4M15 6l2-2",
  package: "M12 3l8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  key: "M8 15a4 4 0 100-8 4 4 0 000 8zM11 12l9 9M17 18l2-2",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 018 0v3",
  bell: "M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0",
  bookmark: "M7 3h10v18l-5-4-5 4z",
  chart: "M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3",
  wrench: "M20 7l-4 4-3-3 4-4a5 5 0 00-6 6L3 18l3 3 8-7a5 5 0 006-6z",
  flask: "M9 3h6M10 3v6L5 19a1 1 0 001 1h12a1 1 0 001-1l-5-10V3M7.5 14h9",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  heart: "M12 20s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 9c0 6-8 11-8 11z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  home: "M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  cpu: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  sparkle: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  update: "M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16M8 16H3v5",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01",
} as const;

export type IconName = keyof typeof PATHS;

/** Whether `name` is the name of a drawable icon (a saved name may come from a newer or older version). */
export const isIconName = (name: unknown): name is IconName => typeof name === "string" && Object.prototype.hasOwnProperty.call(PATHS, name);

/** The icons a custom button can use, in the order the picker shows them. */
export const ICON_CHOICES: IconName[] = [
  "command", "terminal", "play", "rocket", "bolt", "code", "bug", "flask",
  "package", "layers", "database", "server", "cpu", "monitor", "globe", "link",
  "cloud", "mail", "bell", "lock", "key", "shield", "wrench", "gear",
  "branch", "merge", "history", "tag", "stash", "folder", "files", "save",
  "search", "eye", "edit", "list", "chart", "clock", "target", "sparkle",
  "star", "heart", "flag", "bookmark", "home", "image", "refresh", "check",
];

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
