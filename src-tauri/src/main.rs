//! Piary's desktop shell. One canvas, not a chat (ADR 0005) — the window hosts
//! the markdown document the user and the agent both write into.
//!
//! This file is the wiring and nothing else: the IPC surface lives in
//! `commands.rs`, and the subsystems behind it hold no Tauri types so that
//! `cargo test` can drive them without an app (ADR 0014).

// Release builds get no console window on Windows. macOS is the only target
// today, but the attribute is what a real app carries and costs nothing.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};

mod attachments;
mod bundle;
mod capture;
mod cell_state;
mod commands;
mod diag;
mod docs;
mod exit;
mod extension;
mod extension_set;
mod harness;
mod lines;
mod menu;
mod menu_keys;
mod pi_cli;
mod preferences;
mod pty;
mod session;
mod store;
mod teardown;
mod transcript;
mod watch;
mod windows;
mod wire;
mod workspace_files;

// The embedded WebDriver server is an unauthenticated server on a fixed local
// port. Three gates stand between it and a release, and this is the one that
// cannot be forgotten at the call site: a release build with the feature on
// does not compile at all.
#[cfg(all(feature = "e2e", not(debug_assertions)))]
compile_error!(
    "the `e2e` feature ships an unauthenticated WebDriver server and must never be in a release \
     build — test against `pnpm app:e2e:build`, a debug build"
);

/// Whether a test harness drives this run (`harness.rs`).
fn driven_by_harness() -> bool {
    harness::driven(
        cfg!(all(feature = "e2e", debug_assertions)),
        std::env::var("PIARY_E2E").ok().as_deref(),
    )
}

/// Installs the embedded WebDriver server when a harness drives this run, and
/// keeps every window out of sight unless `PIARY_E2E_SHOW=1` asks to watch.
#[cfg(all(feature = "e2e", debug_assertions))]
fn install_webdriver<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    driven: bool,
) -> tauri::Builder<R> {
    if !driven {
        return builder;
    }
    eprintln!("piary: embedded WebDriver server on 127.0.0.1:4445 (PIARY_E2E=1)");
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());
    if std::env::var("PIARY_E2E_SHOW").as_deref() == Ok("1") {
        return builder;
    }
    builder.on_page_load(|webview, _| out_of_sight(&webview.window()))
}

/// Makes a window fully transparent and click-through, so a driven run shows
/// nothing on the developer's screen.
///
/// Transparent rather than hidden or moved off screen: WebKit suspends
/// rendering, timers and rAF for a window it considers not visible, and a
/// window at zero alpha that is still ordered in is, to WindowServer, visible
/// (TEST_ARCHITECTURE.md §6). Applied on every page load, which is the first
/// moment a new window can be reached; doing it twice is harmless.
#[cfg(all(feature = "e2e", debug_assertions))]
fn out_of_sight<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = target.set_ignore_cursor_events(true);
        if let Ok(ns_window) = target.ns_window() {
            // SAFETY: `ns_window` is this live window's NSWindow, and AppKit
            // is called on the main thread, where it must be.
            unsafe { set_alpha(ns_window, 0.0) };
        }
    });
}

// The Objective-C runtime the system already loads into every AppKit process:
// one message, `-[NSWindow setAlphaValue:]`, which Tauri has no API for.
#[cfg(all(feature = "e2e", debug_assertions))]
#[link(name = "objc")]
extern "C" {
    fn sel_registerName(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;
    fn objc_msgSend();
}

/// Sends `setAlphaValue:` to an NSWindow.
///
/// # Safety
/// `ns_window` must be a live NSWindow, and the call must be on the main thread.
#[cfg(all(feature = "e2e", debug_assertions))]
unsafe fn set_alpha(ns_window: *mut std::ffi::c_void, alpha: f64) {
    // `objc_msgSend` is declared without a signature and called through the
    // one this message has, which is how the runtime is meant to be used.
    let send: unsafe extern "C" fn(*mut std::ffi::c_void, *mut std::ffi::c_void, f64) =
        std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    send(
        ns_window,
        sel_registerName(c"setAlphaValue:".as_ptr()),
        alpha,
    );
}

/// Without the feature there is nothing to install, and the app cannot be
/// driven from outside.
#[cfg(not(all(feature = "e2e", debug_assertions)))]
fn install_webdriver<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
    _driven: bool,
) -> tauri::Builder<R> {
    builder
}

fn main() {
    let driven = driven_by_harness();
    let mut app = install_webdriver(tauri::Builder::default(), driven)
        // The system panels an import and an export ask for a path in
        // (ADR 0049). Rust calls it; the page is granted none of its commands.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // First, so everything after it — a failed setup step included —
            // has somewhere a Finder-launched user can read it. A log that
            // cannot be opened costs only the log.
            match app.path().app_log_dir().map_err(|e| e.to_string()) {
                Ok(default) => {
                    let dir = diag::log_dir(std::env::var_os(diag::LOG_DIR_ENV), default);
                    if let Err(e) = diag::install(&dir) {
                        eprintln!("piary: no log in {}: {e}", dir.display());
                    }
                }
                Err(e) => eprintln!("piary: no log directory: {e}"),
            }
            let store = store::Store::from_env();
            // The page is told which document changed; what to do about it is
            // the page's decision, not the shell's.
            let handle = app.handle().clone();
            store.watch(move |id| {
                let _ = handle.emit("doc-changed", id);
            })?;
            app.manage(store);
            app.manage(std::sync::Arc::new(pty::Ptys::default()));
            menu::install(app.handle())?;
            app.manage(std::sync::Arc::new(capture::Capture::default()));
            app.manage(std::sync::Arc::new(session::Sessions::default()));
            app.manage(exit::Exit::default());
            app.manage(windows::Shown::default());
            app.manage(std::sync::Arc::new(bundle::Imports::default()));
            // After `Exit` is managed, because the first signal reads it. A
            // listener that cannot be installed leaves the signals' default,
            // which ends the app without the sequence; said, not fatal.
            if let Err(e) = teardown::listen_for_signals(app.handle()) {
                diag::note(&format!(
                    "piary: SIGINT/SIGTERM will not flush or reap: {e}"
                ));
            }
            Ok(())
        })
        // The document names an attachment `/attachments/<name>`, which neither
        // the dev server nor the bundled origin serves; the canvas maps it to
        // this scheme instead (`resolveAsset`). Core Tauri, no feature: the
        // `asset` protocol would need one and a file-system scope wider than
        // one directory.
        .register_uri_scheme_protocol("piary-file", |ctx, request| {
            let store = ctx.app_handle().state::<store::Store>();
            let served = attachments::serve(&attachments::dir(&store.paths), request.uri().path());
            let mut response = tauri::http::Response::builder().status(served.status);
            for (name, value) in served.headers {
                response = response.header(name, value);
            }
            response
                .body(served.body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
        })
        // A cell's `FileAttachment` reads the workspace through this scheme
        // (`notebook-cells.md` §Files); the guard is `workspace_files`.
        .register_uri_scheme_protocol("piary-workspace", |ctx, request| {
            let store = ctx.app_handle().state::<store::Store>();
            let home = std::env::var_os("HOME")
                .map(std::path::PathBuf::from)
                .unwrap_or_default();
            let served = workspace_files::serve(store.workspace(), &home, request.uri().path());
            let mut response = tauri::http::Response::builder().status(served.status);
            for (name, value) in served.headers {
                response = response.header(name, value);
            }
            response
                .body(served.body)
                .unwrap_or_else(|_| tauri::http::Response::new(Vec::new()))
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                teardown::close_requested(window, api);
            }
            tauri::WindowEvent::Destroyed => teardown::destroyed(window),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::log_line,
            commands::report,
            commands::docs_read,
            commands::command_doc_read,
            commands::extensions_list,
            commands::extensions_set,
            commands::docs_write,
            commands::docs_list,
            commands::docs_entries,
            commands::delete_conversation,
            commands::attachments_store,
            commands::attachments_read,
            commands::attachments_path,
            commands::export_conversations,
            commands::open_transfer,
            commands::import_pick,
            commands::import_place,
            commands::import_write,
            commands::import_cancel,
            commands::cell_state_read,
            commands::cell_state_write,
            commands::pty_open,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_close,
            commands::pty_close_session,
            commands::window_geometry,
            commands::open_document,
            commands::window_shows,
            commands::show_document,
            commands::remember_window,
            commands::preferences_read,
            commands::preferences_write,
            commands::open_preferences,
            commands::face_source,
            commands::menu_chords,
            commands::overlay_support,
            commands::capture_start,
            commands::capture_send,
            commands::capture_stop,
            commands::capture_running,
            commands::focus_window,
            commands::open_url,
            commands::open_camera_settings,
            commands::pi_which,
            commands::pi_start,
            commands::pi_send,
            commands::pi_stop,
            commands::pi_running,
            commands::pi_sessions,
            commands::pi_rebuild,
            commands::exit_flushed
        ])
        .build(tauri::generate_context!())
        .expect("piary failed to start");
    // A driven run never takes the user's focus: the developer is using the
    // machine while it runs. `Prohibited` is the one policy macOS holds to when
    // the app is a child of the active app (the terminal running the tests),
    // which otherwise hands it activation at launch whatever the app asks for.
    // It still opens real, ordered-in windows, which WebKit keeps rendering
    // (TEST_ARCHITECTURE.md §6). Set before the event loop runs, because the
    // loop's launch is where activation happens.
    if driven {
        app.set_activation_policy(tauri::ActivationPolicy::Prohibited);
    }
    app.run(|app, event| match event {
        // Every exit the app performs on purpose — the Quit item, a
        // first SIGINT or SIGTERM, a self-test's verdict, the last window
        // closing — comes through here, and the ordering lives in one
        // place (ADR 0019 §2).
        tauri::RunEvent::ExitRequested { code, api, .. } => {
            teardown::exit_requested(app, code, &api);
        }
        // The backstop: the Dock's Quit and a logout reach only this.
        tauri::RunEvent::Exit => teardown::backstop(app),
        _ => {}
    });
}
