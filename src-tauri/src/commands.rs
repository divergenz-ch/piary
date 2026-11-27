//! The whole IPC surface. Every `#[tauri::command]` in the app is here and
//! nowhere else.
//!
//! Each command is a thin shell: it unwraps its arguments, calls a module that
//! knows nothing about Tauri, and hands back the result. That is what keeps the
//! logic drivable by `cargo test` without an app (ADR 0014) — the tests for what
//! these commands *do* live beside the modules, not here.
//!
//! A command registered in `main.rs`'s `generate_handler!` is callable from
//! every window: `build.rs` declares no `AppManifest::commands`, so Tauri
//! grants the app's own commands without a capability. The page's core calls
//! (events, its window handle) do need one, in `capabilities/default.json`. A
//! call Rust refuses — an unknown name, a missing argument — reaches the page as
//! a rejected promise and appears nowhere else, so `src/forward-console.ts` is
//! what makes it diagnosable rather than a silent hang, and
//! `tests/contract/ipc.test.ts` is what keeps the page's calls matched to these
//! signatures.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::attachments;
use crate::bundle::{self, Exports, Imports};
use crate::capture::{Capture, Sink as CaptureSink};
use crate::cell_state;
use crate::diag;
use crate::docs;
use crate::exit::{Exit, QUITTING};
use crate::extension;
use crate::extension_set;
use crate::harness;
use crate::menu;
use crate::menu_keys;
use crate::pi_cli;
use crate::preferences;
use crate::print;
use crate::pty::{OpenRequest, PtyEvent, Ptys, Sink};
use crate::session::{self, Sessions, Sink as SessionSink, Spawn};
use crate::shell_env;
use crate::store::Store;
use crate::teardown;
use crate::transcript;
use crate::update::{self, Updates};
use crate::windows::{self, Geometry};
use crate::wire::{
    format_report, DocEntry, ExportRequest, Exported, ExportedOne, ExtensionRow, FaceSource,
    ImportPlaced, ImportStaged, OverlaySupport, PiSource, PiWhich, Preferences, Report, Stored,
    TerminalRequest, UpdateSource, UpdateState, Verdict, WindowBox,
};

/// Writes one line to stdout and makes sure it is actually out.
///
/// stdout is a pipe when a harness launched the app, and a pipe is block
/// buffered: without the flush a line can still be unwritten when the process
/// goes away, which loses exactly the output a failing run needed.
fn emit(line: &str) {
    println!("{line}");
    let _ = std::io::stdout().flush();
}

/// Forwards one line from the page to this process's stdout and the app's log.
///
/// WKWebView's console reaches no parent process, so without this a page-side
/// throw is indistinguishable from a hang. The page routes its own `console`
/// and both error events here (`src/forward-console.ts`). stdout is for a
/// terminal or a harness; the log is for a build launched from Finder, where
/// stdout reaches no one (`diag.rs`).
#[tauri::command]
pub fn log_line(level: String, message: String) {
    let line = format!("PAGE {level} {message}");
    emit(&line);
    diag::record(&line);
}

/// Prints a line per assertion and returns the tally; with `done`, exits the
/// app with the run's verdict.
///
/// This is how a test driving the real window reports without a human reading
/// it: stdout plus an exit code.
#[tauri::command]
pub fn report<R: Runtime>(app: AppHandle<R>, reports: Vec<Report>, done: bool) -> Verdict {
    for entry in &reports {
        emit(&format_report(entry));
    }
    let verdict = Verdict::of(&reports);
    if done {
        emit(&verdict.summary());
        app.exit(verdict.exit_code());
    }
    verdict
}

/// Where this workspace's widget state is kept (`cell_state.rs`).
fn cell_state_dir<R: Runtime>(
    app: &AppHandle<R>,
    store: &Store,
) -> Result<std::path::PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(cell_state::dir(
        &app_data,
        std::path::Path::new(&pi_cwd(store)),
    ))
}

/// The widget state kept for one document, as `{ "state": … }`, or `null` when
/// none was ever written. Wrapped because a stored `null` — "checked, nothing
/// there" — and no record at all would otherwise both cross as `null`.
#[tauri::command]
pub fn cell_state_read<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
) -> Result<Option<serde_json::Value>, String> {
    Ok(cell_state::read(&cell_state_dir(&app, &store)?, &id)?
        .map(|state| serde_json::json!({ "state": state })))
}

/// Keeps one document's widget state, off the main thread: the write waits on
/// the drive, as a document's does.
#[tauri::command]
pub async fn cell_state_write<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
    state: serde_json::Value,
) -> Result<(), String> {
    let dir = cell_state_dir(&app, &store)?;
    tauri::async_runtime::spawn_blocking(move || cell_state::write(&dir, &id, &state))
        .await
        .map_err(|e| format!("the widget-state write did not finish: {e}"))?
}

/// Where this workspace's per-conversation extension choices live.
fn extensions_dir<R: Runtime>(app: &AppHandle<R>, store: &Store) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(extension_set::dir(&app_data, Path::new(&pi_cwd(store))))
}

/// The agent directory pi reads, as `pi_start` resolves it.
fn agent_dir_now() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from);
    extension::agent_dir(
        std::env::var("PI_CODING_AGENT_DIR").ok().as_deref(),
        home.as_deref(),
    )
}

/// The extension menu's rows for one conversation.
#[tauri::command]
pub fn extensions_list<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
) -> Result<Vec<ExtensionRow>, String> {
    let cwd = pi_cwd(&store);
    let agent = agent_dir_now();
    let scopes = extension_set::Scopes {
        cwd: Path::new(&cwd),
        agent: agent.as_deref(),
    };
    extension_set::list(&scopes, &extensions_dir(&app, &store)?, &id)
}

/// Turns one installed package on or off for one conversation.
#[tauri::command]
pub fn extensions_set<R: Runtime>(
    app: AppHandle<R>,
    store: State<'_, Store>,
    id: String,
    source: String,
    enabled: bool,
) -> Result<Vec<ExtensionRow>, String> {
    let cwd = pi_cwd(&store);
    let agent = agent_dir_now();
    let scopes = extension_set::Scopes {
        cwd: Path::new(&cwd),
        agent: agent.as_deref(),
    };
    extension_set::set(
        &scopes,
        &extensions_dir(&app, &store)?,
        &id,
        &source,
        enabled,
    )
}

/// The text of the file pi names as a command's source, for its card in the
/// creation menu. Markdown only: a command backed by code has no docs to show,
/// and the path comes from pi rather than the store's id guard.
#[tauri::command]
pub fn command_doc_read(path: String) -> Option<String> {
    let path = std::path::Path::new(&path);
    if path.extension()? != "md" {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// Reads one document, or `null` when it has never been written.
#[tauri::command]
pub fn docs_read(store: State<'_, Store>, id: String) -> Result<Option<String>, String> {
    docs::read(&store.paths, &id)
}

/// Writes one document, off the main thread.
///
/// The write waits on the drive — two full syncs (ADR 0018 §1) — and how long
/// that takes is the device's to decide, not this code's. On the main thread it
/// would stall the event loop for that long, mid-stream, at every save. Being
/// off it, two writes can overlap: `docs::write` keeps them from corrupting
/// each other, and the page's `docsWrite` keeps them in the order it made them.
#[tauri::command]
pub async fn docs_write(
    store: State<'_, Store>,
    id: String,
    content: String,
) -> Result<(), String> {
    let paths = store.paths.clone();
    tauri::async_runtime::spawn_blocking(move || docs::write(&paths, &id, &content))
        .await
        .map_err(|e| format!("the document write did not finish: {e}"))?
}

/// Every document in this workspace, by id.
#[tauri::command]
pub fn docs_list(store: State<'_, Store>) -> Result<Vec<String>, String> {
    docs::list(&store.paths)
}

/// Stores one dropped or pasted file beside the conversation (`attachments.rs`).
///
/// The bytes arrive as the raw request body, not JSON: a `number[]` would
/// multiply a 10 MiB file several times over through the serializer. The
/// original name rides in the `x-filename` header, percent-encoded. The write
/// is synced, so it runs off the main thread as a document's does.
#[tauri::command]
pub async fn attachments_store(
    request: tauri::ipc::Request<'_>,
    store: State<'_, Store>,
) -> Result<Stored, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("an attachment's bytes must be the raw request body".into());
    };
    let filename = request
        .headers()
        .get("x-filename")
        .and_then(|value| value.to_str().ok())
        .map(attachments::decode_filename)
        .unwrap_or_default();
    let dir = attachments::dir(&store.paths);
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || attachments::store(&dir, &filename, &bytes))
        .await
        .map_err(|e| format!("the attachment write did not finish: {e}"))?
}

/// One stored attachment's bytes, by its stored name, as a raw `ArrayBuffer`.
#[tauri::command]
pub fn attachments_read(
    store: State<'_, Store>,
    name: String,
) -> Result<tauri::ipc::Response, String> {
    attachments::read(&attachments::dir(&store.paths), &name).map(tauri::ipc::Response::new)
}

/// Where one stored attachment is on disk, absolute: what the agent is told to
/// open for a file the model cannot see (the format's §Attachments). Behind
/// the store's name guard; the file need not exist.
#[tauri::command]
pub fn attachments_path(store: State<'_, Store>, name: String) -> Result<String, String> {
    let path = attachments::path_of(&attachments::dir(&store.paths), &name)?;
    std::path::absolute(&path)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|e| format!("resolving attachment {name}: {e}"))
}

/// Every conversation in this workspace, most recently changed first.
#[tauri::command]
pub fn docs_entries(store: State<'_, Store>) -> Result<Vec<DocEntry>, String> {
    Ok(docs::entries(&store.paths)?
        .into_iter()
        .map(|entry| DocEntry {
            id: entry.id,
            modified_ms: entry.modified_ms,
        })
        .collect())
}

/// Deletes a conversation whole: its pi and terminals are stopped, and its
/// document, its widget state and pi's transcript removed. The transcript's
/// path is asked of the session's own pi, never taken from the page, and is
/// held to `transcript::is_session_file`; a session with no pi running keeps
/// its transcript, because nothing can say where it is. Another window
/// showing the conversation is closed; the caller's own is the page's to
/// switch away from.
#[tauri::command]
pub async fn delete_conversation<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    store: State<'_, Store>,
    sessions: State<'_, Arc<Sessions>>,
    ptys: State<'_, Arc<Ptys>>,
    id: String,
) -> Result<(), String> {
    docs::check_id(&id).map_err(|bad| bad.message().to_string())?;
    if let Some(label) = app.state::<windows::Shown>().window_for(&id) {
        if label != window.label() {
            if let Some(other) = app.get_webview_window(&label) {
                let _ = other.destroy();
            }
        }
    }
    let paths = store.paths.clone();
    let cells = cell_state_dir(&app, &store)?;
    let sessions = Arc::clone(&sessions);
    let ptys = Arc::clone(&ptys);
    tauri::async_runtime::spawn_blocking(move || {
        let mut ask = serde_json::Map::new();
        ask.insert("type".into(), "get_state".into());
        let transcript = sessions.send(&id, ask).ok().and_then(|reply| {
            reply["data"]["sessionFile"]
                .as_str()
                .map(std::path::PathBuf::from)
        });
        let _ = ptys.close_session(&id);
        sessions.drop_session(&id)?;
        if let Some(path) = transcript {
            transcript::delete(&path, &id)?;
        }
        cell_state::delete(&cells, &id)?;
        docs::delete(&paths, &id)
    })
    .await
    .map_err(|e| format!("the delete did not finish: {e}"))?
}

/// What a panel is asked for.
enum Pick {
    /// A markdown file or a zip bundle to import.
    ImportFile,
    /// A folder bundle to import.
    ImportFolder,
    /// The folder an export is written into.
    ExportInto,
}

/// Asks the user for a path in the system's own panel, on the calling window.
/// `None` is a cancelled panel.
///
/// This is the only place a path enters an import or an export: the page
/// supplies none (ADR 0049). It blocks until the panel closes, so its callers
/// are `async` commands, which run off the main thread.
fn pick<R: Runtime>(window: &tauri::WebviewWindow<R>, ask: Pick) -> Option<PathBuf> {
    // A panel cannot be driven by WebDriver, so a driven debug build takes the
    // answer from its environment instead (docs/TEST_ARCHITECTURE.md §6): one
    // variable for what an import opens, one for where an export goes. No
    // other build has this branch.
    #[cfg(all(feature = "e2e", debug_assertions))]
    {
        let answer = match ask {
            Pick::ImportFile | Pick::ImportFolder => "PIARY_E2E_PICK",
            Pick::ExportInto => "PIARY_E2E_EXPORT_DIR",
        };
        if let Some(path) = std::env::var_os(answer) {
            return Some(PathBuf::from(path));
        }
    }
    let panel = window.dialog().file().set_parent(window);
    let picked = match ask {
        Pick::ImportFile => panel
            .add_filter("Markdown or zip", &["md", "zip"])
            .blocking_pick_file(),
        Pick::ImportFolder => panel.blocking_pick_folder(),
        Pick::ExportInto => panel
            .set_title("Export into")
            .set_can_create_directories(true)
            .blocking_pick_folder(),
    };
    picked.and_then(|path| path.into_path().ok())
}

/// How long a page may take to be printed to a file. A long conversation is
/// printed in well under a second; past this the print path has stopped
/// answering, and the export says so instead of waiting for it.
const PRINT_BOUND: std::time::Duration = std::time::Duration::from_secs(60);

/// What `window`'s page looks like on paper, as the bytes of a PDF
/// (`print.rs`). The page decides what it shows to paper with its print
/// styles; nothing is shown on screen.
async fn print_page<R: Runtime>(window: &tauri::WebviewWindow<R>) -> Result<Vec<u8>, String> {
    let printed = bundle::Printed::new()?;
    let dest = printed.path();
    let (answer, answered) = std::sync::mpsc::channel::<Result<bool, String>>();
    window
        .with_webview(move |webview| {
            let (done, ran) = std::sync::mpsc::channel();
            let began = match objc2::MainThreadMarker::new() {
                // SAFETY: Tauri hands this closure the window's own WKWebView,
                // on the main thread, while the window stands.
                Some(mtm) => unsafe { print::start(mtm, webview.inner(), &dest, done) },
                None => Err("the page was reached off the main thread".into()),
            };
            match began {
                // The operation answers on the main thread, later: waited for
                // off it, so this closure returns and lets it run.
                Ok(()) => {
                    std::thread::spawn(move || {
                        let _ = answer.send(ran.recv().map_err(|e| e.to_string()));
                    });
                }
                Err(error) => {
                    let _ = answer.send(Err(error));
                }
            }
        })
        .map_err(|e| e.to_string())?;
    let wrote = tauri::async_runtime::spawn_blocking(move || answered.recv_timeout(PRINT_BOUND))
        .await
        .map_err(|e| format!("the page was not printed: {e}"))?
        .map_err(|_| "the page was not printed in time".to_string())??;
    if !wrote {
        return Err("the system did not print the page".into());
    }
    printed.read()
}

/// Writes conversations into a folder the user chooses, each under its own
/// name: its markdown file, a folder bundle or a zip bundle, with the
/// attachments the page read out of its document (ADR 0049). `null` when the
/// panel was cancelled. One conversation that cannot be written is answered
/// with why, and does not hold up the others.
///
/// The two drawn kinds are what the page made of a conversation (ADR 0066).
/// HTML arrives as each request's `content`. A PDF is the calling window's
/// own page, printed: the page shows one conversation to paper and asks for
/// that one, so a PDF export of several is several calls, and every call
/// after the first names the folder by the token the first was answered with
/// (`into`) instead of asking again. The token names it for another PDF, to
/// the same window, and for nothing else (`bundle::Exports`).
#[tauri::command]
pub async fn export_conversations<R: Runtime>(
    window: tauri::WebviewWindow<R>,
    store: State<'_, Store>,
    exports: State<'_, Arc<Exports>>,
    conversations: Vec<ExportRequest>,
    kind: String,
    into: Option<String>,
) -> Result<Option<Exported>, String> {
    let kind = bundle::Kind::named(&kind)?;
    if kind == bundle::Kind::Pdf && conversations.len() != 1 {
        return Err("a PDF is printed one conversation at a time".into());
    }
    let into = match into {
        Some(token) => exports.get(&token, kind, window.label())?,
        None => match pick(&window, Pick::ExportInto) {
            Some(folder) => folder,
            None => return Ok(None),
        },
    };
    let token = exports.hold(into.clone(), kind, window.label());
    // Why the page was not printed is that one conversation's outcome.
    let printed = match kind {
        bundle::Kind::Pdf => Some(print_page(&window).await),
        _ => None,
    };
    let paths = store.paths.clone();
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&into).map_err(|e| format!("making {}: {e}", into.display()))?;
        let conversations = conversations
            .into_iter()
            .map(|asked| {
                let drawn = match (&printed, &asked.content) {
                    (Some(printed), _) => printed.as_deref().map(Some).map_err(String::clone),
                    (None, content) => Ok(content.as_deref().map(str::as_bytes)),
                };
                let written = drawn.and_then(|drawn| {
                    bundle::export_into(&paths, &asked.id, kind, &asked.attachments, drawn, &into)
                });
                match written {
                    Ok((name, missing)) => ExportedOne {
                        id: asked.id,
                        name,
                        missing,
                        error: None,
                    },
                    Err(error) => ExportedOne {
                        id: asked.id,
                        name: String::new(),
                        missing: Vec::new(),
                        error: Some(error),
                    },
                }
            })
            .collect();
        let folder = into.file_name().map_or_else(
            || into.display().to_string(),
            |name| name.to_string_lossy().into_owned(),
        );
        Ok(Some(Exported {
            folder,
            into: token,
            conversations,
        }))
    })
    .await
    .map_err(|e| format!("the export did not finish: {e}"))?
}

/// Asks the user for a conversation to import — a markdown file or a zip
/// (`file`), or a folder bundle (`folder`) — reads it, and holds it under the
/// token answered. `null` when the panel was cancelled.
#[tauri::command]
pub async fn import_pick<R: Runtime>(
    window: tauri::WebviewWindow<R>,
    imports: State<'_, Arc<Imports>>,
    kind: String,
) -> Result<Option<ImportStaged>, String> {
    let ask = match kind.as_str() {
        "file" => Pick::ImportFile,
        "folder" => Pick::ImportFolder,
        other => return Err(format!("{other:?} is not a kind of import")),
    };
    let Some(source) = pick(&window, ask) else {
        return Ok(None);
    };
    let staged = tauri::async_runtime::spawn_blocking(move || {
        if source.is_dir() {
            bundle::stage_folder(&source)
        } else if source.extension().is_some_and(|ext| ext == "zip") {
            bundle::stage_zip(&source)
        } else {
            bundle::stage_markdown(&source)
        }
    })
    .await
    .map_err(|e| format!("the import was not read: {e}"))??;
    let (name, content, attachments) = (
        staged.name.clone(),
        staged.content.clone(),
        staged.attachments(),
    );
    Ok(Some(ImportStaged {
        token: imports.hold(staged),
        name,
        content,
        attachments,
    }))
}

/// Puts a held import's attachments in the store: those of `names`, the ones
/// its document references. The import stays held, for `import_write`.
#[tauri::command]
pub async fn import_place(
    store: State<'_, Store>,
    imports: State<'_, Arc<Imports>>,
    token: String,
    names: Vec<String>,
) -> Result<ImportPlaced, String> {
    let staged = imports.get(&token)?;
    let paths = store.paths.clone();
    tauri::async_runtime::spawn_blocking(move || {
        bundle::place_attachments(&paths, &staged, &names).map(|placed| ImportPlaced {
            renames: placed.renames,
            broken: placed.broken,
        })
    })
    .await
    .map_err(|e| format!("the attachments were not placed: {e}"))?
}

/// Writes a held import's document under `id` and lets the import go. The
/// content is the page's: bound to its id, its links following any rename. A
/// taken id is refused unless `replace`, which keeps the old document as a
/// backup first.
#[tauri::command]
pub async fn import_write(
    store: State<'_, Store>,
    imports: State<'_, Arc<Imports>>,
    token: String,
    id: String,
    content: String,
    replace: bool,
) -> Result<(), String> {
    imports.get(&token)?;
    let paths = store.paths.clone();
    tauri::async_runtime::spawn_blocking(move || {
        bundle::write_document(&paths, &id, &content, replace)
    })
    .await
    .map_err(|e| format!("the import was not written: {e}"))??;
    imports.release(&token);
    Ok(())
}

/// Lets go of an import the user did not go through with.
#[tauri::command]
pub fn import_cancel(imports: State<'_, Arc<Imports>>, token: String) {
    imports.release(&token);
}

/// Emits a terminal's events to the page.
struct WindowSink<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> Sink for WindowSink<R> {
    fn emit(&self, event: PtyEvent) {
        let _ = match event {
            PtyEvent::Data { term_id, data } => self.app.emit("pty-data", (term_id, data)),
            PtyEvent::Exit { term_id, exit_code } => {
                self.app.emit("pty-exit", (term_id, exit_code))
            }
        };
    }
}

/// Opens a terminal, owned by the calling session. The calling window is
/// recorded as using the session, so its close takes the terminal with it.
///
/// An empty `cwd` is the workspace, which the page has no business knowing:
/// the same directory pi runs in.
#[tauri::command]
pub fn pty_open<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    ptys: State<'_, Arc<Ptys>>,
    store: State<'_, Store>,
    exit: State<'_, Exit>,
    request: TerminalRequest,
) -> Result<(), String> {
    if exit.refuses_new_work() {
        return Err(QUITTING.into());
    }
    exit.attach(window.label(), &request.sid);
    // The same pi a session would start, so a terminal running it reads the
    // same settings and credentials (ADR 0004).
    let (command, args) = if request.pi {
        (pi_cli_path(&app)?, request.args)
    } else {
        (request.command, Vec::new())
    };
    let cwd = if request.cwd.is_empty() {
        pi_cwd(&store)
    } else {
        request.cwd
    };
    ptys.open(
        OpenRequest {
            sid: request.sid,
            term_id: request.term_id,
            command,
            args,
            cwd,
            cols: request.cols,
            rows: request.rows,
            path: child_path(),
        },
        Arc::new(WindowSink { app }),
    )
}

/// Forwards a keystroke, or pasted text.
#[tauri::command]
pub fn pty_write(
    ptys: State<'_, Arc<Ptys>>,
    sid: String,
    term_id: String,
    data: String,
) -> Result<(), String> {
    ptys.write(&sid, &term_id, &data)
}

/// Tells a terminal its grid changed.
#[tauri::command]
pub fn pty_resize(
    ptys: State<'_, Arc<Ptys>>,
    sid: String,
    term_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    ptys.resize(&sid, &term_id, cols, rows)
}

/// Kills one terminal. A view's marker leaving the document is what calls this —
/// disposing the view alone frees only the page's half and leaves the shell
/// running (ADR 0013).
#[tauri::command]
pub fn pty_close(ptys: State<'_, Arc<Ptys>>, sid: String, term_id: String) -> Result<(), String> {
    ptys.close(&sid, &term_id)
}

/// Closes every terminal a session owns.
///
/// Called when a window goes away: its terminals have no reader left, and a
/// shell with nobody reading it is the failure ADR 0013 names — so the window's
/// departure has to take them with it, not just the panels it could see.
#[tauri::command]
pub fn pty_close_session(ptys: State<'_, Arc<Ptys>>, sid: String) -> Result<usize, String> {
    ptys.close_session(&sid)
}

/// Where the window showing `doc_id` should open.
///
/// The saved geometry, corrected for the screens that exist now: a window
/// restored onto a display that has since gone is invisible and reads as a
/// crash (`windows.rs`).
#[tauri::command]
pub fn window_geometry<R: Runtime>(app: AppHandle<R>, doc_id: String) -> Result<WindowBox, String> {
    geometry_for(&app, &doc_id)
}

/// Where the window for `doc_id` belongs: its remembered place, made usable on
/// the screens there are now.
fn geometry_for<R: Runtime>(app: &AppHandle<R>, doc_id: &str) -> Result<WindowBox, String> {
    let label = windows::label_for(doc_id);
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let layout = windows::read_layout(&windows::layout_path(&dir));
    let screens: Vec<(i32, i32, u32, u32)> = app
        .available_monitors()
        .map_err(|e| e.to_string())?
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            (position.x, position.y, size.width, size.height)
        })
        .collect();
    let saved = layout.get(&label).copied().unwrap_or(Geometry {
        x: 0,
        y: 0,
        width: 1100,
        height: 760,
    });
    let usable = saved.usable(&screens);
    Ok(WindowBox {
        x: usable.x,
        y: usable.y,
        width: usable.width,
        height: usable.height,
    })
}

/// Focuses the window showing `doc_id`, answering whether there was one. One
/// editor per file: two windows writing one document would fight over it.
fn focus_shown<R: Runtime>(
    app: &AppHandle<R>,
    doc_id: &str,
    except: Option<&str>,
) -> Result<bool, String> {
    let Some(label) = app.state::<windows::Shown>().window_for(doc_id) else {
        return Ok(false);
    };
    if Some(label.as_str()) == except {
        return Ok(false);
    }
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(false);
    };
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(true)
}

/// The page reports which document its window shows, each time it boots.
#[tauri::command]
pub fn window_shows<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    doc_id: String,
) -> Result<(), String> {
    docs::check_id(&doc_id).map_err(|bad| bad.message().to_string())?;
    app.state::<windows::Shown>().show(window.label(), &doc_id);
    Ok(())
}

/// A window is about to switch to `doc_id`: when another window already shows
/// it, that window is focused instead and this answers `true`; `false` means
/// the caller shows it itself.
#[tauri::command]
pub fn show_document<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    doc_id: String,
) -> Result<bool, String> {
    docs::check_id(&doc_id).map_err(|bad| bad.message().to_string())?;
    focus_shown(&app, &doc_id, Some(window.label()))
}

/// Shows `doc_id` in a window of its own: the one already showing it, focused,
/// or a new one. Async, so the window is built off the IPC call's own thread
/// rather than inside it.
#[tauri::command]
pub async fn open_document<R: Runtime>(
    app: AppHandle<R>,
    exit: State<'_, Exit>,
    doc_id: String,
) -> Result<(), String> {
    docs::check_id(&doc_id).map_err(|bad| bad.message().to_string())?;
    if exit.refuses_new_work() {
        return Err(QUITTING.into());
    }
    if focus_shown(&app, &doc_id, None)? {
        return Ok(());
    }
    // The document's own label, unless a window that has since switched to
    // another document still carries it.
    let label = windows::free_label_for(&doc_id, &|label| app.get_webview_window(label).is_some());
    let place = geometry_for(&app, &doc_id)?;
    // The title, the minimum size and the drop handling are `tauri.conf.json`'s
    // main window's: a document window is the same window, showing another
    // document. File drops go to the page (ADR 0026).
    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App(windows::url_for(&doc_id).into()),
    )
    .title("Piary")
    .inner_size(f64::from(place.width), f64::from(place.height))
    .position(f64::from(place.x), f64::from(place.y))
    .min_inner_size(480.0, 360.0)
    .disable_drag_drop_handler()
    .build()
    .map_err(|e| format!("opening a window for {doc_id}: {e}"))?;
    // Recorded now, not when its page boots: a second ask in between must find
    // this window rather than build another.
    app.state::<windows::Shown>().show(&label, &doc_id);
    Ok(())
}

/// Remembers where a window is, so it opens there next launch.
#[tauri::command]
pub fn remember_window<R: Runtime>(
    app: AppHandle<R>,
    doc_id: String,
    geometry: WindowBox,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = windows::layout_path(&dir);
    let mut layout = windows::read_layout(&path);
    layout.insert(
        windows::label_for(&doc_id),
        Geometry {
            x: geometry.x,
            y: geometry.y,
            width: geometry.width,
            height: geometry.height,
        },
    );
    windows::write_layout(&path, &layout)
}

/// Where the preferences are kept (`preferences.rs`).
fn preferences_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(preferences::path(
        std::env::var_os(preferences::FILE_ENV),
        &config,
    ))
}

/// How the user chose the app to behave; the defaults when nothing is kept.
#[tauri::command]
pub fn preferences_read<R: Runtime>(app: AppHandle<R>) -> Result<Preferences, String> {
    Ok(preferences::read(&preferences_path(&app)?))
}

/// Keeps the preferences and tells every window, so a change applies at once
/// and everywhere (ADR 0048). Told only once the file holds it: a window never
/// behaves a way the next launch would not.
#[tauri::command]
pub async fn preferences_write<R: Runtime>(
    app: AppHandle<R>,
    preferences: Preferences,
) -> Result<(), String> {
    let path = preferences_path(&app)?;
    let kept = preferences.clone();
    tauri::async_runtime::spawn_blocking(move || preferences::write(&path, &kept))
        .await
        .map_err(|e| format!("the preferences write did not finish: {e}"))??;
    app.emit(preferences::CHANGED_EVENT, preferences)
        .map_err(|e| e.to_string())
}

/// What reads the user's face in this run: the camera, or in a driven run the
/// script `PIARY_FACE_SCRIPT` names, or nothing (`harness::face_source`,
/// docs/TEST_ARCHITECTURE.md §6). A script that cannot be read is no script.
#[tauri::command]
pub fn face_source() -> FaceSource {
    let driven = harness::driven(
        cfg!(all(feature = "e2e", debug_assertions)),
        std::env::var("PIARY_E2E").ok().as_deref(),
    );
    let script = std::env::var_os("PIARY_FACE_SCRIPT")
        .filter(|_| driven)
        .and_then(|path| std::fs::read_to_string(path).ok());
    harness::face_source(driven, script)
}

/// The version this app is, and the newest release a check has read since
/// launch (ADR 0064): what a window draws its notice from without asking
/// anyone.
#[tauri::command]
pub fn update_state<R: Runtime>(app: AppHandle<R>, updates: State<'_, Updates>) -> UpdateState {
    UpdateState {
        current: app.package_info().version.to_string(),
        latest: updates.latest(),
    }
}

/// Gives the calling window the turn to ask whether a newer Piary exists, and
/// says where to ask: GitHub, or in a driven run the answer
/// `PIARY_UPDATE_SCRIPT` names. `None` is no turn: another window asked within
/// the hour, the preference is off, or a driven run has no script. Decided
/// here, for every window at once, so the preference off is no request from
/// any of them (`update.rs`). With `asked` the user chose Check for Updates…:
/// the turn is given whatever the hour and the preference say.
#[tauri::command]
pub fn update_claim<R: Runtime>(
    app: AppHandle<R>,
    updates: State<'_, Updates>,
    asked: bool,
) -> UpdateSource {
    let driven = harness::driven(
        cfg!(all(feature = "e2e", debug_assertions)),
        std::env::var("PIARY_E2E").ok().as_deref(),
    );
    let script = std::env::var_os(update::SCRIPT_ENV)
        .filter(|_| driven)
        .and_then(|path| std::fs::read_to_string(path).ok());
    let source = harness::update_source(driven, script);
    if asked {
        updates.take(std::time::Instant::now());
        return source;
    }
    // Preferences that cannot be found are the defaults, which check.
    let wanted = preferences_path(&app)
        .map_or_else(|_| Preferences::default(), |path| preferences::read(&path))
        .update_check;
    if source == UpdateSource::None || !updates.claim(std::time::Instant::now(), wanted) {
        return UpdateSource::None;
    }
    source
}

/// A check read the release tag `tag`: kept for windows opened later, and told
/// to every window now.
#[tauri::command]
pub fn update_found<R: Runtime>(
    app: AppHandle<R>,
    updates: State<'_, Updates>,
    tag: String,
) -> Result<(), String> {
    if !updates.found(&tag) {
        return Err(format!("not a release tag: {} bytes", tag.len()));
    }
    app.emit(update::LATEST_EVENT, tag)
        .map_err(|e| e.to_string())
}

/// The chord of every menu item that has one, by the id its click emits, as
/// the system draws it under the keyboard layout in use (ADR 0051).
///
/// Async, because AppKit is read on the main thread and a command that is not
/// async runs there: it would wait for a closure queued behind itself.
#[tauri::command]
pub async fn menu_chords<R: Runtime>(
    app: AppHandle<R>,
) -> Result<BTreeMap<String, String>, String> {
    let registered = menu::registered(&app);
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let _ = tx.send(objc2::MainThreadMarker::new().map(menu_keys::held));
    })
    .map_err(|e| e.to_string())?;
    let held = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| format!("the menu was not read: {e}"))?
        .map_err(|e| format!("the menu was not read: {e}"))?
        .ok_or("the menu was read off the main thread")?;
    Ok(menu_keys::chords(&registered, &held))
}

/// Shows the Preferences window: the one there is, focused, or a new one. One
/// for the app, whatever document was in front (ADR 0048). Async, so the window
/// is built off the IPC call's own thread, as a document's is.
#[tauri::command]
pub async fn open_preferences<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    show_preferences(&app)
}

/// The Preferences window, shown. Not to be called on the main thread, which a
/// window is built through.
pub fn show_preferences<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if app.state::<Exit>().refuses_new_work() {
        return Err(QUITTING.into());
    }
    if let Some(window) = app.get_webview_window(preferences::WINDOW_LABEL) {
        window.unminimize().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        preferences::WINDOW_LABEL,
        tauri::WebviewUrl::App(preferences::WINDOW_PAGE.into()),
    )
    .title("Settings")
    .inner_size(PREFERENCES_SIZE.0, PREFERENCES_SIZE.1)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| format!("opening the Preferences window: {e}"))
}

/// Shows the Import or the Export window: the one there is, focused, or a new
/// one (ADR 0049). `from` is the conversation the export was asked for — the
/// one in front, or the one whose row asked — which the Export window shows
/// chosen, whether it is new or was open already.
#[tauri::command]
pub async fn open_transfer<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    from: Option<String>,
) -> Result<(), String> {
    let window = windows::Transfer::named(&kind)?;
    show_transfer(&app, window, from.as_deref())
}

/// The Import or the Export window, shown. Not to be called on the main
/// thread, which a window is built through.
pub fn show_transfer<R: Runtime>(
    app: &AppHandle<R>,
    window: windows::Transfer,
    from: Option<&str>,
) -> Result<(), String> {
    if app.state::<Exit>().refuses_new_work() {
        return Err(QUITTING.into());
    }
    if let Some(open) = app.get_webview_window(window.label()) {
        open.unminimize().map_err(|e| e.to_string())?;
        open.show().map_err(|e| e.to_string())?;
        // An Export window already open was opened for another conversation,
        // or for none: it is told which one is meant now.
        if let (windows::Transfer::Export, Some(id)) = (window, from) {
            open.emit(windows::EXPORT_FROM_EVENT, id)
                .map_err(|e| e.to_string())?;
        }
        return open.set_focus().map_err(|e| e.to_string());
    }
    let (width, height) = window.size();
    tauri::WebviewWindowBuilder::new(
        app,
        window.label(),
        tauri::WebviewUrl::App(window.url(from).into()),
    )
    .title(window.title())
    .inner_size(width, height)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .center()
    .build()
    .map(|_| ())
    .map_err(|e| format!("opening the {} window: {e}", window.title()))
}

/// The Preferences window's size: a form's, not a document's, and fixed.
const PREFERENCES_SIZE: (f64, f64) = (520.0, 360.0);

/// Which overlay primitives this platform honoured, asked of a real window.
///
/// Every call is made and its result reported rather than assumed, because the
/// capture overlay depends on all four and the cost of discovering a gap later
/// is a feature built on a false premise (ADR 0015).
#[tauri::command]
pub fn overlay_support<R: Runtime>(window: tauri::Window<R>) -> OverlaySupport {
    let support = OverlaySupport {
        always_on_top: window.set_always_on_top(true).is_ok(),
        click_through: window.set_ignore_cursor_events(true).is_ok(),
        all_workspaces: window.set_visible_on_all_workspaces(true).is_ok(),
        undecorated: window.set_decorations(false).is_ok(),
    };
    // Put the window back: this is a probe, not a mode. Leaving it
    // click-through would make the app unusable, which is the one failure a
    // capability probe must not cause.
    let _ = window.set_ignore_cursor_events(false);
    let _ = window.set_always_on_top(false);
    let _ = window.set_visible_on_all_workspaces(false);
    let _ = window.set_decorations(true);
    support
}

/// Relays the capture helper's lines to the page.
struct CaptureRelay<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> CaptureSink for CaptureRelay<R> {
    fn line(&self, line: String) {
        // Passed through as a string: every field belongs to the page, and
        // parsing here as well would mean two places to change when the helper
        // grows a reply (ADR 0015).
        let _ = self.app.emit("capture", line);
    }
    fn ended(&self, code: Option<i32>) {
        let _ = self.app.emit("capture-ended", code);
    }
}

/// Starts the capture helper.
///
/// The permission prompt this may raise belongs to the APP, not the helper:
/// macOS resolves a privacy grant against the responsible process and
/// responsibility is inherited across spawn (ADR 0015).
#[tauri::command]
pub fn capture_start<R: Runtime>(
    app: AppHandle<R>,
    capture: State<'_, Arc<Capture>>,
    exit: State<'_, Exit>,
) -> Result<(), String> {
    if exit.refuses_new_work() {
        return Err(QUITTING.into());
    }
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()));
    let path = Capture::helper_path(exe_dir, env!("CARGO_MANIFEST_DIR"));
    capture.start(&path, Arc::new(CaptureRelay { app }))
}

/// Sends one command line to the helper. The page owns the protocol's shape.
#[tauri::command]
pub fn capture_send(capture: State<'_, Arc<Capture>>, line: String) -> Result<(), String> {
    capture.send(&line)
}

/// Stops the helper, so no Screen Recording grant is held with nobody reading;
/// off the main thread.
///
/// The stop waits up to `capture::STOP_GRACE` for the helper to go, and on the
/// main thread every window would freeze for that long. Never refused while the
/// app quits: a stop is how work ends, not new work.
///
/// Being off it, a `capture_start` can land while the stop waits. That is
/// safe in either order: the stop takes the helper out before it waits, so a
/// start that comes after finds the slot empty and starts a fresh helper, one
/// that comes before is refused as a second; and the old helper's reader frees
/// only its own start's slot (`capture::take`). The page makes no such pair.
#[tauri::command]
pub async fn capture_stop(capture: State<'_, Arc<Capture>>) -> Result<Option<i32>, String> {
    let capture = Arc::clone(&capture);
    tauri::async_runtime::spawn_blocking(move || capture.stop())
        .await
        .map_err(|e| format!("the capture stop did not finish: {e}"))?
}

/// Whether a capture helper is running, which is what the page asks before
/// offering to start one.
#[tauri::command]
pub fn capture_running(capture: State<'_, Arc<Capture>>) -> bool {
    capture.is_running()
}

/// Relays one session's events to the page.
struct SessionRelay<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> SessionSink for SessionRelay<R> {
    fn event(&self, sid: &str, event: serde_json::Value) {
        if let Some(line) = diag::pi_event_line(sid, &event) {
            diag::record(&line);
        }
        // Passed through whole: every field belongs to the page, and this
        // module models none of pi's payloads (ADR 0002's wire is the
        // interface, its transcript is not).
        let _ = self.app.emit("pi-event", (sid.to_string(), event));
    }
    fn exited(&self, sid: &str, code: Option<i32>) {
        diag::record(&format!("PI {sid} exited, code {code:?}"));
        let _ = self.app.emit("pi-exited", (sid.to_string(), code));
    }
}

/// Brings the calling window to the front, the app with it: a sign-in that
/// finished in the browser hands the user back to the window that started it
/// (ADR 0034). A driven run's activation policy keeps it from taking focus, as
/// it does every other focus.
#[tauri::command]
pub fn focus_window<R: Runtime>(window: tauri::WebviewWindow<R>) -> Result<(), String> {
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

/// Opens `url` in the user's browser: the page that finishes a provider's
/// account sign-in (ADR 0034). Only an `http(s)` URL, handed to macOS `open`, so
/// nothing the page passes can name a file or an app to run.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !opens_in_browser(&url) {
        return Err(format!("not a web address: {url}"));
    }
    std::process::Command::new("/usr/bin/open")
        .arg(&url)
        .status()
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("open exited with {status}"))
            }
        })
}

/// The system's own list of what may use the camera, in System Settings.
const CAMERA_SETTINGS: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera";

/// Opens System Settings where the user allows Piary the camera, after the
/// system refused it (ADR 0057). The address is fixed here: `open_url` takes
/// web addresses only, and a page that could name any other scheme could name
/// an app to run.
#[tauri::command]
pub fn open_camera_settings() -> Result<(), String> {
    std::process::Command::new("/usr/bin/open")
        .arg(CAMERA_SETTINGS)
        .status()
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("open exited with {status}"))
            }
        })
}

/// Whether `url` is a web address `open` will hand to the browser.
fn opens_in_browser(url: &str) -> bool {
    (url.starts_with("https://") || url.starts_with("http://"))
        && !url.chars().any(char::is_whitespace)
}

/// Whether a test harness drives this run (`harness::driven`).
fn driven() -> bool {
    harness::driven(
        cfg!(all(feature = "e2e", debug_assertions)),
        std::env::var("PIARY_E2E").ok().as_deref(),
    )
}

/// The `PATH` of the user's login shell, which is where an app the Finder
/// launched finds what a terminal would (`shell_env.rs`, ADR 0068). The first
/// call waits for the shell, so `main.rs` makes it at startup, off the main
/// thread.
pub fn login_path() -> Option<&'static str> {
    shell_env::login_path(driven())
}

/// The `PATH` handed to what the app starts: its own, then the login shell's
/// directories it lacks. A pi found only through the shell needs it to find
/// its Node, and the commands pi runs need it to find the user's tools.
fn child_path() -> Option<String> {
    let own = std::env::var("PATH").unwrap_or_default();
    login_path().map(|login| shell_env::merged(&own, Some(login)))
}

/// The pi that would run, or why there is none (`pi_cli::resolve`).
fn found_pi<R: Runtime>(app: &AppHandle<R>) -> Result<pi_cli::Resolved, String> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    let pi_cli = std::env::var("PI_CLI").ok();
    // Where a release keeps the pi it ships; a build that ships none has no
    // file there (ADR 0069).
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|resources| pi_cli::bundled_in(&resources, std::env::consts::ARCH));
    let home = std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from);
    let installed = extension::agent_dir(
        std::env::var("PI_CODING_AGENT_DIR").ok().as_deref(),
        home.as_deref(),
    )
    .map(|agent| pi_cli::installed_in(&agent));
    // Preferences that cannot be found are the defaults: no pi is chosen.
    let chosen = preferences_path(app)
        .map(|path| preferences::read(&path).pi_path)
        .unwrap_or_default();
    pi_cli::resolve(
        &pi_cli::Search {
            pi_cli: pi_cli.as_deref(),
            chosen: Some(&chosen),
            path_var: &path_var,
            login_path: login_path(),
            installed: installed.as_deref(),
            bundled: bundled.as_deref(),
        },
        &|path| path.is_file(),
    )
    .map_err(|missing| missing.message())
}

/// The path of the pi that would run, as a session and a terminal are given it.
fn pi_cli_path<R: Runtime>(app: &AppHandle<R>) -> Result<String, String> {
    found_pi(app).map(|found| found.path.to_string_lossy().into_owned())
}

/// Which `pi` would run and where it was found, or a message that says what
/// to do when there is none (ADR 0004, ADR 0068).
///
/// Off the main thread: the first answer may wait for the login shell.
#[tauri::command(async)]
pub fn pi_which<R: Runtime>(app: AppHandle<R>) -> Result<PiWhich, String> {
    let found = found_pi(&app)?;
    Ok(PiWhich {
        path: found.path.to_string_lossy().into_owned(),
        source: match found.source {
            pi_cli::Source::Override => PiSource::Override,
            pi_cli::Source::Chosen => PiSource::Chosen,
            pi_cli::Source::Path => PiSource::Path,
            pi_cli::Source::Shell => PiSource::Shell,
            pi_cli::Source::Installed => PiSource::Installed,
            pi_cli::Source::Bundled => PiSource::Bundled,
        },
        shell_answered: login_path().is_some(),
    })
}

/// Asks the user which pi to run, in the system's own panel, and keeps the
/// answer as the `piPath` preference, telling every window (ADR 0068). `false`
/// is a cancelled panel. The page names no path: it asks, and reads what was
/// chosen back from the preferences.
#[tauri::command]
pub async fn pi_choose<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> Result<bool, String> {
    let picked = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Choose the pi to run")
        .blocking_pick_file()
        .and_then(|path| path.into_path().ok());
    let Some(picked) = picked else {
        return Ok(false);
    };
    let path = preferences_path(&app)?;
    let kept = Preferences {
        pi_path: picked.to_string_lossy().into_owned(),
        ..preferences::read(&path)
    };
    preferences_write(app, kept).await.map(|()| true)
}

/// The directory pi runs in: the workspace the documents belong to, as the
/// document store resolved it. A seeded transcript names it too.
fn pi_cwd(store: &Store) -> String {
    store.workspace().to_string_lossy().into_owned()
}

/// Starts a session's `pi --mode rpc`, if it is not already running. The
/// calling window is recorded as using the session, so its close stops the pi
/// once no other window uses it (ADR 0019 §2).
#[tauri::command]
pub fn pi_start<R: Runtime>(
    app: AppHandle<R>,
    window: tauri::Window<R>,
    sessions: State<'_, Arc<Sessions>>,
    store: State<'_, Store>,
    exit: State<'_, Exit>,
    sid: String,
    args: Vec<String>,
) -> Result<(), String> {
    if exit.refuses_new_work() {
        return Err(QUITTING.into());
    }
    exit.attach(window.label(), &sid);
    let cli = pi_cli_path(&app)?;
    let cwd = pi_cwd(&store);
    let home = std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .map(PathBuf::from);
    let agent = extension::agent_dir(
        std::env::var("PI_CODING_AGENT_DIR").ok().as_deref(),
        home.as_deref(),
    );
    let resource_dir = app.path().resource_dir().ok();
    let mut chosen = extension_set::args(
        &extension_set::Scopes {
            cwd: Path::new(&cwd),
            agent: agent.as_deref(),
        },
        &extensions_dir(&app, &store)?,
        &sid,
    )?;
    chosen.extend(args);
    let args = extension::session_args(
        &extension::Places {
            resource_dir: resource_dir.as_deref(),
            // A dev build falls back to the checkout; a release build has only
            // its bundle (`package_dir`).
            checkout: cfg!(debug_assertions).then(|| Path::new(env!("CARGO_MANIFEST_DIR"))),
            cwd: Path::new(&cwd),
            agent: agent.as_deref(),
            home: home.as_deref(),
            // Read at each start, as the draw mode is: a pi started after the
            // preference changed is told what it now needs to know. Preferences
            // that cannot be found are the defaults, never a pi that will not start.
            face: preferences_path(&app).is_ok_and(|path| preferences::read(&path).reads_face()),
        },
        chosen,
    );
    let spawn = Spawn {
        cli,
        cwd,
        session_id: sid.clone(),
        args,
        draw: session::draw_mode(std::env::var(session::DRAW_ENV).ok().as_deref()).into(),
        path: child_path(),
    };
    // Asked before every send, so only a start that spawns is worth a line.
    let spawning = !sessions.is_live(&sid);
    let started = sessions.start(&sid, &spawn, Arc::new(SessionRelay { app }));
    match &started {
        Ok(()) if !spawning => {}
        Ok(()) => diag::record(&format!(
            "PI {sid} start: {} {} in {}",
            spawn.cli,
            spawn.args.join(" "),
            spawn.cwd
        )),
        Err(e) => diag::record(&format!("PI {sid} start failed: {e}")),
    }
    started
}

/// Sends one command to a session and answers with pi's reply, off the main
/// thread.
///
/// The command is the page's object. A refusal comes back in pi's own shape so
/// the page has one branch rather than two, and a reply that is late rather
/// than refused carries `timedOut` (`session::timed_out`).
///
/// The wait is pi's to decide — up to `REQUEST_TIMEOUT` for a wedged one — so it
/// runs in `spawn_blocking`: on the main thread it would freeze every window for
/// as long as pi was silent, which is exactly when the page probes it (ADR 0019
/// §4). Being off it, two requests the page makes at the same instant reach pi
/// in either order; the page never makes a pair whose order matters.
///
/// `Result` only because an async command that borrows its state must return
/// one; every outcome, a failed join included, is an `Ok` in pi's shape.
#[tauri::command]
pub async fn pi_send(
    sessions: State<'_, Arc<Sessions>>,
    exit: State<'_, Exit>,
    sid: String,
    command: serde_json::Map<String, serde_json::Value>,
) -> Result<serde_json::Value, String> {
    // A prompt starts a turn and is refused while the app quits; an `abort` is
    // how the quit ends the running one, so everything else still goes through.
    if command.get("type").and_then(|kind| kind.as_str()) == Some("prompt")
        && exit.refuses_new_work()
    {
        return Ok(session::failure(QUITTING));
    }
    let kind = command
        .get("type")
        .and_then(|kind| kind.as_str())
        .unwrap_or("?")
        .to_string();
    diag::record(&diag::pi_command_line(&sid, &command));
    let sessions = Arc::clone(&sessions);
    let to = sid.clone();
    let reply = tauri::async_runtime::spawn_blocking(move || sessions.send(&to, command))
        .await
        .map_err(|e| session::SendError::Failed(format!("the request did not finish: {e}")))
        .and_then(|sent| sent);
    let reply = reply.unwrap_or_else(session::SendError::into_reply);
    diag::record(&diag::pi_reply_line(&sid, &kind, &reply));
    Ok(reply)
}

/// Replaces a session's transcript with the page's rebuilt entries (ADR 0021).
///
/// `session_file` is the path pi reported through `get_state`; anything not
/// named for this session is refused. pi is stopped first — its shutdown may
/// append, and the file must end at the leaf — and is not restarted: the
/// page's next `pi_start` loads the new transcript. Off the main thread for the
/// reason `pi_stop` is: the stop waits up to `session::STOP_GRACE`.
#[tauri::command]
pub async fn pi_rebuild(
    sessions: State<'_, Arc<Sessions>>,
    store: State<'_, Store>,
    exit: State<'_, Exit>,
    sid: String,
    session_file: String,
    entries: Vec<serde_json::Value>,
) -> Result<(), String> {
    if exit.refuses_new_work() {
        return Err(QUITTING.into());
    }
    let path = std::path::PathBuf::from(session_file);
    if !transcript::is_session_file(&path, &sid) {
        return Err(format!(
            "{} is not a transcript for session {sid}",
            path.display()
        ));
    }
    let cwd = pi_cwd(&store);
    let sessions = Arc::clone(&sessions);
    let what = format!(
        "PI {sid} rebuild: {} entries to {}",
        entries.len(),
        path.display()
    );
    let rebuilt = tauri::async_runtime::spawn_blocking(move || {
        sessions.drop_session(&sid)?;
        let now = diag::timestamp(std::time::SystemTime::now());
        transcript::rewrite(&path, &sid, &cwd, &entries, &now)
    })
    .await
    .map_err(|e| format!("the rebuild did not finish: {e}"))
    .and_then(|done| done);
    match &rebuilt {
        Ok(()) => diag::record(&what),
        Err(e) => diag::record(&format!("{what} failed: {e}")),
    }
    rebuilt
}

/// Ends a session's process, off the main thread.
///
/// The stop waits up to `session::STOP_GRACE` for pi to go, and on the main
/// thread every window would freeze for that long. Never refused while the app
/// quits: a stop is how work ends, not new work, and the exit sequence's own
/// stop and this one each take a session only once (ADR 0019 §2).
///
/// Being off it, a `pi_start` or `pi_send` for the same session can land while
/// the stop waits. Nothing is left running in any order: the stop takes the
/// session out before it waits, so a start that comes after spawns a fresh pi
/// whose slot the old pi's reader never frees (`session::take`), and a send
/// reaches either the old pi — and fails when it goes — or no pi at all. What
/// the order decides is only whether a pi is left running afterwards, which a
/// caller that cares keeps by awaiting the stop; the page does.
///
/// `keep_terminals` stops pi alone: a page restarting pi so that it reads a
/// new credential is not closing its window, and the shells in it stay.
#[tauri::command]
pub async fn pi_stop(
    sessions: State<'_, Arc<Sessions>>,
    ptys: State<'_, Arc<Ptys>>,
    sid: String,
    keep_terminals: Option<bool>,
) -> Result<Option<i32>, String> {
    let sessions = Arc::clone(&sessions);
    let ptys = Arc::clone(&ptys);
    tauri::async_runtime::spawn_blocking(move || {
        stop_session(&sessions, &ptys, &sid, keep_terminals.unwrap_or(false))
    })
    .await
    .map_err(|e| format!("the session stop did not finish: {e}"))?
}

/// Ends `sid`'s pi and, unless `keep_terminals`, its terminals: a session's
/// terminals are its own, and without this a closed window leaves real shells
/// running with nothing reading them (ADR 0013).
fn stop_session(
    sessions: &Sessions,
    ptys: &Ptys,
    sid: &str,
    keep_terminals: bool,
) -> Result<Option<i32>, String> {
    if !keep_terminals {
        let _ = ptys.close_session(sid);
    }
    sessions.drop_session(sid)
}

/// Whether a session has a process.
#[tauri::command]
pub fn pi_running(sessions: State<'_, Arc<Sessions>>, sid: String) -> bool {
    sessions.is_live(&sid)
}

/// Every session with a live process.
///
/// What a window asks after a reload: the page has forgotten what it started,
/// and a second `pi` for a session that already has one would double every
/// event.
#[tauri::command]
pub fn pi_sessions(sessions: State<'_, Arc<Sessions>>) -> Vec<String> {
    sessions.open()
}

/// The page has ended its turn and written its buffer, in answer to the exit
/// sequence's request (ADR 0019 §2, steps 2–3). Synchronous and brief: it
/// records the answer, and whatever follows runs off the main thread.
#[tauri::command]
pub fn exit_flushed<R: Runtime>(window: tauri::Window<R>) {
    teardown::answered(&window);
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_a_web_address_is_opened() {
        assert!(super::opens_in_browser(
            "https://claude.ai/oauth/authorize?x=1"
        ));
        assert!(super::opens_in_browser("http://localhost:1455/auth"));
        for refused in [
            "file:///etc/passwd",
            "/Applications/Calculator.app",
            "-a Terminal",
            "https://a b",
            "javascript:alert(1)",
        ] {
            assert!(!super::opens_in_browser(refused), "{refused}");
        }
    }

    use super::*;

    #[test]
    fn a_command_doc_is_read_only_from_a_markdown_file() {
        let dir = std::env::temp_dir().join(format!("piary-command-doc-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = |name: &str| dir.join(name).to_string_lossy().into_owned();
        std::fs::write(path("review.md"), "docs").unwrap();
        std::fs::write(path("secret.env"), "KEY=1").unwrap();
        assert_eq!(command_doc_read(path("review.md")).as_deref(), Some("docs"));
        assert_eq!(command_doc_read(path("secret.env")), None);
        assert_eq!(command_doc_read(path("absent.md")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn open_shell(ptys: &Ptys, sid: &str, term_id: &str) {
        let sink: Arc<dyn Sink> = Arc::new(|_: PtyEvent| {});
        ptys.open(
            OpenRequest {
                sid: sid.into(),
                term_id: term_id.into(),
                command: "/bin/sh".into(),
                args: Vec::new(),
                cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                cols: Some(80),
                rows: Some(24),
                path: None,
            },
            sink,
        )
        .expect("open");
    }

    #[test]
    fn stopping_a_session_ends_its_terminals() {
        let (sessions, ptys) = (Sessions::default(), Ptys::default());
        open_shell(&ptys, "s1", "t1");
        stop_session(&sessions, &ptys, "s1", false).expect("stop");
        assert_eq!(ptys.sid_of("t1"), None);
    }

    #[test]
    fn stopping_pi_alone_leaves_the_windows_terminals_running() {
        let (sessions, ptys) = (Sessions::default(), Ptys::default());
        open_shell(&ptys, "s1", "t1");
        stop_session(&sessions, &ptys, "s1", true).expect("stop");
        assert_eq!(ptys.sid_of("t1").as_deref(), Some("s1"));
        ptys.close("s1", "t1").expect("close");
    }
}
