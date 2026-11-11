# Testing Treeline on macOS and Linux

**Status:** the app has been built and tested on **Windows 10** and on **Apple Silicon Macs**. It has **never been run
on Linux or on an Intel Mac**. This checklist is how you can help change that. It takes about 15–20 minutes. Thank you!

You need a Mac (macOS 12 or newer) or a Linux machine with a desktop (Debian/Ubuntu is what the scripts target), and
`git` installed. Two small test repositories are enough: any repository you can clone, plus a scratch one you make.

## 0. Build or install

| System | How |
| --- | --- |
| macOS | See "macOS" in the [README](../README.md#macos-and-linux). Build with `pnpm tauri build --target universal-apple-darwin`, or run `pnpm tauri dev` to try it without building an installer. |
| Linux | Run `bash scripts/setup-linux.sh` once, then `bash scripts/build-linux.sh` (it runs all tests first). To try without packaging: `pnpm tauri dev`. |

**Please report if the build itself fails**, with the full error text and the output of `rustc --version`,
`node --version` and `pnpm --version`. Also tell us if `cargo test --lib` (in `src-tauri`) fails, and which tests.

## 1. Smoke test

Tick each line as pass (✅), fail (❌) or skipped (➖). Note anything odd even if it "works".

**Start-up and Git**
1. ☐ The app starts and shows the home screen. Note any warning from the OS (Gatekeeper, missing library …).
2. ☐ **macOS only:** launch it by **double-clicking the app / from the Dock** (not from a terminal) and open a repository.
   This checks that Homebrew's `git` is found when the app has a minimal `PATH`. If it says Git is missing, that is a bug.
3. ☐ Open a repository (`Ctrl/Cmd+O`). Branch name, status and history appear.
4. ☐ Quit and restart: your tabs come back.

**Daily workflow**
5. ☐ Edit a file in your editor — it appears in *File status* **by itself**, without pressing Refresh (file watcher).
   Also, in a **test** repository with a remote, push a commit from a second clone: within about 2 minutes (the default; see Settings → Background fetch) it appears in *History* without pressing Fetch (background fetch).
6. ☐ Stage a file, stage a single **hunk**, stage **selected lines**; commit; amend the commit message.
7. ☐ *History*: scrolls smoothly; click a commit and see its diff; click a branch in the sidebar and see it highlighted.
8. ☐ Create a branch, check it out, delete it.
9. ☐ Clone a repository over **HTTPS** and one over **SSH** (if you can). A credential/sign-in prompt from your system's
   keychain or credential helper should appear when needed. Progress bar updates while cloning.
10. ☐ Fetch, pull and push (a scratch remote is fine — a bare repo on disk works).

**The harder features**
11. ☐ Open a **submodule** (double-click it in the sidebar): it opens in a tab right beside its parent.
12. ☐ Cause a **merge conflict** (two branches editing the same line), resolve it in the app, mark resolved, Continue.
13. ☐ **Interactive rebase** (right-click a commit): reword one commit and squash another.
14. ☐ **Stash** with "include untracked files": the working tree becomes clean; Pop restores it.
15. ☐ Create a stale lock (`touch .git/index.lock` in the repo) and press *Stage all*: an explanation appears, and
    **Remove lock file** works.

**Platform behaviour**
16. ☐ Shortcuts: `Ctrl/Cmd+K` palette, `+T` new tab, `+W` closes the **tab** (on macOS it must **not** close the whole window),
    `+O` open, `+R` refresh, `Ctrl+Tab` next tab, `F1` or `Cmd/Ctrl+?` opens the guide.
17. ☐ **macOS only:** `Cmd+C`, `Cmd+V`, `Cmd+A`, `Cmd+Z` work in the commit message box and text fields; the menu bar looks sensible;
    `Cmd+Q` quits.
18. ☐ The small arrow next to the **Terminal** toolbar button, **Open in external terminal window**, opens your system terminal in the repository folder; **More → Show in Explorer / Finder** opens the folder in your file manager.
19. ☐ The built-in guide (`F1`) opens in its own window and works with the network off.
20. ☐ The theme follows your system's light/dark setting, and the ☀ button switches it.
21. ☐ Looks right: fonts, spacing, icons, scrolling, on a high-DPI/Retina screen; the window resizes down to its minimum without breakage.
22. ☐ **Linux only:** the file watcher still reacts on a large repository (if you see "too many open files", note it); under Wayland and X11 if you
    can try both.

**Custom buttons** (the macOS and Linux parts of this feature were written without those systems to test on)
23. ☐ **Add** a *Shell command* button `echo hello` (save it for *This repository*): pressing it shows the command, then a panel with `hello`. Add a *Git command* button `status --short` and run it.
24. ☐ **macOS / Linux:** a *Command in a terminal window* button (for example `git log --oneline -5`) opens Terminal (macOS) or the system terminal (Linux) in the repository folder, runs the command and leaves the window open. Note which terminal opened.
25. ☐ A *Open a link* button `https://example.com/{branch}` opens your default browser; on a branch named `feature/x` the link ends `feature%2Fx`.
26. ☐ **More → Customize toolbar…**: move a button up and down, untick *Toolbar* for one (it moves into **More**), add a separator, pick an icon for a custom button. In the **More** menu click **Show in toolbar** next to *Show in Explorer / Finder*: it appears in the toolbar and still works. Quit and start the app: the order, separators and icon are still there.
27. ☐ **Dragging:** press and hold a toolbar button for about a third of a second, drag it to another place and release: it moves, and a plain click on any button still runs it. Drag one onto **More**: it leaves the toolbar. Right-click a button: the menu appears (on macOS also with `Ctrl`+click).
28. ☐ A *Shell command* button that prints something (for example `echo hello`) shows a panel with the output and **Copy output**; one that fails (`exit 1`) shows *Failed*.
29. ☐ Make the window narrow: buttons that do not fit move into **More** in the same order, and no separator is left dangling at an edge.

**Built-in terminal** (written and compile-checked on Windows only; macOS and Linux are untested)
30. ☐ The **Terminal** toolbar button (or `Ctrl/Cmd+``) opens a panel at the bottom with a shell in the repository folder (`pwd` or `cd` shows it). The shell is PowerShell on Windows, your login shell elsewhere. Typing works, including arrow keys, tab completion, `Ctrl+C`, accented and non-Latin characters, and colours (`git log --oneline --color=always`).
31. ☐ Hide it with the button, then show it again: a running command (`ping` / `sleep 30`) kept running and the text is still there. Switch between History and Files and between tabs: the terminal stays in the same place.
32. ☐ Drag the edge to resize it; double-click the edge: it goes back to the usual size. Quit and start: the size is remembered, but the terminal itself is empty.
33. ☐ **+** adds a tab, **✕** on a tab ends that shell, closing the last tab hides the panel. Each tab shows its own folder on hover.
34. ☐ **Divide** adds a piece beside the first; click each: the blue outline follows. **Move right** on one piece: it jumps to the right side, full height, and the other stays at the bottom; run a command in it first and check the text and the running command survive the move. **Move bottom** brings it back.
35. ☐ Resize the window and each piece: the shell wraps to the new size (`stty size` on macOS / Linux, `$Host.UI.RawUI.WindowSize` in PowerShell).
36. ☐ Type `exit`: the tab says the shell has ended; **Restart here** starts a new one. Switch to another repository tab and press **Restart here**: it opens in that repository.
37. ☐ Switch the theme between light and dark with a terminal open: its colours follow. Open a repository whose folder path contains spaces and non-ASCII characters: the shell still starts there.
38. ☐ Quit the app with a shell running: no shell or `conpty` / `pty` process is left behind (check Task Manager / `ps`).

## 2. Report what you found

Please send it to whoever maintains this repository (open an issue, or send the text any way they prefer). Copy this template:

```
**Result:** works / partly works / does not work

**System:** macOS 14.5 (Apple Silicon M2)  |  Ubuntu 24.04 (GNOME, Wayland)  |  …
**git --version:**
**App version / commit:**
**How it was built or installed:**
**How it was launched:** Finder / Dock / terminal / AppImage / …

**Checklist:** (paste the list with ✅ ❌ ➖)

**Problems** (one per item):
- What I did:
- What I expected:
- What happened:
- Screenshot or error text ("Copy details" in an error panel, or terminal output):
```

Even a short "everything in 1–15 worked on macOS 14" is a very useful report.
