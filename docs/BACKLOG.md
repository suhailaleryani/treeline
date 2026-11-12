# Backlog

Planned work that is not built yet. Newest first. Move an item out of here (into the user guide and the
changelog) when it ships.

* **Closing a tab returns to the previously active tab.** After opening a submodule and then closing it, go back to the
  tab that was active before, not the next tab along.
* **Tab right-click menu.** Right-clicking a tab opens a menu of actions for that repository: Fetch, Pull, Push, Sync
  subs, and Sync and pull subs.
* **Group submodule tabs with their parent.** When a tab is opened for a submodule, group it with its parent
  repository's tab: colour the group, or stop the submodule tab being dragged away, so submodule tabs always sit to the
  right of their parent.
* **Improve the push dialog.** Rework the push dialog (details to be decided).
* **Clicking a branch selects its latest commit.** When a branch is clicked, select the last commit on that branch in
  the history.
* **Fix terminal scrolling.** Scrolling in the terminal panel does not behave correctly; investigate and fix it.
* **Closing a terminal group closes the group.** Closing a group should close that group's terminals, not hide all
  terminals.
* **Closing a terminal destroys it.** Closing a terminal currently only hides it, so its process keeps running. Closing
  should also shut the terminal down and destroy it, so no process is left behind.
* **Recent and most-used commits.** Keep a history of the latest commits and the most used commits (messages) so they
  can be picked again quickly when committing.
* **Align submodule branch with the parent.** Add a button that switches each submodule to the same branch the parent
  repository is on, and commits in the parent with a message that bumps the submodule pointers.
* **Work on a repository on another computer over SSH** (low priority). Run git on the other machine through
  `ssh host git -C <path> …` so the app can open its working tree directly. Today an SSH *remote* plus a local clone
  works; this would add remote execution, polling instead of the file watcher, and handling of latency.

## Shipped

The five items requested in November 2026 are built: history filters (author, commit, date), the Sync subs
drop-down with **Sync and pull**, tab bar scrolling and narrower tabs, double-click a commit to check it out, and
sidebar sections collapsed by default and remembered per tab. They are described in `docs/USER_GUIDE.md`.
