//! The exit sequence's bookkeeping: which exit is in progress, which windows
//! still owe an answer, and the one moment the app is let go.
//!
//! ADR 0019 §2 owns the ordering; this module owns the state that makes it
//! safe to run without blocking the main thread. The sequence is a round trip
//! — the host asks each page to end its turn and flush its buffer, and a page
//! answers on the main thread — so nothing here waits. The event handler
//! prevents the exit and returns; whichever comes first, the last answer or the
//! bound, releases it. It also holds which windows use which session, and the
//! two calls that end the children (`reap`, `reap_sessions`), and what a
//! SIGINT or SIGTERM asks of the app (`signalled`, `listen`). Holds no
//! `tauri::` types, so `cargo test` drives every transition and every reap
//! against real children, and every signal as a real one, without an app
//! (ADR 0014).

use std::collections::{HashMap, HashSet};
use std::io;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use signal_hook::consts::{SIGINT, SIGTERM};
use signal_hook::iterator::Signals;

use crate::capture::Capture;
use crate::pty::Ptys;
use crate::session::Sessions;

/// How long a page may take to end its running turn before it flushes anyway.
///
/// An abort pi does not honour must not hold the quit hostage (ADR 0019 §3).
/// Sent to the page with the request, so the page's bound and the host's below
/// cannot be tuned apart.
pub const TURN_END_BOUND: Duration = Duration::from_secs(2);

/// How long the host waits for every page's answer before it proceeds.
///
/// The page's turn bound plus room for one document write. A page that never
/// answers costs its unflushed buffer — ADR 0018's third row — and never a
/// quit that hangs.
pub const ANSWER_BOUND: Duration = Duration::from_secs(4);

/// Why a command that would start something was refused.
pub const QUITTING: &str = "Piary is quitting";

/// What to do with an `ExitRequested`.
#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    /// Prevent it and start the sequence by asking these windows. An empty
    /// list means nobody is left to ask: release at once.
    Begin(Vec<String>),
    /// Prevent it: the sequence is already running and ends in an exit of its
    /// own.
    Wait,
    /// Let it through.
    Allow,
}

/// What a SIGINT or SIGTERM asks of the app (ADR 0019 §2). Each carries the
/// code to exit with: 128 plus the signal's number, the shell's convention for
/// a process a signal ended.
#[derive(Debug, PartialEq, Eq)]
pub enum OnSignal {
    /// The first: the sequence ⌘Q runs — end the turns, flush, reap, exit.
    Quit(i32),
    /// Any later one: stop waiting on the pages. The children are still
    /// reaped — that is bounded by the stops' grace, and leaving them is what
    /// the sequence exists to prevent — and then the process exits.
    Now(i32),
}

/// What a page's answer means for the host.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Answered {
    /// The window asked to close has flushed, and may now be destroyed.
    pub close: bool,
    /// Every window has answered the quit: release the exit.
    pub release: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Running,
    /// The sequence has started: new work is refused, pages are being asked.
    Quitting,
    /// The sequence has ended and the exit it requested is let through.
    Releasing,
}

#[derive(Debug)]
struct Inner {
    phase: Phase,
    /// The code the exit was requested with, kept for the exit that releases it
    /// — a self-test's verdict is an exit code and must survive the detour.
    code: i32,
    /// Windows that have not answered the quit yet.
    waiting: HashSet<String>,
    /// Windows that asked to close and have not answered yet.
    closing: HashSet<String>,
    /// Which windows have started something for each session — a pi or a
    /// terminal. A window's close stops a session only once no other window
    /// still uses it.
    users: HashMap<String, HashSet<String>>,
    /// Whether a SIGINT or SIGTERM has already arrived.
    signalled: bool,
}

/// The app-wide exit state. One per app, managed beside the subsystems.
#[derive(Debug)]
pub struct Exit {
    inner: Mutex<Inner>,
}

impl Default for Exit {
    fn default() -> Self {
        Exit {
            inner: Mutex::new(Inner {
                phase: Phase::Running,
                code: 0,
                waiting: HashSet::new(),
                closing: HashSet::new(),
                users: HashMap::new(),
                signalled: false,
            }),
        }
    }
}

impl Exit {
    /// Decides an `ExitRequested`.
    ///
    /// `Some(code)` is the app asking to exit — the Quit item, or a
    /// self-test's verdict — and the first one starts the sequence over
    /// `windows`. `None` is the last window having been destroyed: the same
    /// sequence with no page left to ask, so it is released at once, and what
    /// is still live is reaped before the exit rather than left behind by it
    /// (ADR 0019 §2).
    pub fn requested(&self, code: Option<i32>, windows: Vec<String>) -> Decision {
        // A window being destroyed may still be listed; it has no page to ask.
        let (code, windows) = match code {
            Some(code) => (code, windows),
            None => (0, Vec::new()),
        };
        let mut inner = self.inner.lock().unwrap();
        match inner.phase {
            Phase::Running => {
                inner.phase = Phase::Quitting;
                inner.code = code;
                inner.waiting = windows.iter().cloned().collect();
                Decision::Begin(windows)
            }
            Phase::Quitting => Decision::Wait,
            Phase::Releasing => Decision::Allow,
        }
    }

    /// A SIGINT or SIGTERM arrived. The first asks for the quit; a second
    /// means whoever sent it will not wait for the pages.
    pub fn signalled(&self, signo: i32) -> OnSignal {
        let code = 128 + signo;
        let mut inner = self.inner.lock().unwrap();
        if std::mem::replace(&mut inner.signalled, true) {
            OnSignal::Now(code)
        } else {
            OnSignal::Quit(code)
        }
    }

    /// Whether a command that would start something must refuse (ADR 0019 §2,
    /// step 1). Writing a document is not one of them: the flush is a write.
    pub fn refuses_new_work(&self) -> bool {
        self.inner.lock().unwrap().phase != Phase::Running
    }

    /// `window` started something for `sid` — a pi, or a terminal.
    pub fn attach(&self, window: &str, sid: &str) {
        self.inner
            .lock()
            .unwrap()
            .users
            .entry(sid.to_string())
            .or_default()
            .insert(window.to_string());
    }

    /// `window` is going away. Answers the sessions no other window uses, which
    /// go with it.
    pub fn detach(&self, window: &str) -> Vec<String> {
        let mut inner = self.inner.lock().unwrap();
        let mut orphaned = Vec::new();
        inner.users.retain(|sid, windows| {
            windows.remove(window);
            if windows.is_empty() {
                orphaned.push(sid.clone());
                return false;
            }
            true
        });
        orphaned
    }

    /// A window asked to close. Answers whether to ask its page to flush;
    /// during a quit it is not asked again, and the quit's exit takes it.
    pub fn close_requested(&self, label: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if inner.phase != Phase::Running {
            return false;
        }
        inner.closing.insert(label.to_string())
    }

    /// A page answered: its turn has ended and its buffer is written.
    pub fn answered(&self, label: &str) -> Answered {
        let mut inner = self.inner.lock().unwrap();
        let was_closing = inner.closing.remove(label);
        let was_waiting = inner.waiting.remove(label);
        Answered {
            // During a quit the window is left for the quit's exit to take,
            // so a close and a release never race to tear it down.
            close: was_closing && inner.phase == Phase::Running,
            release: was_waiting && inner.phase == Phase::Quitting && inner.waiting.is_empty(),
        }
    }

    /// A close's bound expired. Answers whether the window is still waiting to
    /// close, and stops it waiting.
    pub fn close_timed_out(&self, label: &str) -> bool {
        self.inner.lock().unwrap().closing.remove(label)
    }

    /// Ends the sequence, exactly once. The last answer and the bound's timer
    /// both call this; the first gets the code to exit with and every later
    /// caller gets `None`.
    pub fn release(&self) -> Option<i32> {
        let mut inner = self.inner.lock().unwrap();
        if inner.phase != Phase::Quitting {
            return None;
        }
        inner.phase = Phase::Releasing;
        inner.waiting.clear();
        Some(inner.code)
    }
}

/// Steps 4–6 of the sequence (ADR 0019 §2), for everything still live: stop
/// every pi, close every terminal, stop capture — in that order, because pi is
/// the only child that writes into the document and the costliest to leak.
///
/// Waits on child processes, up to a stop's grace, so it runs off the main
/// thread — except in the `RunEvent::Exit` backstop, which has nothing left to
/// keep responsive.
pub fn reap(sessions: &Sessions, ptys: &Ptys, capture: &Capture) {
    sessions.stop_all();
    ptys.close_all();
    // The app is going; a helper that could not be asked is killed by `stop`
    // either way, and there is no one left to tell.
    let _ = capture.stop();
}

/// Steps 4–5 for the sessions a closing window leaves behind (`Exit::detach`).
/// Capture is app-wide, not a window's, so it is not stopped here.
pub fn reap_sessions(sessions: &Sessions, ptys: &Ptys, sids: &[String]) {
    for sid in sids {
        let _ = sessions.drop_session(sid);
    }
    for sid in sids {
        let _ = ptys.close_session(sid);
    }
}

/// Hands every SIGINT and SIGTERM to `act`, on a thread of its own, for the
/// life of the process.
///
/// From the moment this returns, neither signal ends the process by itself:
/// `act` is the only thing either does, so it must exit in the end. A signal
/// handler proper may do almost nothing; this one only wakes the thread, and
/// `act` runs there, free to take locks and wait (ADR 0019 §2).
pub fn listen(mut act: impl FnMut(i32) + Send + 'static) -> io::Result<()> {
    let mut signals = Signals::new([SIGINT, SIGTERM])?;
    thread::Builder::new()
        .name("signals".into())
        .spawn(move || {
            for signo in signals.forever() {
                act(signo);
            }
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    //! What these assert is the bookkeeping: that the first request starts the
    //! sequence and later ones wait, that the release happens once whoever
    //! reaches it, and that work is refused from the first moment. The event
    //! loop that calls this cannot be driven by `cargo test` without an app;
    //! that end is `docs/running-the-app.md`'s quit checklist.
    use super::*;
    use std::sync::Arc;

    fn windows(labels: &[&str]) -> Vec<String> {
        labels.iter().map(|label| label.to_string()).collect()
    }

    #[test]
    fn the_first_exit_request_begins_and_a_second_waits() {
        let exit = Exit::default();
        assert_eq!(
            exit.requested(Some(0), windows(&["main"])),
            Decision::Begin(windows(&["main"]))
        );
        // A second ⌘Q while the pages are flushing must not start a second
        // round, nor slip the exit past the first.
        assert_eq!(exit.requested(Some(0), windows(&["main"])), Decision::Wait);
    }

    #[test]
    fn the_last_window_going_away_ends_the_app_through_the_sequence() {
        // There is no page left to ask, so the release is at once — but it is
        // still the sequence's release, and what is still live is reaped
        // before the exit rather than left behind by it.
        let exit = Exit::default();
        assert_eq!(exit.requested(None, windows(&[])), Decision::Begin(vec![]));
        assert!(exit.refuses_new_work());
        assert_eq!(exit.release(), Some(0));
        assert_eq!(
            exit.requested(Some(0), windows(&[])),
            Decision::Allow,
            "the exit the release asks for goes through"
        );
    }

    #[test]
    fn a_session_is_left_running_while_another_window_still_uses_it() {
        // Two windows can share a session. Stopping it with the first to close
        // would end the other's pi mid-turn.
        let exit = Exit::default();
        exit.attach("one", "shared");
        exit.attach("two", "shared");
        exit.attach("one", "own");
        let mut first = exit.detach("one");
        first.sort();
        assert_eq!(first, vec!["own".to_string()]);
        assert_eq!(exit.detach("two"), vec!["shared".to_string()]);
        assert!(exit.detach("two").is_empty(), "already let go");
    }

    // ---- steps 4–6, against real children

    use crate::capture::{Capture, Sink as CaptureSink};
    use crate::pty::{OpenRequest, PtyEvent, Ptys};
    use crate::session::{Sessions, Sink as SessionSink, Spawn};
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Instant;

    struct Quiet;
    impl SessionSink for Quiet {
        fn event(&self, _sid: &str, _event: serde_json::Value) {}
        fn exited(&self, _sid: &str, _code: Option<i32>) {}
    }
    impl CaptureSink for Quiet {
        fn line(&self, _line: String) {}
        fn ended(&self, _code: Option<i32>) {}
    }

    /// A real pi stand-in that stays until it is stopped (`session.rs`'s
    /// fixture, which explains why it is a process and not a script).
    fn pi(sessions: &Sessions, sid: &str) {
        let spawn = Spawn {
            cli: concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fake-pi").into(),
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            session_id: sid.into(),
            args: vec!["--fake".into(), "linger".into()],
            draw: "a2ui".into(),
            path: None,
        };
        sessions.start(sid, &spawn, Arc::new(Quiet)).expect("pi");
    }

    /// A real shell in a real PTY; the receiver hears its exit.
    fn shell(ptys: &Ptys, sid: &str, term_id: &str) -> mpsc::Receiver<String> {
        let (tx, rx) = mpsc::channel();
        let sink = move |event: PtyEvent| {
            if let PtyEvent::Exit { term_id, .. } = event {
                let _ = tx.send(term_id);
            }
        };
        ptys.open(
            OpenRequest {
                sid: sid.into(),
                term_id: term_id.into(),
                command: "/bin/sh".into(),
                args: Vec::new(),
                cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                cols: None,
                rows: None,
                path: None,
            },
            Arc::new(sink),
        )
        .expect("shell");
        rx
    }

    fn exits(rx: &mpsc::Receiver<String>) -> bool {
        rx.recv_timeout(Duration::from_secs(10)).is_ok()
    }

    #[test]
    fn reaping_ends_every_child_the_app_started() {
        // What the exit sequence's release and the `RunEvent::Exit` backstop
        // both call. The handler itself cannot be driven without an app; this is
        // the whole of what it does, and `docs/running-the-app.md` step 13 is
        // the end that needs one.
        let sessions = Sessions::default();
        let ptys = Ptys::default();
        let capture = Capture::default();
        pi(&sessions, "a");
        pi(&sessions, "b");
        let term = shell(&ptys, "a", "t1");
        // `cat` reads its stdin until it closes: a helper that stays.
        capture
            .start(&PathBuf::from("/bin/cat"), Arc::new(Quiet))
            .expect("helper");

        let started = Instant::now();
        reap(&sessions, &ptys, &capture);
        assert!(sessions.open().is_empty(), "a pi outlived the reap");
        assert_eq!(ptys.sid_of("t1"), None);
        assert!(exits(&term), "the shell outlived the reap");
        assert!(!capture.is_running(), "the helper outlived the reap");
        assert!(
            started.elapsed() < ANSWER_BOUND,
            "reaping took {:?}",
            started.elapsed()
        );
    }

    #[test]
    fn reaping_a_windows_sessions_leaves_every_other_session_running() {
        // A closing window takes its own children and nobody else's.
        let sessions = Sessions::default();
        let ptys = Ptys::default();
        pi(&sessions, "mine");
        pi(&sessions, "theirs");
        let mine = shell(&ptys, "mine", "t-mine");
        let _theirs = shell(&ptys, "theirs", "t-theirs");

        reap_sessions(&sessions, &ptys, &["mine".to_string()]);
        assert!(!sessions.is_live("mine"));
        assert!(exits(&mine), "the closing window's shell outlived it");
        assert!(
            sessions.is_live("theirs"),
            "the other window's pi was stopped"
        );
        assert_eq!(ptys.sid_of("t-theirs").as_deref(), Some("theirs"));
        reap(&sessions, &ptys, &Capture::default());
    }

    #[test]
    fn new_work_is_refused_from_the_moment_the_sequence_begins() {
        let exit = Exit::default();
        assert!(!exit.refuses_new_work());
        exit.requested(Some(0), windows(&["main"]));
        assert!(
            exit.refuses_new_work(),
            "a prompt sent mid-flush would land in a buffer nothing saves"
        );
    }

    #[test]
    fn the_exit_is_released_only_when_every_window_has_answered() {
        let exit = Exit::default();
        exit.requested(Some(0), windows(&["a", "b"]));
        assert_eq!(
            exit.answered("a"),
            Answered::default(),
            "b has not answered"
        );
        assert_eq!(
            exit.answered("b"),
            Answered {
                close: false,
                release: true
            }
        );
    }

    #[test]
    fn a_window_answering_twice_does_not_release_early() {
        let exit = Exit::default();
        exit.requested(Some(0), windows(&["a", "b"]));
        exit.answered("a");
        assert!(!exit.answered("a").release, "b still owes an answer");
    }

    #[test]
    fn the_release_happens_once_and_carries_the_requested_code() {
        // A self-test exits with its verdict; the detour through the flush must
        // not turn a failing run into a passing one.
        let exit = Exit::default();
        exit.requested(Some(1), windows(&["main"]));
        assert_eq!(exit.release(), Some(1));
        assert_eq!(
            exit.release(),
            None,
            "the bound and the answer both reach here"
        );
        assert_eq!(exit.requested(Some(1), windows(&["main"])), Decision::Allow);
    }

    #[test]
    fn racing_releases_let_exactly_one_through() {
        let exit = Arc::new(Exit::default());
        exit.requested(Some(0), windows(&["main"]));
        let winners: usize = (0..8)
            .map(|_| {
                let exit = Arc::clone(&exit);
                std::thread::spawn(move || exit.release().is_some())
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|handle| handle.join().unwrap() as usize)
            .sum();
        assert_eq!(winners, 1);
    }

    #[test]
    fn nothing_is_released_before_a_sequence_has_begun() {
        let exit = Exit::default();
        assert_eq!(exit.release(), None);
        assert!(!exit.answered("main").release);
    }

    #[test]
    fn a_closing_window_is_closed_once_its_page_has_answered() {
        let exit = Exit::default();
        assert!(exit.close_requested("main"), "the page is asked");
        assert!(
            !exit.close_requested("main"),
            "a second click does not ask twice"
        );
        assert_eq!(
            exit.answered("main"),
            Answered {
                close: true,
                release: false
            }
        );
        assert!(
            !exit.close_timed_out("main"),
            "the bound finds nothing left to do"
        );
    }

    #[test]
    fn a_close_that_is_never_answered_is_closed_by_its_bound() {
        let exit = Exit::default();
        exit.close_requested("main");
        assert!(exit.close_timed_out("main"));
        assert!(
            !exit.answered("main").close,
            "a late answer does not close it twice"
        );
    }

    #[test]
    fn during_a_quit_a_close_is_left_to_the_quit() {
        let exit = Exit::default();
        exit.close_requested("main");
        exit.requested(Some(0), windows(&["main"]));
        assert!(
            !exit.close_requested("main"),
            "the quit already asked this page"
        );
        assert_eq!(
            exit.answered("main"),
            Answered {
                close: false,
                release: true
            }
        );
    }

    #[test]
    fn the_first_signal_asks_for_the_quit_and_a_later_one_exits_now() {
        // Ctrl-C runs the sequence ⌘Q runs; a second Ctrl-C is someone who
        // will not wait for it, and the bound is no longer theirs to sit out.
        let exit = Exit::default();
        assert_eq!(exit.signalled(SIGINT), OnSignal::Quit(130));
        assert_eq!(exit.signalled(SIGTERM), OnSignal::Now(143));
        assert_eq!(exit.signalled(SIGINT), OnSignal::Now(130));
    }

    #[test]
    fn a_signal_reaches_the_listener_and_does_not_end_the_process() {
        // Real signals, sent by `kill` to this test process. Were either one
        // still ending the process by default, the run would die here — and
        // the app, which this stands in for, with every child left behind.
        let (tx, rx) = mpsc::channel();
        listen(move |signo| {
            let _ = tx.send(signo);
        })
        .expect("listen");
        for (name, signo) in [("-TERM", SIGTERM), ("-INT", SIGINT)] {
            let sent = std::process::Command::new("/bin/kill")
                .args([name, &std::process::id().to_string()])
                .status()
                .expect("kill");
            assert!(sent.success());
            assert_eq!(rx.recv_timeout(Duration::from_secs(10)), Ok(signo));
        }
    }

    #[test]
    fn the_page_is_given_room_to_end_its_turn_before_the_host_gives_up() {
        // The host's bound covers the page's turn bound and a write; the other
        // way round, a slow abort would be cut off before the flush it waits for.
        assert!(ANSWER_BOUND > TURN_END_BOUND);
    }
}
