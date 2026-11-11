//! Custom toolbar buttons: a shell command, a git command, a command in a terminal window, or a link.
//!
//! Buttons are saved in `buttons.json` in the app config folder, at one of three levels: the whole app, one
//! repository, or one tab. Only this module writes that file, and the page never sends a command to run: it
//! sends a button's id, and the command is looked up here. That keeps the rule the rest of the backend follows
//! (the page cannot make the app run something the user did not set up), and nothing inside a repository can add a
//! button, so cloning a repository never brings a command with it.

use crate::git::{allow_key, blocking, ensure_allowed, run_git, run_op, OpResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const MAX_LABEL: usize = 40;
const MAX_COMMAND: usize = 2000;
/// A shell command that runs longer than this is stopped.
const RUN_LIMIT: Duration = Duration::from_secs(600);
/// Only the end of a command's output is kept: that is where the error or the summary is.
const OUTPUT_TAIL: usize = 64 * 1024;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// Runs in the repository folder through the system shell; the output is shown when it ends.
    Shell,
    /// `git` with the given arguments (no shell involved).
    Git,
    /// Runs in a new terminal window that stays open.
    Terminal,
    /// Opens an http(s) or mailto link with the system.
    Url,
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    App,
    Repo,
    Tab,
}

impl Scope {
    fn rank(self) -> u8 {
        match self {
            Scope::App => 0,
            Scope::Repo => 1,
            Scope::Tab => 2,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Button {
    pub id: String,
    pub label: String,
    pub kind: Kind,
    pub command: String,
    pub scope: Scope,
    /// The name of one of the page's icons; absent means the icon of the button's kind.
    #[serde(default)]
    pub icon: Option<String>,
    /// Ask before running (the page shows the exact command).
    pub confirm: bool,
    /// Creation order. The page keeps the order the user chose (together with the built-in buttons); this is only the
    /// default for a button that has not been placed yet.
    pub position: i64,
}

/// What the page sends when the user saves the button dialog. The id is absent for a new button.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ButtonInput {
    pub id: Option<String>,
    pub label: String,
    pub kind: Kind,
    pub command: String,
    pub scope: Scope,
    #[serde(default)]
    pub icon: Option<String>,
    pub confirm: bool,
}

#[derive(Serialize, Deserialize, Default, Debug)]
struct Store {
    #[serde(default)]
    app: Vec<Button>,
    /// Repository buttons, by the repository's comparable path (`git::allow_key`).
    #[serde(default)]
    repos: HashMap<String, Vec<Button>>,
    /// Tab buttons, by tab id; removed when the tab closes.
    #[serde(default)]
    tabs: HashMap<String, Vec<Button>>,
}

fn next_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("b{:x}{:x}", nanos, COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn check_tab_id(tab_id: &str) -> Result<(), String> {
    let ok = !tab_id.is_empty() && tab_id.len() <= 64 && tab_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok { Ok(()) } else { Err("That tab is not valid.".into()) }
}

/// An icon name the page can draw: lower-case letters, digits and dashes. Which names exist is the page's business;
/// it falls back to the kind's icon for one it does not know, so this only keeps odd text out of the saved file.
fn clean_icon(icon: &Option<String>) -> Result<Option<String>, String> {
    match icon.as_deref().map(str::trim) {
        None | Some("") => Ok(None),
        Some(name) if name.len() <= 24 && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') => {
            Ok(Some(name.to_string()))
        }
        Some(_) => Err("That icon is not valid.".into()),
    }
}

/// Checks what the user typed. Returns the cleaned label and command.
fn validate(input: &ButtonInput) -> Result<(String, String), String> {
    let label = input.label.trim().to_string();
    if label.is_empty() {
        return Err("Give the button a name.".into());
    }
    if label.chars().count() > MAX_LABEL {
        return Err(format!("The name can be at most {MAX_LABEL} characters."));
    }
    if label.chars().any(|c| c.is_control()) {
        return Err("The name cannot contain control characters.".into());
    }
    let mut command = input.command.trim().to_string();
    if command.is_empty() {
        return Err("Enter the command or link to run.".into());
    }
    if command.chars().count() > MAX_COMMAND {
        return Err(format!("The command can be at most {MAX_COMMAND} characters."));
    }
    if command.contains(['\0', '\r', '\n']) {
        return Err("The command must be a single line.".into());
    }
    match input.kind {
        Kind::Git => {
            // "git status" and "status" mean the same thing here.
            if command == "git" {
                command.clear();
            } else if let Some(rest) = command.strip_prefix("git ") {
                command = rest.trim_start().to_string();
            }
            if split_args(&command)?.is_empty() {
                return Err("Enter the git arguments, for example: fetch --prune".into());
            }
        }
        Kind::Url => check_url_template(&command)?,
        Kind::Shell | Kind::Terminal => {}
    }
    Ok((label, command))
}

impl Store {
    fn lists_for<'a>(&'a self, repo_key: &str, tab_id: &str) -> [&'a [Button]; 3] {
        [
            &self.app,
            self.repos.get(repo_key).map(Vec::as_slice).unwrap_or(&[]),
            self.tabs.get(tab_id).map(Vec::as_slice).unwrap_or(&[]),
        ]
    }

    /// Every button that applies to this repository and tab, in display order.
    fn list(&self, repo_key: &str, tab_id: &str) -> Vec<Button> {
        let mut out: Vec<Button> = Vec::new();
        for (list, scope) in self.lists_for(repo_key, tab_id).into_iter().zip([Scope::App, Scope::Repo, Scope::Tab]) {
            out.extend(list.iter().cloned().map(|mut b| {
                b.scope = scope;
                b
            }));
        }
        out.sort_by(|a, b| a.position.cmp(&b.position).then(a.scope.rank().cmp(&b.scope.rank())).then(a.id.cmp(&b.id)));
        out
    }

    fn find(&self, repo_key: &str, tab_id: &str, id: &str) -> Option<Button> {
        self.list(repo_key, tab_id).into_iter().find(|b| b.id == id)
    }

    fn remove(&mut self, repo_key: &str, tab_id: &str, id: &str) -> bool {
        let before = self.app.len()
            + self.repos.get(repo_key).map_or(0, Vec::len)
            + self.tabs.get(tab_id).map_or(0, Vec::len);
        self.app.retain(|b| b.id != id);
        if let Some(l) = self.repos.get_mut(repo_key) {
            l.retain(|b| b.id != id);
        }
        if let Some(l) = self.tabs.get_mut(tab_id) {
            l.retain(|b| b.id != id);
        }
        self.repos.retain(|_, l| !l.is_empty());
        self.tabs.retain(|_, l| !l.is_empty());
        let after = self.app.len() + self.repos.get(repo_key).map_or(0, Vec::len) + self.tabs.get(tab_id).map_or(0, Vec::len);
        after != before
    }

    /// Adds a button, or changes the one with `input.id` (keeping its place; it may move to another level).
    fn upsert(&mut self, repo_key: &str, tab_id: &str, input: ButtonInput) -> Result<Button, String> {
        let (label, command) = validate(&input)?;
        let icon = clean_icon(&input.icon)?;
        let (id, position) = match &input.id {
            Some(id) => {
                let old = self.find(repo_key, tab_id, id).ok_or("That button no longer exists.")?;
                (old.id, old.position)
            }
            None => {
                let next = self.list(repo_key, tab_id).iter().map(|b| b.position + 1).max().unwrap_or(0);
                (next_id(), next)
            }
        };
        self.remove(repo_key, tab_id, &id);
        let button = Button { id, label, kind: input.kind, command, scope: input.scope, icon, confirm: input.confirm, position };
        match input.scope {
            Scope::App => self.app.push(button.clone()),
            Scope::Repo => self.repos.entry(repo_key.to_string()).or_default().push(button.clone()),
            Scope::Tab => self.tabs.entry(tab_id.to_string()).or_default().push(button.clone()),
        }
        Ok(button)
    }

    /// Drops the buttons of tabs that no longer exist.
    fn prune_tabs(&mut self, live: &[String]) -> bool {
        let before = self.tabs.len();
        self.tabs.retain(|id, _| live.contains(id));
        self.tabs.len() != before
    }
}

// ---------------------------------------------------------------------------
// The saved file
// ---------------------------------------------------------------------------

static STORE: Mutex<Option<Store>> = Mutex::new(None);

fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("buttons.json"))
}

fn load(app: &AppHandle) -> Result<Store, String> {
    match fs::read_to_string(file_path(app)?) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|e| format!("buttons.json in the app's config folder could not be read, so the buttons are not loaded: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Store::default()),
        Err(e) => Err(e.to_string()),
    }
}

fn persist(app: &AppHandle, store: &Store) -> Result<(), String> {
    let path = file_path(app)?;
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    // Write then rename so a crash can never leave a half-written file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

/// Runs `f` on the loaded store; when `f` changed something (returns `Ok(true)` in `.1`) the file is written.
fn with_store<R>(app: &AppHandle, f: impl FnOnce(&mut Store) -> Result<(R, bool), String>) -> Result<R, String> {
    let mut guard = STORE.lock().map_err(|_| "The button list is unavailable.".to_string())?;
    if guard.is_none() {
        *guard = Some(load(app)?);
    }
    let store = guard.as_mut().expect("loaded above");
    let (value, changed) = f(store)?;
    if changed {
        persist(app, store)?;
    }
    Ok(value)
}

/// The repository's key for the saved file, after checking the folder is one the user opened.
fn repo_key(path: &str, tab_id: &str) -> Result<String, String> {
    ensure_allowed(path)?;
    check_tab_id(tab_id)?;
    Ok(allow_key(path))
}

// ---------------------------------------------------------------------------
// Commands for the page
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_buttons(app: AppHandle, path: String, tab_id: String) -> Result<Vec<Button>, String> {
    let key = repo_key(&path, &tab_id)?;
    with_store(&app, |s| Ok((s.list(&key, &tab_id), false)))
}

#[tauri::command]
pub fn save_button(app: AppHandle, path: String, tab_id: String, button: ButtonInput) -> Result<Button, String> {
    let key = repo_key(&path, &tab_id)?;
    with_store(&app, |s| s.upsert(&key, &tab_id, button).map(|b| (b, true)))
}

#[tauri::command]
pub fn delete_button(app: AppHandle, path: String, tab_id: String, id: String) -> Result<(), String> {
    let key = repo_key(&path, &tab_id)?;
    with_store(&app, |s| {
        let removed = s.remove(&key, &tab_id, &id);
        Ok(((), removed))
    })
}

/// Forgets the buttons of tabs that are not open any more (called once after the saved tabs are restored).
#[tauri::command]
pub fn prune_tab_buttons(app: AppHandle, tab_ids: Vec<String>) -> Result<(), String> {
    with_store(&app, |s| Ok(((), s.prune_tabs(&tab_ids))))
}

/// Forgets the buttons of one tab that was closed.
#[tauri::command]
pub fn forget_tab_buttons(app: AppHandle, tab_id: String) -> Result<(), String> {
    check_tab_id(&tab_id)?;
    with_store(&app, |s| Ok(((), s.tabs.remove(&tab_id).is_some())))
}

#[tauri::command]
pub async fn run_button(app: AppHandle, path: String, tab_id: String, id: String) -> Result<OpResult, String> {
    let key = repo_key(&path, &tab_id)?;
    crate::ops::require_existing_folder(&path)?;
    let button = with_store(&app, |s| Ok((s.find(&key, &tab_id, &id), false)))?.ok_or("That button no longer exists.")?;
    blocking(move || execute(&path, &button)).await
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

/// Where a placeholder's value ends up, which decides how it must be protected.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// Inside a command line that a shell will read: the value is double-quoted, and refused if it holds a character
    /// that could still break out of the quotes.
    Shell,
    /// One git argument or similar: used as is.
    Plain,
    /// Part of a link: percent-encoded.
    Url,
}

const PLACEHOLDERS: [&str; 3] = ["{branch}", "{repo}", "{remote}"];

fn uses(template: &str, name: &str) -> bool {
    template.contains(name)
}

fn quote_for_shell(value: &str) -> Result<String, String> {
    let windows = cfg!(windows);
    let bad = |c: char| matches!(c, '"' | '%' | '`' | '$' | '!' | '\n' | '\r' | '\0') || (!windows && c == '\\');
    if value.chars().any(bad) || (windows && value.ends_with('\\')) {
        let shown: String = value.chars().filter(|c| !c.is_control()).take(60).collect();
        return Err(format!(
            "'{shown}' contains a character that is not safe to put in a shell command, so the button was not run."
        ));
    }
    Ok(format!("\"{value}\""))
}

fn percent_encode(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Replaces `{branch}`, `{repo}` and `{remote}`. `values` holds the three values (None = not available here).
fn expand(template: &str, values: &[Option<String>; 3], mode: Mode) -> Result<String, String> {
    let mut out = template.to_string();
    for (name, value) in PLACEHOLDERS.iter().zip(values) {
        if !out.contains(name) {
            continue;
        }
        let value = value.as_deref().ok_or_else(|| match *name {
            "{branch}" => "This button uses {branch}, but no branch is checked out (detached HEAD).".to_string(),
            "{remote}" => "This button uses {remote}, but the repository has no remote.".to_string(),
            _ => format!("This button uses {name}, which is not available here."),
        })?;
        let value = match mode {
            Mode::Shell => quote_for_shell(value)?,
            Mode::Plain => value.to_string(),
            Mode::Url => percent_encode(value),
        };
        out = out.replace(name, &value);
    }
    Ok(out)
}

/// Splits git arguments like a shell would for quotes, without running one: whitespace separates, '…' and "…"
/// group, and there are no escapes or substitutions.
fn split_args(s: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    for c in s.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => cur.push(c),
            (None, '\'' | '"') => {
                quote = Some(c);
                started = true;
            }
            (None, c) if c.is_whitespace() => {
                if started || !cur.is_empty() {
                    args.push(std::mem::take(&mut cur));
                    started = false;
                }
            }
            (None, c) => cur.push(c),
        }
    }
    if quote.is_some() {
        return Err("A quote in the command is not closed.".into());
    }
    if started || !cur.is_empty() {
        args.push(cur);
    }
    Ok(args)
}

fn check_url_template(t: &str) -> Result<(), String> {
    let lower = t.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")) {
        return Err("A link must start with http://, https:// or mailto:".into());
    }
    if t.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("A link cannot contain spaces.".into());
    }
    Ok(())
}

/// Takes a user name and password out of a remote URL (`https://user:token@host/x` → `https://host/x`).
fn strip_userinfo(url: &str) -> String {
    if let Some(scheme_end) = url.find("://") {
        let rest = &url[scheme_end + 3..];
        let authority_end = rest.find('/').unwrap_or(rest.len());
        if let Some(at) = rest[..authority_end].rfind('@') {
            return format!("{}{}", &url[..scheme_end + 3], &rest[at + 1..]);
        }
    }
    url.to_string()
}

fn placeholder_values(repo: &str, template: &str) -> [Option<String>; 3] {
    let branch = if uses(template, "{branch}") {
        run_git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).ok().map(|s| s.trim().to_string()).filter(|b| !b.is_empty() && b != "HEAD")
    } else {
        None
    };
    let remote = if uses(template, "{remote}") {
        run_git(repo, ["remote"]).ok().and_then(|names| {
            let name = names.lines().next()?.trim().to_string();
            let url = run_git(repo, ["remote", "get-url", &name]).ok()?;
            Some(strip_userinfo(url.trim()))
        })
    } else {
        None
    };
    let repo_value = repo.trim_end_matches(['/', '\\']).to_string();
    [branch, Some(repo_value), remote]
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

fn execute(repo: &str, button: &Button) -> Result<OpResult, String> {
    let values = placeholder_values(repo, &button.command);
    match button.kind {
        Kind::Git => {
            let args: Vec<String> = split_args(&button.command)?
                .iter()
                .map(|a| expand(a, &values, Mode::Plain))
                .collect::<Result<_, _>>()?;
            run_op(repo, args, &[])
        }
        Kind::Shell => run_shell(repo, &expand(&button.command, &values, Mode::Shell)?),
        Kind::Terminal => {
            open_in_terminal(repo, &expand(&button.command, &values, Mode::Shell)?)?;
            Ok(OpResult { ok: true, output: String::new() })
        }
        Kind::Url => {
            let url = expand(&button.command, &values, Mode::Url)?;
            check_url_template(&url)?;
            open_url(&url)?;
            Ok(OpResult { ok: true, output: String::new() })
        }
    }
}

/// Reads a stream to its end, keeping only the last `OUTPUT_TAIL` bytes.
fn read_tail(mut r: impl Read) -> Vec<u8> {
    let mut tail: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    while let Ok(n) = r.read(&mut chunk) {
        if n == 0 {
            break;
        }
        tail.extend_from_slice(&chunk[..n]);
        if tail.len() > OUTPUT_TAIL * 2 {
            tail.drain(..tail.len() - OUTPUT_TAIL);
        }
    }
    if tail.len() > OUTPUT_TAIL {
        tail.drain(..tail.len() - OUTPUT_TAIL);
    }
    tail
}

fn run_shell(repo: &str, command: &str) -> Result<OpResult, String> {
    use std::process::{Command, Stdio};
    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("cmd.exe");
        // /S makes cmd strip exactly the outer quotes, so the command line is read the way it was typed.
        c.args(["/D", "/S", "/C"]).raw_arg(format!("\"{command}\""));
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    };
    let mut child = cmd
        .current_dir(repo)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("The command could not be started: {e}"))?;
    let out = child.stdout.take().map(|s| std::thread::spawn(move || read_tail(s)));
    let err = child.stderr.take().map(|s| std::thread::spawn(move || read_tail(s)));
    let started = Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if started.elapsed() > RUN_LIMIT => {
                timed_out = true;
                let _ = child.kill();
                break child.wait().map_err(|e| e.to_string())?;
            }
            None => std::thread::sleep(Duration::from_millis(40)),
        }
    };
    let text = |h: Option<std::thread::JoinHandle<Vec<u8>>>| {
        h.and_then(|h| h.join().ok()).map(|b| String::from_utf8_lossy(&b).trim().to_string()).unwrap_or_default()
    };
    let (stdout, stderr) = (text(out), text(err));
    let mut output = match (stdout.is_empty(), stderr.is_empty()) {
        (_, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    };
    if timed_out {
        output.push_str(&format!("\nStopped after {} minutes.", RUN_LIMIT.as_secs() / 60));
    }
    Ok(OpResult { ok: status.success() && !timed_out, output })
}

fn open_in_terminal(repo: &str, command: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("cmd.exe");
        // /K keeps the window open after the command ends.
        c.args(["/D", "/S", "/K"]).raw_arg(format!("\"{command}\""));
        c.current_dir(repo).creation_flags(0x0000_0010); // CREATE_NEW_CONSOLE
        c.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::PermissionsExt;
        // Terminal cannot be handed a command line directly, so it opens a small script that does the work.
        if repo.chars().any(|c| matches!(c, '"' | '$' | '`' | '\\' | '\n')) {
            return Err("This folder's path has a character that cannot be used here.".into());
        }
        let script = std::env::temp_dir().join(format!("treeline-{}.command", next_id()));
        fs::write(&script, format!("#!/bin/sh\ncd \"{repo}\" || exit 1\n{command}\nexec \"${{SHELL:-/bin/sh}}\" -l\n")).map_err(|e| e.to_string())?;
        fs::set_permissions(&script, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        std::process::Command::new("open").args(["-a", "Terminal"]).arg(&script).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("x-terminal-emulator")
            .current_dir(repo)
            .args(["-e", "sh", "-c"])
            .arg(format!("{command}\nexec \"${{SHELL:-sh}}\""))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(label: &str, kind: Kind, command: &str, scope: Scope) -> ButtonInput {
        ButtonInput { id: None, label: label.into(), kind, command: command.into(), scope, icon: None, confirm: false }
    }

    fn values(branch: Option<&str>, repo: &str, remote: Option<&str>) -> [Option<String>; 3] {
        [branch.map(String::from), Some(repo.into()), remote.map(String::from)]
    }

    #[test]
    fn buttons_of_every_level_are_listed_in_one_order() {
        let mut s = Store::default();
        s.upsert("repo-a", "t1", input("Test", Kind::Shell, "npm test", Scope::Repo)).unwrap();
        s.upsert("repo-a", "t1", input("Fetch all", Kind::Git, "fetch --all", Scope::App)).unwrap();
        s.upsert("repo-a", "t1", input("Docs", Kind::Url, "https://example.com", Scope::Tab)).unwrap();
        let names = |s: &Store, repo: &str, tab: &str| s.list(repo, tab).into_iter().map(|b| b.label).collect::<Vec<_>>();
        assert_eq!(names(&s, "repo-a", "t1"), ["Test", "Fetch all", "Docs"], "creation order, across levels");
        assert_eq!(names(&s, "repo-b", "t2"), ["Fetch all"], "another repo and tab only see the app-level button");
        assert_eq!(names(&s, "repo-a", "t2"), ["Test", "Fetch all"], "a second tab of the same repo sees the repo button, not the tab one");
    }

    #[test]
    fn editing_keeps_the_id_and_the_place_and_may_change_the_level() {
        let mut s = Store::default();
        let a = s.upsert("r", "t", input("A", Kind::Shell, "a", Scope::App)).unwrap();
        s.upsert("r", "t", input("B", Kind::Shell, "b", Scope::Repo)).unwrap();
        let mut edit = input("A2", Kind::Shell, "a2", Scope::Repo);
        edit.id = Some(a.id.clone());
        let saved = s.upsert("r", "t", edit).unwrap();
        assert_eq!(saved.id, a.id);
        let labels: Vec<String> = s.list("r", "t").into_iter().map(|b| b.label).collect();
        assert_eq!(labels, ["A2", "B"], "A2 kept its place at the front");
        assert!(s.app.is_empty(), "it left the app level");
        assert_eq!(s.repos["r"].len(), 2);
    }

    #[test]
    fn icons_are_plain_names_or_absent() {
        let with = |icon: Option<&str>| {
            let mut i = input("A", Kind::Shell, "a", Scope::App);
            i.icon = icon.map(String::from);
            Store::default().upsert("r", "t", i)
        };
        assert_eq!(with(Some("rocket")).unwrap().icon.as_deref(), Some("rocket"));
        assert_eq!(with(Some("  ")).unwrap().icon, None, "blank means the default");
        assert_eq!(with(None).unwrap().icon, None);
        assert!(with(Some("<svg onload=x>")).is_err());
        assert!(with(Some("Rocket")).is_err());
        assert!(with(Some(&"a".repeat(25))).is_err());
    }

    #[test]
    fn deleting_and_pruning() {
        let mut s = Store::default();
        let a = s.upsert("r", "t1", input("A", Kind::Shell, "a", Scope::Tab)).unwrap();
        s.upsert("r", "t2", input("B", Kind::Shell, "b", Scope::Tab)).unwrap();
        assert!(s.remove("r", "t1", &a.id));
        assert!(!s.remove("r", "t1", &a.id), "already gone");
        assert!(s.prune_tabs(&["t9".into()]), "t2 is not open any more");
        assert!(s.tabs.is_empty());
        let mut edit = input("X", Kind::Shell, "x", Scope::App);
        edit.id = Some("missing".into());
        assert!(s.upsert("r", "t1", edit).is_err(), "editing a button that is gone is an error");
    }

    #[test]
    fn what_the_user_typed_is_checked() {
        let bad = |kind, command: &str, label: &str| validate(&input(label, kind, command, Scope::App)).is_err();
        assert!(bad(Kind::Shell, "ls", "  "), "empty name");
        assert!(bad(Kind::Shell, "  ", "ok"), "empty command");
        assert!(bad(Kind::Shell, "ls\nrm x", "ok"), "two lines");
        assert!(bad(Kind::Shell, &"x".repeat(MAX_COMMAND + 1), "ok"), "too long");
        assert!(bad(Kind::Shell, "ls", &"x".repeat(MAX_LABEL + 1)), "name too long");
        assert!(bad(Kind::Git, "git", "ok"), "no git arguments");
        assert!(bad(Kind::Git, "log 'unclosed", "ok"), "open quote");
        assert!(bad(Kind::Url, "file:///etc/passwd", "ok"), "only web and mail links");
        assert!(bad(Kind::Url, "javascript:alert(1)", "ok"));
        assert!(bad(Kind::Url, "https://a b", "ok"), "spaces");
        assert_eq!(validate(&input(" Pull ", Kind::Git, "git pull --rebase", Scope::App)).unwrap(), ("Pull".into(), "pull --rebase".into()));
        assert!(validate(&input("Site", Kind::Url, "HTTPS://example.com/{branch}", Scope::App)).is_ok());
    }

    #[test]
    fn git_arguments_split_on_spaces_and_quotes_without_a_shell() {
        assert_eq!(split_args("log --oneline -5").unwrap(), ["log", "--oneline", "-5"]);
        assert_eq!(split_args(r#"commit -m "two words" --allow-empty"#).unwrap(), ["commit", "-m", "two words", "--allow-empty"]);
        assert_eq!(split_args("config user.name 'A B'").unwrap(), ["config", "user.name", "A B"]);
        assert_eq!(split_args(r#"echo """#).unwrap(), ["echo", ""], "an empty quoted argument is kept");
        assert_eq!(split_args("a;b && c").unwrap(), ["a;b", "&&", "c"], "operators are just text");
        assert!(split_args(r#"a "b"#).is_err());
    }

    #[test]
    fn a_value_that_could_break_out_of_the_shell_quotes_is_refused() {
        let v = |branch: &str| values(Some(branch), "/work/repo", None);
        assert_eq!(expand("echo {branch}", &v("feature/x-1"), Mode::Shell).unwrap(), "echo \"feature/x-1\"");
        for evil in ["a;calc", "a\"&calc", "$(calc)", "`calc`", "a%PATH%", "a!b"] {
            let r = expand("echo {branch}", &v(evil), Mode::Shell);
            // ; and & are harmless inside the quotes, the rest is refused
            if evil == "a;calc" {
                assert_eq!(r.unwrap(), "echo \"a;calc\"");
            } else {
                assert!(r.is_err(), "{evil} should be refused");
            }
        }
        assert!(expand("echo {branch}", &values(None, "/r", None), Mode::Shell).is_err(), "no branch checked out");
        assert!(expand("open {remote}", &values(Some("m"), "/r", None), Mode::Shell).is_err(), "no remote");
        assert_eq!(expand("no placeholders", &values(None, "/r", None), Mode::Shell).unwrap(), "no placeholders");
        assert_eq!(expand("{unknown}", &values(None, "/r", None), Mode::Shell).unwrap(), "{unknown}");
    }

    #[test]
    fn placeholders_in_git_arguments_and_links() {
        let v = values(Some("feature/a b"), "/work/my repo", Some("https://github.com/o/r.git"));
        assert_eq!(expand("{repo}", &v, Mode::Plain).unwrap(), "/work/my repo", "a git argument keeps its spaces");
        assert_eq!(expand("https://x.test/tree/{branch}", &v, Mode::Url).unwrap(), "https://x.test/tree/feature%2Fa%20b");
        assert_eq!(expand("{remote}/pulls", &v, Mode::Url).unwrap(), "https%3A%2F%2Fgithub.com%2Fo%2Fr.git/pulls");
    }

    #[test]
    fn remote_urls_lose_their_credentials() {
        assert_eq!(strip_userinfo("https://user:tok@github.com/o/r.git"), "https://github.com/o/r.git");
        assert_eq!(strip_userinfo("https://github.com/o/r.git"), "https://github.com/o/r.git");
        assert_eq!(strip_userinfo("https://github.com/o/r@v1"), "https://github.com/o/r@v1", "an @ after the host is part of the path");
        assert_eq!(strip_userinfo("git@github.com:o/r.git"), "git@github.com:o/r.git", "scp-style has no password");
    }

    #[test]
    fn only_the_end_of_long_output_is_kept() {
        let big = vec![b'x'; OUTPUT_TAIL * 5];
        assert_eq!(read_tail(&big[..]).len(), OUTPUT_TAIL);
        let mut text = vec![b'a'; OUTPUT_TAIL];
        text.extend_from_slice(b"END");
        assert!(read_tail(&text[..]).ends_with(b"END"));
    }

    #[cfg(windows)]
    #[test]
    fn a_shell_button_runs_in_the_folder_and_reports_failure() {
        let dir = std::env::temp_dir();
        let dir = dir.to_string_lossy();
        let ok = run_shell(&dir, "echo hello").unwrap();
        assert!(ok.ok);
        assert_eq!(ok.output, "hello");
        let cwd = run_shell(&dir, "cd").unwrap();
        assert!(cwd.output.to_lowercase().starts_with(&dir.to_lowercase().trim_end_matches('\\').to_string()));
        let fail = run_shell(&dir, "echo oops 1>&2 && exit 3").unwrap();
        assert!(!fail.ok);
        assert_eq!(fail.output, "oops");
        let quoted = run_shell(&dir, "echo \"a & b\"").unwrap();
        assert_eq!(quoted.output, "\"a & b\"");
    }
}
