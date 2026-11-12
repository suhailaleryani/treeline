//! The built-in terminal: one shell running in a pseudo-terminal, shown in a panel at the bottom of the window.
//! Output is streamed to the UI as `term-data` events; keystrokes and size changes come back as commands.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<u32, Session>>,
    next_id: Mutex<u32>,
}

#[derive(Clone, serde::Serialize)]
struct TermData {
    id: u32,
    data: String,
}

fn shell() -> CommandBuilder {
    #[cfg(target_os = "windows")]
    {
        CommandBuilder::new("powershell.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut c = CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into()));
        c.arg("-l");
        c
    }
}

fn size(rows: u16, cols: u16) -> PtySize {
    PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }
}

/// Starts a shell in `path` (a folder the user opened) and returns its id.
#[tauri::command]
pub async fn term_open(app: AppHandle, state: State<'_, TerminalState>, path: String, rows: u16, cols: u16) -> Result<u32, String> {
    crate::git::ensure_allowed(&path)?;
    crate::ops::require_existing_folder(&path)?;
    let pair = native_pty_system().openpty(size(rows, cols)).map_err(|e| e.to_string())?;
    let mut cmd = shell();
    cmd.cwd(&path);
    cmd.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = {
        let mut n = state.next_id.lock().map_err(|e| e.to_string())?;
        *n += 1;
        *n
    };
    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, Session { master: pair.master, writer, child });

    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        // A read can end in the middle of a multi-byte character; keep the unfinished bytes for the next read.
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let valid = match std::str::from_utf8(&pending) {
                        Ok(_) => pending.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => pending.len(),
                    };
                    let rest = pending.split_off(valid);
                    let data = String::from_utf8_lossy(&pending).into_owned();
                    pending = rest;
                    if !data.is_empty() {
                        let _ = app.emit("term-data", TermData { id, data });
                    }
                }
            }
        }
        let _ = app.emit("term-exit", id);
    });
    Ok(id)
}

#[tauri::command]
pub async fn term_write(state: State<'_, TerminalState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let s = sessions.get_mut(&id).ok_or("The terminal is not running.")?;
    s.writer.write_all(data.as_bytes()).and_then(|_| s.writer.flush()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn term_resize(state: State<'_, TerminalState>, id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let s = sessions.get(&id).ok_or("The terminal is not running.")?;
    s.master.resize(size(rows, cols)).map_err(|e| e.to_string())
}

/// Ends the shell and forgets the session.
#[tauri::command]
pub async fn term_close(state: State<'_, TerminalState>, id: u32) -> Result<(), String> {
    let session = state.sessions.lock().map_err(|e| e.to_string())?.remove(&id);
    if let Some(mut s) = session {
        // Ending the shell and closing the pseudo-console can block (on Windows it waits for the reader to drain),
        // so it happens on its own thread and never holds up the window.
        std::thread::spawn(move || {
            kill_tree(&mut s);
            drop(s);
        });
    }
    Ok(())
}

/// Kills the shell and everything it started (a dev server, a watcher), so nothing is left running after the
/// terminal is closed. Killing only the shell would leave its children alive.
fn kill_tree(s: &mut Session) {
    if let Some(pid) = s.child.process_id() {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                .status();
        }
        #[cfg(not(target_os = "windows"))]
        {
            // The shell leads its own session, so signalling its process group reaches its children too.
            let _ = std::process::Command::new("kill").args(["-HUP", &format!("-{pid}")]).status();
        }
    }
    let _ = s.child.kill();
}
