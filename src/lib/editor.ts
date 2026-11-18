/** The code editor files are opened in. Stored in the browser's storage; the program itself checks the name against a fixed list. */
export const EDITOR_CHOICES: { id: string; label: string }[] = [
  { id: "code", label: "Visual Studio Code (code)" },
  { id: "code-insiders", label: "VS Code Insiders (code-insiders)" },
  { id: "cursor", label: "Cursor (cursor)" },
  { id: "windsurf", label: "Windsurf (windsurf)" },
  { id: "codium", label: "VSCodium (codium)" },
  { id: "zed", label: "Zed (zed)" },
  { id: "subl", label: "Sublime Text (subl)" },
  { id: "idea", label: "IntelliJ IDEA (idea)" },
  { id: "webstorm", label: "WebStorm (webstorm)" },
  { id: "pycharm", label: "PyCharm (pycharm)" },
  { id: "notepad++", label: "Notepad++ (notepad++)" },
  { id: "", label: "System default program (file only)" },
];
export const DEFAULT_EDITOR = "code";
const KEY = "code-editor";

export function loadEditor(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v !== null && EDITOR_CHOICES.some((e) => e.id === v) ? v : DEFAULT_EDITOR;
  } catch {
    return DEFAULT_EDITOR;
  }
}

export function saveEditor(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable: the choice lasts until the app closes */
  }
}
