//! The exit sequence against the running app (ADR 0019 §2).
//!
//! `exit.rs` keeps the bookkeeping and holds no Tauri types; this is the half
//! that touches the event loop. The rule both halves answer to: **nothing here
//! waits on the main thread.** A page's answer is delivered on the main thread,
//! so a handler that waited there for it would wait for something it is itself
//! preventing. Every entry point prevents what it must, sends its request, and
//! returns; the release runs on a thread of its own.

use std::sync::Arc;
use std::thread;

use tauri::{AppHandle, CloseRequestApi, Emitter, EventTarget, ExitRequestApi, Manager, Runtime};

use crate::capture::Capture;
use crate::exit::{self, Decision, Exit, OnSignal};
use crate::pty::Ptys;
use crate::session::Sessions;
use crate::windows;
use crate::wire::FlushRequest;

/// The event a page answers by ending its turn, writing its buffer, and calling
/// `exit_flushed`.
pub const FLUSH_EVENT: &str = "exit-flush";

fn request() -> FlushRequest {
    FlushRequest {
        turn_bound_ms: exit::TURN_END_BOUND.as_millis() as u32,
    }
}

/// `RunEvent::ExitRequested`. The Quit item, a first SIGINT or SIGTERM, and a
/// self-test's verdict arrive here as `Some(code)` through `AppHandle::exit`;
/// the last window going away arrives as `None`, and begins the sequence with
/// nobody to ask — its own children went with it (`close`), and capture, which
/// is app-wide, is reaped by the release.
pub fn exit_requested<R: Runtime>(app: &AppHandle<R>, code: Option<i32>, api: &ExitRequestApi) {
    let windows = app.webview_windows().into_keys().collect();
    match app.state::<Exit>().requested(code, windows) {
        // The exit the release asked for, with every child already reaped.
        Decision::Allow => {}
        Decision::Wait => api.prevent_exit(),
        Decision::Begin(windows) => {
            api.prevent_exit();
            if windows.is_empty() {
                spawn_release(app);
                return;
            }
            // Step 1 is already in force: `requested` set the flag that the
            // starting commands refuse on. Steps 2–3 are the pages' — every
            // listener gets the request, and each answers for its own window.
            let _ = app.emit(FLUSH_EVENT, request());
            let app = app.clone();
            thread::spawn(move || {
                thread::sleep(exit::ANSWER_BOUND);
                release(&app);
            });
        }
    }
}

/// SIGINT and SIGTERM, for the life of the app. The first enters the sequence
/// through the same `AppHandle::exit` the Quit item calls, so Ctrl-C in the
/// `pnpm app` terminal flushes what ⌘Q flushes; a second skips the wait on the
/// pages, reaps, and exits (ADR 0019 §2). The signal thread is the one that
/// waits on the reap, never the main thread.
pub fn listen_for_signals<R: Runtime>(app: &AppHandle<R>) -> std::io::Result<()> {
    let app = app.clone();
    exit::listen(move |signo| match app.state::<Exit>().signalled(signo) {
        OnSignal::Quit(code) => app.exit(code),
        OnSignal::Now(code) => {
            reap(&app);
            std::process::exit(code);
        }
    })
}

/// `WindowEvent::CloseRequested`: the smaller instance of the sequence, for one
/// window. The close is always prevented here and performed once the page has
/// flushed, or its bound has passed.
pub fn close_requested<R: Runtime>(window: &tauri::Window<R>, api: &CloseRequestApi) {
    api.prevent_close();
    let exit = window.state::<Exit>();
    if !exit.close_requested(window.label()) {
        // Already asked — by an earlier click, or by a quit, whose exit will
        // take this window with it.
        return;
    }
    let target = EventTarget::webview_window(window.label());
    let _ = window.emit_to(target, FLUSH_EVENT, request());
    let window = window.clone();
    thread::spawn(move || {
        thread::sleep(exit::ANSWER_BOUND);
        if window.state::<Exit>().close_timed_out(window.label()) {
            close(&window);
        }
    });
}

/// A page has ended its turn and written its buffer.
pub fn answered<R: Runtime>(window: &tauri::Window<R>) {
    let answered = window.state::<Exit>().answered(window.label());
    if answered.close {
        close(window);
    }
    if answered.release {
        spawn_release(window.app_handle());
    }
}

/// Closes a window whose page has flushed: steps 4–5 for the sessions no other
/// window uses — stop their pi, close their terminals — then the window.
///
/// On a thread of its own, because a page's answer arrives on the main thread
/// and a stop waits on a child for up to its grace. `destroy`, not `close`: a
/// close would raise `CloseRequested` again and ask the page a second time.
fn close<R: Runtime>(window: &tauri::Window<R>) {
    let window = window.clone();
    thread::spawn(move || {
        let sids = window.state::<Exit>().detach(window.label());
        exit::reap_sessions(
            &window.state::<Arc<Sessions>>(),
            &window.state::<Arc<Ptys>>(),
            &sids,
        );
        let _ = window.destroy();
    });
}

/// `WindowEvent::Destroyed`: the backstop for a window that went without its
/// close sequence — destroyed by a driver, or by its webview dying — whose
/// sessions would otherwise run on, unwatched, until the app quits. After an
/// orderly close `close` has already detached the window, so this finds
/// nothing. Off the main thread, as `close` is: a stop waits on its child.
pub fn destroyed<R: Runtime>(window: &tauri::Window<R>) {
    window.state::<windows::Shown>().forget(window.label());
    let window = window.clone();
    thread::spawn(move || {
        let sids = window.state::<Exit>().detach(window.label());
        exit::reap_sessions(
            &window.state::<Arc<Sessions>>(),
            &window.state::<Arc<Ptys>>(),
            &sids,
        );
    });
}

fn spawn_release<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    thread::spawn(move || release(&app));
}

/// Ends the sequence and lets the exit through, once — the last answer and the
/// bound both reach here, and only the first acts.
///
/// Off the main thread by construction: steps 4–6 wait on child processes, up
/// to a stop's grace, and the event loop must keep running while they do.
fn release<R: Runtime>(app: &AppHandle<R>) {
    let Some(code) = app.state::<Exit>().release() else {
        return;
    };
    reap(app);
    app.exit(code);
}

/// `RunEvent::Exit`: the backstop for the exits that reach only the loop's end
/// — the Dock's Quit, a logout. It cannot be prevented and no page can be asked
/// anything, so the flush does not happen (ADR 0018's third row, as a bound);
/// the children are still reaped. Synchronous, on the main thread, because the
/// process is going the moment this returns. After an orderly release there is
/// nothing left, and it returns at once.
pub fn backstop<R: Runtime>(app: &AppHandle<R>) {
    reap(app);
}

/// Steps 4–6 for everything still live.
fn reap<R: Runtime>(app: &AppHandle<R>) {
    exit::reap(
        &app.state::<Arc<Sessions>>(),
        &app.state::<Arc<Ptys>>(),
        &app.state::<Arc<Capture>>(),
    );
}
