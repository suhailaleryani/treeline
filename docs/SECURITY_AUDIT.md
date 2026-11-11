# Security audit record

| | |
|---|---|
| Date | 2026-11-09 |
| Version audited | 0.2.0 (`main`), plus the fixes below |
| Method | Review of the Rust backend, the React frontend, the Tauri configuration, the CI workflows and the dependency lockfiles; tests written for each fix; end-to-end checks against a release build |
| Ratings | Judgements by the author, not formal CVSS scores |

## Threat model

Treeline runs the system `git` for whatever folder the user opens. The inputs it cannot trust are:

1. **A repository** - its `.git/config`, hooks, attributes, file and branch names, commit messages,
   submodule paths and remote URLs. This is the main threat: cloning or being handed a repository must
   not run code or write outside it.
2. **The web page inside the window.** If script ever ran there it could call every backend command.
3. **The supply chain** - dependencies, GitHub Actions and the update channel.

Out of scope: an attacker who already controls the user's account or files, and the security of Git
itself beyond making sure the app tells the user when their Git is old.

## Findings and status

| # | Area | Finding | Rating | Status |
|---|---|---|---|---|
| 1 | Files | "Mark resolved" read and wrote conflict files through symbolic links, so a repository could make the app overwrite a file outside it | High | **Fixed** - links and junctions are refused, including for paths that do not exist yet (`safe_real_path`) |
| 2 | Rebase | An interactive-rebase `reword` wrote `exec git commit --amend -F '<path>'`, run by a shell; a quote in the repository folder name broke out of the quoting. Commit ids went into the todo unchecked | High | **Fixed** - single quotes are escaped; ids must be hex. Tested with a real shell |
| 3 | Git config | A repository's own config could make git run programs: `core.fsmonitor`, `protocol.ext.allow`, external diff, textconv | High | **Fixed** - `core.fsmonitor=false` and `protocol.ext.allow=never` are forced on every git call; diffs pass `--no-ext-diff --no-textconv`. Tested against a hostile hook, with a control run proving plain git executes it |
| 4 | Arguments | 26 commands passed names straight into git's arguments, so `--upload-pack=...` would be read as an option | Medium | **Fixed** - names starting with `-` or containing NUL are refused (git forbids such ref names anyway) |
| 5 | Launchers | The file-manager and terminal commands passed any path to `explorer`/`open`/`xdg-open`, which would run a program or shortcut | Medium | **Fixed** - an absolute, existing folder is required |
| 6 | Messages | Tokens or passwords in remote URLs appeared in git's error and progress output | Medium | **Fixed** - `https://TOKEN@host` and `user:password@` are shown as `***` |
| 7 | Page | No Content Security Policy | Medium | **Fixed** - strict policy, checked on a release build: remote fetch, remote image, inline script and `eval` each raised a real violation, and the app still ran. The policy applies to installed builds; `tauri dev` loads the page from the Vite server, where Tauri enforces no policy (checked), so development runs are not covered |
| 8 | Backend | Any folder path from the page was accepted by every command | Defense in depth | **Fixed** - only folders from the native picker, saved tabs/bookmarks, or inside those are accepted (see "Allow-list" below) |
| 9 | CI | Third-party GitHub Actions, run with the update-signing key in the environment, were referenced by mutable tags | High | **Fixed** - every action is pinned to a commit SHA; Dependabot keeps the pins current |
| 10 | Dependencies | An unused dependency (`@tauri-apps/plugin-opener`) | Low | **Fixed** - removed |
| 11 | Repositories | Opening a folder that carries hooks or program-running settings | Residual | **Mitigated** - the user is asked once per folder (hooks, `core.hooksPath`, `core.sshCommand`, filter/merge/diff drivers, credential helpers, signing programs, included config, ...). Git LFS filters and plain credential helpers are ignored |
| 12 | Git version | Old Git versions have clone/submodule bugs (CVE-2025-48384 and others) | Informational | **Mitigated** - a start-up notice for any Git older than the July 2025 fixes |
| 13 | Dependencies | `glib` 0.18.5 (RUSTSEC-2024-0429) and `proc-macro-error` 1.0.4 (RUSTSEC-2024-0370) | Low | **Accepted** - Linux-only, pulled in by Tauri's GTK3 bindings and not upgradable until Tauri 3; the affected API is unused. Recorded in `src-tauri/.cargo/audit.toml` |

## How the allow-list works

Every command takes a folder path from the page. The backend keeps a list of folders the user has
actually opened and refuses anything else (`ensure_allowed`). The list can only be filled from Rust:

- the **folder picker** (`pick_folder`), which the operating system shows;
- folders **opened in earlier runs**, remembered in `trusted-folders.json`, a file only the app writes (the
  first start after an update trusts the saved tabs and bookmarks once to fill it);
- the **top level** of a repository derived from an allowed folder (this covers submodules and a
  sub-folder picked inside a repository). It is accepted only when it is the folder itself or a folder above
  it, and a folder above only in the ordinary layout where the repository's `.git` sits directly inside it, so a
  crafted `.git` file or `core.worktree` that makes git name a folder elsewhere (or a home folder above the
  repository) cannot widen the list. `GIT_DIR` and `GIT_WORK_TREE` are removed from the app's git calls;
- a **finished clone**.

A clone destination must come from the picker. If the path was typed, the user confirms it in a window
of the operating system. Paths are compared after resolving links and junctions (also for paths that do
not exist yet), `..` is refused, and a whole drive or the filesystem root is never trusted, because that
would trust everything below it.

The tabs file is something the page can write, so it is **not** what start-up trusts: the list comes from
`trusted-folders.json`, which only Rust writes and which stores the resolved real location of each folder, so a
link created later at a remembered path cannot make it lead somewhere else. `save_state` also drops any tab or
bookmark whose folder is not already allowed, so the page cannot plant a folder in the tabs file either.

## Verification

- Rust unit and integration tests, including real-git tests for the symlink/junction check, the hostile
  `core.fsmonitor` hook (with a control run), the repository-settings scan (including per-worktree config
  and included files), the rebase quoting (against a real shell), URL redaction and the allow-list.
- Front-end tests for the "open anyway" prompt and the Git-version notice.
- A release build was driven through its own IPC with a deliberately hostile repository: its hook did not
  run, it was reported, option-like names and a file passed as a folder were rejected, and folders that
  were never opened were refused.
- `pnpm audit`: no known vulnerabilities. The Rust lockfile was checked against the OSV database; the
  only findings are item 13.

To repeat: `cargo test --lib` in `src-tauri`, `pnpm test`, `pnpm audit`, and compare `src-tauri/Cargo.lock`
against https://osv.dev (or run `cargo audit`).

## Knowingly not done

- **Hooks, filters, merge drivers, credential helpers and commit signing are not disabled.** Git LFS,
  husky and signing depend on them, and switching them off would break normal workflows. The prompt in
  item 11 is the control.
- **Git's built-in `fsmonitor` daemon is off for the app's calls** (item 3). Status can be slower in very
  large repositories that rely on it.
- **Textconv diffs are off** (item 3), so repositories with custom textconv drivers show the raw diff.
- **The `git` executable is trusted.** The app runs whichever Git it finds or the user chose in Settings.

## When to repeat this

After a Tauri upgrade, when adding a command that takes a path or a name, when adding anything that
loads remote content, when changing the release workflow, and at least once a year.

## Addendum: custom toolbar buttons (2026-11-11)

A later feature, reviewed by its author when it was written (not part of the audit above, and not an independent review).
It lets the user create toolbar buttons that run a shell command, a git command, a command in a terminal window, or open
a link, so it adds a command-running feature to an app that had none.

| Risk | Control | Test |
|---|---|---|
| A repository adds a button that runs code when cloned | Buttons live only in `buttons.json` in the app config folder; nothing is read from a repository | By construction: no code path reads button definitions from a repository |
| The page makes the app run a command of its choosing | The page sends a button id; the backend looks the command up and runs it only in a folder passed by `ensure_allowed` and `require_existing_folder` | `buttons.rs` unit tests (lookup by level) |
| A branch name or path injected into a shell command (`a"&calc`, `$(...)`, `%PATH%`) | `{branch}`, `{repo}` and `{remote}` are inserted inside double quotes, and a value holding `"`, `%`, `` ` ``, `$`, `!`, a newline or (on Unix) `\` is refused | `a_value_that_could_break_out_of_the_shell_quotes_is_refused` |
| A link that opens a program or file (`file:`, `javascript:`) | Only `http`, `https` and `mailto` links are accepted, and they are checked again after placeholders are filled in; values are percent-encoded | `what_the_user_typed_is_checked`, `placeholders_in_git_arguments_and_links` |
| A password in a remote URL reaches a command | `{remote}` has any user name and password removed | `remote_urls_lose_their_credentials` |
| A command that never ends, or floods memory | A 10-minute limit, and only the last 64 KB of output is kept | `only_the_end_of_long_output_is_kept`, a real shell run on Windows |
| A corrupt saved file | An unreadable `buttons.json` is reported and never overwritten; writes go to a temporary file first | Reviewed |
| Odd text in an icon name or label | Icon names must be lower-case letters, digits and dashes; labels and commands are length-limited and single-line | `icons_are_plain_names_or_absent` |

Knowingly accepted: a button runs with the user's own rights, as a terminal would; and script in the page could still ask the
backend to create a button (the page is the only component that can, and it loads no remote content under the content
policy above). By default a button shows its exact command and asks before it runs. The macOS and Linux
terminal-window paths were written without those systems to test on; see `docs/CROSS_PLATFORM_TESTING.md`.
