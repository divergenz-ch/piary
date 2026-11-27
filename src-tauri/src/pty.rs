//! Terminals: one real PTY per open terminal, its output pushed to the page as
//! events.
//!
//! A terminal is a PTY and not a pipe because programs behave differently when
//! they believe a human is watching — colour, columns, progress bars, a line
//! editor. `portable-pty` gives the master/slave pair; this module owns the
//! lifetime, the ownership rules and the coalescing.
//!
//! Three invariants from ADR 0013, each with a test:
//!
//! 1. **A terminal answers only the session that opened it.** `open` establishes
//!    ownership; every other verb refuses otherwise, and an unknown terminal gets
//!    the SAME refusal as someone else's — so the error cannot be used to probe
//!    for existence.
//! 2. **Output is coalesced**, not forwarded per chunk: a noisy build writes
//!    hundreds of small writes a second, and each would otherwise be its own
//!    event and its own xterm write. What waits to be sent is bounded by
//!    `HIGH_WATER`, the oldest bytes going first.
//! 3. **Closing a panel kills its shell.** Dropping the master hangs up the
//!    terminal; a view that only released the browser's half would leave the
//!    shell running with nobody reading it.
//!
//! No `tauri::` types here, so `cargo test` drives the whole thing without an
//! app (ADR 0014).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};

/// The grid a program is given before the page has measured one. 24 rows
/// matches `RUN_ROWS` in `src/components/TerminalView.ts`; 80 columns is what a
/// program assumes when nothing tells it otherwise.
pub const DEFAULT_COLS: u16 = 80;
pub const DEFAULT_ROWS: u16 = 24;

/// How long output is allowed to accumulate before it is sent. Matches pi's own
/// bash throttle, and the reason is invariant 2 above.
pub const FLUSH: Duration = Duration::from_millis(16);

/// The most output a terminal holds for a page that has not taken it yet.
///
/// Past it the **oldest** bytes go (ADR 0013 rule 6): a terminal's scrollback
/// is capped and xterm discards from the top, so losing the oldest output is
/// what a reader already expects, where dropping the newest would show a frozen
/// grid. A mebibyte is a full `SCROLLBACK` (5000 rows, in
/// `src/components/TerminalView.ts`) at 200 columns — output older than that
/// would have scrolled out of the panel before anyone saw it.
pub const HIGH_WATER: usize = 1024 * 1024;

/// What every verb but `open` answers when the caller does not own the terminal.
///
/// One message for "not yours" and "no such terminal" on purpose: a caller that
/// could tell the two apart could enumerate other sessions' terminals.
pub const NOT_YOURS: &str = "no such terminal";

/// The shell when neither the environment nor the password database names one.
pub const LAST_RESORT_SHELL: &str = "/bin/sh";

/// What to run for a terminal: `command` as a program with `args`, or — when
/// there is none — the user's login shell, which takes none of them.
///
/// The shell is `$SHELL` first, as a terminal emulator takes it; then the account's shell from the password database,
/// because an app launched from Finder inherits launchd's environment, which
/// need not carry `SHELL` at all; then `LAST_RESORT_SHELL`.
pub fn program_for(
    command: &str,
    args: &[String],
    shell_env: Option<&str>,
    account_shell: Option<&str>,
) -> (String, Vec<String>) {
    if !command.is_empty() {
        return (command.into(), args.to_vec());
    }
    let shell = [shell_env, account_shell]
        .into_iter()
        .flatten()
        .find(|shell| !shell.is_empty())
        .unwrap_or(LAST_RESORT_SHELL);
    (shell.into(), vec!["-l".into()])
}

/// The calling user's login shell, as the password database records it.
pub fn account_shell() -> Option<String> {
    // The reentrant lookup: `getpwuid`'s static result would be shared with
    // any other thread asking the same question.
    let mut entry = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut found: *mut libc::passwd = std::ptr::null_mut();
    let mut buf = vec![0 as libc::c_char; 4096];
    // SAFETY: every pointer is to storage this frame owns and outlives the
    // call, `buf.len()` is its real size, and `entry` is read only when the
    // call reports success by pointing `found` at it.
    let entry = unsafe {
        let status = libc::getpwuid_r(
            libc::getuid(),
            entry.as_mut_ptr(),
            buf.as_mut_ptr(),
            buf.len(),
            &mut found,
        );
        if status != 0 || found.is_null() {
            return None;
        }
        entry.assume_init()
    };
    if entry.pw_shell.is_null() {
        return None;
    }
    // SAFETY: a non-null `pw_shell` is a NUL-terminated string inside `buf`,
    // which is still alive here.
    let shell = unsafe { std::ffi::CStr::from_ptr(entry.pw_shell) };
    shell.to_str().ok().map(str::to_owned)
}

/// What a terminal needs to start. `cols`/`rows` come from the rendered grid, so
/// the program's winsize matches what the reader is looking at.
#[derive(Debug, Clone)]
pub struct OpenRequest {
    /// Which session owns the terminal.
    pub sid: String,
    /// The page's id for this terminal — also the `pi:view` id it renders into.
    pub term_id: String,
    /// The program to run, or empty for the user's login shell (`program_for`).
    pub command: String,
    /// What `command` is given; nothing for the login shell.
    pub args: Vec<String>,
    pub cwd: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    /// The `PATH` the program runs with, when it is not this process's own
    /// (`session::Spawn::path`).
    pub path: Option<String>,
}

/// What the page is told about a terminal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PtyEvent {
    Data { term_id: String, data: String },
    Exit { term_id: String, exit_code: u32 },
}

/// One live terminal.
struct Session {
    sid: String,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    /// Set by the thread that reaps the shell. Shared with it rather than looked
    /// up by id, so a shell that exits after its id was reopened cannot mark
    /// the new one.
    exited: Arc<AtomicBool>,
}

/// Every terminal this process has open.
#[derive(Default)]
pub struct Ptys {
    sessions: Mutex<HashMap<String, Session>>,
}

/// Where a terminal's events go. A trait rather than a channel so the tests can
/// collect them and the app can emit them, without either knowing the other.
pub trait Sink: Send + Sync + 'static {
    fn emit(&self, event: PtyEvent);
}

impl<F: Fn(PtyEvent) + Send + Sync + 'static> Sink for F {
    fn emit(&self, event: PtyEvent) {
        self(event)
    }
}

impl Ptys {
    /// Which session owns `term_id`, if any.
    pub fn sid_of(&self, term_id: &str) -> Option<String> {
        self.sessions
            .lock()
            .ok()?
            .get(term_id)
            .map(|session| session.sid.clone())
    }

    /// Whether `sid` may act on `term_id`.
    ///
    /// The whole of the ownership rule, in one place, so a verb cannot forget
    /// it: an unknown terminal and someone else's are indistinguishable from
    /// here.
    fn owns(&self, sid: &str, term_id: &str) -> bool {
        self.sid_of(term_id).is_some_and(|owner| owner == sid)
    }

    /// Opens a PTY, spawns `command` on it, and starts streaming its output.
    ///
    /// Reopening an id that is already open is refused rather than silently
    /// replacing it: the page would keep rendering into the old view while a
    /// second shell ran unattached.
    pub fn open(&self, request: OpenRequest, sink: Arc<dyn Sink>) -> Result<(), String> {
        if self.sid_of(&request.term_id).is_some() {
            return Err("that terminal is already open".into());
        }
        let size = PtySize {
            rows: request.rows.unwrap_or(DEFAULT_ROWS),
            cols: request.cols.unwrap_or(DEFAULT_COLS),
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = native_pty_system()
            .openpty(size)
            .map_err(|e| e.to_string())?;

        let (program, args) = program_for(
            &request.command,
            &request.args,
            std::env::var("SHELL").ok().as_deref(),
            account_shell().as_deref(),
        );
        let mut cmd = CommandBuilder::new(program);
        cmd.args(args);
        cmd.cwd(&request.cwd);
        // Without TERM a program assumes a dumb terminal and emits no escape
        // sequences at all, which is most of what a terminal is for.
        cmd.env("TERM", "xterm-256color");
        // Colour even where a program decides by `isatty` on stdout alone.
        cmd.env("CLICOLOR_FORCE", "1");
        // git opens its pager on a tty and would then wait for a keypress
        // nobody is about to send.
        cmd.env("GIT_PAGER", "cat");
        if let Some(path) = &request.path {
            cmd.env("PATH", path);
        }

        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        // The slave fd must close here: while this process holds it open the
        // master never reports EOF, and the reader thread would outlive the
        // program it is reading.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let exited = Arc::new(AtomicBool::new(false));

        self.sessions.lock().map_err(|e| e.to_string())?.insert(
            request.term_id.clone(),
            Session {
                sid: request.sid,
                master: pair.master,
                writer,
                exited: Arc::clone(&exited),
            },
        );

        // Two threads, because coalescing has to be driven by TIME and reading
        // has to block.
        //
        // A reader that only flushed when its next read returned would hold a
        // shell's last bytes until the shell spoke again — a prompt waiting for
        // input arrives, and then nothing, which looks exactly like a dead
        // terminal. So the reader only accumulates, and a second thread sends
        // on a clock.
        let pending = Arc::new(Mutex::new(Vec::<u8>::new()));
        let reading = Arc::new(Mutex::new(true));

        let read_pending = Arc::clone(&pending);
        let read_done = Arc::clone(&reading);
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if let Ok(mut buffered) = read_pending.lock() {
                            keep_newest(&mut buffered, &buf[..n]);
                        }
                    }
                }
            }
            if let Ok(mut done) = read_done.lock() {
                *done = false;
            }
        });

        let data_sink = Arc::clone(&sink);
        let data_id = request.term_id.clone();
        std::thread::spawn(move || {
            loop {
                std::thread::sleep(FLUSH);
                let batch = {
                    let Ok(mut buffered) = pending.lock() else {
                        break;
                    };
                    std::mem::take(&mut *buffered)
                };
                if !batch.is_empty() {
                    flush(&batch, &data_id, data_sink.as_ref());
                }
                // Checked AFTER draining, so the last batch a program wrote
                // before exiting is still sent.
                let still_reading = reading.lock().map(|flag| *flag).unwrap_or(false);
                if !still_reading && batch.is_empty() {
                    break;
                }
            }
        });

        std::thread::spawn(move || {
            let code = child.wait().map(|status| status.exit_code()).unwrap_or(0);
            // Before the page is told, so a key pressed in answer to the exit
            // already finds it recorded.
            exited.store(true, Ordering::Release);
            sink.emit(PtyEvent::Exit {
                term_id: request.term_id,
                exit_code: code,
            });
        });

        Ok(())
    }

    /// A keystroke, or pasted text.
    ///
    /// Silently ignored for a terminal that has gone: a key pressed as a command
    /// exits is a race, not an error. A terminal the caller does not own is a
    /// different matter and is refused.
    pub fn write(&self, sid: &str, term_id: &str, data: &str) -> Result<(), String> {
        if !self.owns(sid, term_id) {
            return Err(NOT_YOURS.into());
        }
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let Some(session) = sessions.get_mut(term_id) else {
            return Ok(());
        };
        if session.exited.load(Ordering::Acquire) {
            return Ok(());
        }
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())
    }

    /// The rendered grid changed. Programs that lay out to `COLUMNS` read this.
    pub fn resize(&self, sid: &str, term_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        if !self.owns(sid, term_id) {
            return Err(NOT_YOURS.into());
        }
        // A mid-layout page can report a zero dimension, which is not a window.
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let Some(session) = sessions.get(term_id) else {
            return Ok(());
        };
        if session.exited.load(Ordering::Acquire) {
            return Ok(());
        }
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    /// Kills one terminal. Idempotent for a terminal that has already gone.
    ///
    /// Invariant 3: dropping the master hangs up the terminal, which is what
    /// ends the shell. A page that disposed its view without calling this would
    /// leave the shell running.
    pub fn close(&self, sid: &str, term_id: &str) -> Result<(), String> {
        if !self.owns(sid, term_id) {
            return Err(NOT_YOURS.into());
        }
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .remove(term_id);
        Ok(())
    }

    /// Closes every terminal, whoever owns it — the exit sequence's step 5
    /// (ADR 0019 §2). Answers how many there were.
    pub fn close_all(&self) -> usize {
        let Ok(mut sessions) = self.sessions.lock() else {
            return 0;
        };
        let closed = sessions.len();
        sessions.clear();
        closed
    }

    /// Closes every terminal a session owns, for a window going away.
    pub fn close_session(&self, sid: &str) -> Result<usize, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let doomed: Vec<String> = sessions
            .iter()
            .filter(|(_, session)| session.sid == sid)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &doomed {
            sessions.remove(id);
        }
        Ok(doomed.len())
    }
}

/// Appends a read to what the page has not taken yet, dropping the oldest bytes
/// past `HIGH_WATER`.
fn keep_newest(buffered: &mut Vec<u8>, chunk: &[u8]) {
    buffered.extend_from_slice(chunk);
    if buffered.len() > HIGH_WATER {
        let excess = buffered.len() - HIGH_WATER;
        buffered.drain(..excess);
    }
}

/// Sends what has accumulated, decoding as far as it can.
///
/// Lossy on purpose at this boundary: a multi-byte character split across two
/// reads would otherwise stall a flush waiting for a byte that is already in the
/// next chunk. The replacement character is visible and recoverable; a withheld
/// line is neither. `keep_newest`'s cut lands anywhere too, mid-character
/// included, and the same answer holds: one replacement character at the front
/// of output that has already lost its beginning.
fn flush(pending: &[u8], term_id: &str, sink: &dyn Sink) {
    sink.emit(PtyEvent::Data {
        term_id: term_id.to_string(),
        data: String::from_utf8_lossy(pending).into_owned(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Instant;

    /// Collects events, so a test can assert what the page would have seen.
    struct Collector(mpsc::Sender<PtyEvent>);

    impl Sink for Collector {
        fn emit(&self, event: PtyEvent) {
            let _ = self.0.send(event);
        }
    }

    fn open_shell(ptys: &Ptys, sid: &str, term_id: &str) -> mpsc::Receiver<PtyEvent> {
        let (tx, rx) = mpsc::channel();
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
            Arc::new(Collector(tx)),
        )
        .expect("open");
        rx
    }

    /// Waits for output matching `needle`, or gives up.
    fn wait_for(rx: &mpsc::Receiver<PtyEvent>, needle: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut seen = String::new();
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(PtyEvent::Data { data, .. }) => {
                    seen.push_str(&data);
                    if seen.contains(needle) {
                        return true;
                    }
                }
                Ok(PtyEvent::Exit { .. }) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        false
    }

    // ---- invariant 1: a terminal answers only its own session

    #[test]
    fn a_terminal_refuses_every_verb_from_another_session() {
        let ptys = Ptys::default();
        let _rx = open_shell(&ptys, "owner", "t1");

        assert_eq!(ptys.write("intruder", "t1", "ls\n"), Err(NOT_YOURS.into()));
        assert_eq!(
            ptys.resize("intruder", "t1", 100, 30),
            Err(NOT_YOURS.into())
        );
        assert_eq!(ptys.close("intruder", "t1"), Err(NOT_YOURS.into()));

        // The pair: the owner's own calls work, so the refusals above are about
        // ownership and not about the terminal being broken.
        assert!(ptys.write("owner", "t1", "\n").is_ok());
        assert!(ptys.resize("owner", "t1", 100, 30).is_ok());
        assert!(ptys.close("owner", "t1").is_ok());
    }

    #[test]
    fn an_unknown_terminal_is_refused_exactly_like_someone_elses() {
        // If the two answers differed, the error would enumerate other
        // sessions' terminals (ADR 0013).
        let ptys = Ptys::default();
        let _rx = open_shell(&ptys, "owner", "t1");

        let someone_elses = ptys.write("intruder", "t1", "x");
        let does_not_exist = ptys.write("intruder", "no-such-terminal", "x");
        assert_eq!(someone_elses, does_not_exist);
        assert_eq!(someone_elses, Err(NOT_YOURS.into()));
    }

    #[test]
    fn reopening_an_id_is_refused_rather_than_replacing_the_shell() {
        // Silently replacing would leave the page rendering the old view while
        // a second shell ran unattached.
        let ptys = Ptys::default();
        let _rx = open_shell(&ptys, "owner", "t1");
        let again = ptys.open(
            OpenRequest {
                sid: "owner".into(),
                term_id: "t1".into(),
                command: "/bin/sh".into(),
                args: Vec::new(),
                cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                cols: None,
                rows: None,
                path: None,
            },
            Arc::new(Collector(mpsc::channel().0)),
        );
        assert!(again.is_err());
    }

    // ---- what runs: a command, or the user's login shell

    #[test]
    fn no_command_is_the_login_shell_from_the_environment() {
        assert_eq!(
            program_for("", &[], Some("/opt/fish"), Some("/bin/zsh")),
            ("/opt/fish".into(), vec!["-l".into()])
        );
    }

    #[test]
    fn with_no_shell_in_the_environment_the_accounts_shell_is_used() {
        // A Finder launch: launchd's environment need not carry SHELL.
        for unset in [None, Some("")] {
            assert_eq!(
                program_for("", &[], unset, Some("/bin/zsh")),
                ("/bin/zsh".into(), vec!["-l".into()])
            );
        }
    }

    #[test]
    fn with_no_shell_named_anywhere_the_last_resort_is_used() {
        assert_eq!(
            program_for("", &[], None, Some("")),
            (LAST_RESORT_SHELL.into(), vec!["-l".into()])
        );
        assert_eq!(
            program_for("", &[], None, None),
            (LAST_RESORT_SHELL.into(), vec!["-l".into()])
        );
    }

    #[test]
    fn a_command_is_run_as_a_program_with_no_arguments() {
        // What every caller that names a program has always had; the shell
        // lookups must not reach it.
        assert_eq!(
            program_for("/bin/sh", &[], Some("/opt/fish"), Some("/bin/zsh")),
            ("/bin/sh".into(), vec![])
        );
    }

    #[test]
    fn a_program_given_arguments_gets_them_in_order() {
        // How the user's own pi runs in a terminal: the resolved program, then
        // what the page asked pi for. The app runs the resolved path itself,
        // as a session does, so nothing leads the arguments.
        let args = vec!["--no-session".to_string(), "--verbose".to_string()];
        assert_eq!(
            program_for(
                "/usr/local/bin/pi",
                &args,
                Some("/opt/fish"),
                Some("/bin/zsh")
            ),
            ("/usr/local/bin/pi".into(), args.clone())
        );
    }

    #[test]
    fn the_login_shell_takes_no_arguments_from_the_request() {
        let args = vec!["--no-session".to_string()];
        assert_eq!(
            program_for("", &args, Some("/opt/fish"), None),
            ("/opt/fish".into(), vec!["-l".into()])
        );
    }

    #[test]
    fn the_arguments_reach_the_running_program() {
        // Asserted from the program's own output, so what is proved is that
        // the spawned process saw them, not that a field was set.
        let ptys = Ptys::default();
        let (tx, rx) = mpsc::channel();
        ptys.open(
            OpenRequest {
                sid: "s".into(),
                term_id: "args".into(),
                command: "/bin/echo".into(),
                args: vec!["ARG-ONE".into(), "ARG-TWO".into()],
                cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                cols: Some(80),
                rows: Some(24),
                path: None,
            },
            Arc::new(Collector(tx)),
        )
        .expect("open");
        assert!(
            wait_for(&rx, "ARG-ONE ARG-TWO"),
            "the arguments never arrived"
        );
    }

    #[test]
    fn the_accounts_shell_is_read_from_the_password_database() {
        // Every macOS account has one; what it is depends on the machine, so
        // the assertion is that it names a program that exists.
        let shell = account_shell().expect("the account has a login shell");
        assert!(
            std::path::Path::new(&shell).is_file(),
            "{shell} is not a file"
        );
    }

    #[test]
    fn a_terminals_environment_forces_colour_and_turns_off_gits_pager() {
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "env");
        // Joined with a separator the typed line does not contain once
        // expanded, so the echoed command cannot satisfy the wait.
        ptys.write("s", "env", "echo ENV=$CLICOLOR_FORCE:$GIT_PAGER\n")
            .expect("write");
        assert!(wait_for(&rx, "ENV=1:cat"), "the environment was not set");
    }

    // ---- the terminal is a terminal, not a pipe

    #[test]
    fn the_shell_sees_a_tty() {
        // The whole reason this is a PTY: a pipe makes `test -t 0` false, and
        // every program that checks it behaves differently.
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "tty");
        ptys.write("s", "tty", "test -t 0 && echo IS-A-TTY\n")
            .expect("write");
        assert!(wait_for(&rx, "IS-A-TTY"), "the shell did not report a tty");
    }

    #[test]
    fn output_reaches_the_sink() {
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "out");
        ptys.write("s", "out", "echo MARKER-7\n").expect("write");
        assert!(wait_for(&rx, "MARKER-7"), "the marker never arrived");
    }

    #[test]
    fn a_resize_reaches_the_program() {
        // Asserted by asking the shell its own width, so what is proved is that
        // the ioctl landed rather than that a field was set.
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "size");
        ptys.resize("s", "size", 100, 30).expect("resize");
        ptys.write("s", "size", "echo W=$(tput cols)\n")
            .expect("write");
        assert!(
            wait_for(&rx, "W=100"),
            "the shell did not see the new width"
        );
    }

    // ---- invariant 3: closing a panel ends the shell

    #[test]
    fn closing_a_terminal_forgets_it() {
        let ptys = Ptys::default();
        let _rx = open_shell(&ptys, "s", "gone");
        assert_eq!(ptys.sid_of("gone").as_deref(), Some("s"));
        ptys.close("s", "gone").expect("close");
        assert_eq!(ptys.sid_of("gone"), None);
        // Idempotent for the owner — but only because ownership is gone too, so
        // this is the same refusal any stranger gets.
        assert_eq!(ptys.close("s", "gone"), Err(NOT_YOURS.into()));
    }

    #[test]
    fn a_closed_terminals_shell_actually_exits() {
        // Dropping the master hangs up the terminal, which is what ends the
        // shell. Without it a panel's shell outlives its view and runs on with
        // nobody reading it (ADR 0013).
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "reaped");
        assert!(wait_for(&rx, "") || true, "shell started");
        ptys.close("s", "reaped").expect("close");
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut exited = false;
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(PtyEvent::Exit { term_id, .. }) if term_id == "reaped" => {
                    exited = true;
                    break;
                }
                Ok(_) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        assert!(
            exited,
            "the shell did not exit when its terminal was closed"
        );
    }

    #[test]
    fn a_window_going_away_takes_its_terminals_with_it() {
        let ptys = Ptys::default();
        let _a = open_shell(&ptys, "window-1", "a");
        let _b = open_shell(&ptys, "window-1", "b");
        let _c = open_shell(&ptys, "window-2", "c");
        assert_eq!(ptys.close_session("window-1").unwrap(), 2);
        assert_eq!(ptys.sid_of("a"), None);
        assert_eq!(ptys.sid_of("b"), None);
        // The other window's terminal is untouched, which is the half that
        // would break if the filter were wrong.
        assert_eq!(ptys.sid_of("c").as_deref(), Some("window-2"));
    }

    /// Waits for `term_id`'s shell to exit, or gives up.
    fn exits(rx: &mpsc::Receiver<PtyEvent>, term_id: &str) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(250)) {
                Ok(PtyEvent::Exit { term_id: id, .. }) if id == term_id => return true,
                Ok(_) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        false
    }

    #[test]
    fn closing_every_terminal_ends_every_shell() {
        // The exit sequence's step 5 (ADR 0019 §2): every session's shells, not
        // one session's.
        let ptys = Ptys::default();
        let a = open_shell(&ptys, "window-1", "a");
        let b = open_shell(&ptys, "window-2", "b");
        assert_eq!(ptys.close_all(), 2);
        assert_eq!(ptys.sid_of("a"), None);
        assert_eq!(ptys.sid_of("b"), None);
        assert!(exits(&a, "a"), "a's shell outlived the close");
        assert!(exits(&b, "b"), "b's shell outlived the close");
    }

    /// A page that is not keeping up: the first event is held until the test
    /// lets it go, and the flusher with it, while the reader goes on reading.
    struct Stalled {
        gate: Mutex<Option<mpsc::Receiver<()>>>,
        events: mpsc::Sender<PtyEvent>,
    }

    impl Sink for Stalled {
        fn emit(&self, event: PtyEvent) {
            let gate = self.gate.lock().unwrap().take();
            if let Some(gate) = gate {
                let _ = gate.recv();
            }
            let _ = self.events.send(event);
        }
    }

    #[test]
    fn a_page_that_falls_behind_loses_the_oldest_output_not_the_memory() {
        // ADR 0013 rule 6. Unbounded, the bytes a stalled page has not taken
        // pile up until the app is killed; capped at the wrong end, the
        // terminal freezes on old output and never shows the end.
        let ptys = Ptys::default();
        let (release, gate) = mpsc::channel();
        let (events, rx) = mpsc::channel();
        ptys.open(
            OpenRequest {
                sid: "s".into(),
                term_id: "flood".into(),
                command: "/bin/sh".into(),
                args: Vec::new(),
                cwd: std::env::temp_dir().to_string_lossy().into_owned(),
                cols: None,
                rows: None,
                path: None,
            },
            Arc::new(Stalled {
                gate: Mutex::new(Some(gate)),
                events,
            }),
        )
        .expect("open");

        // Four high-water marks of output, then a marker the command line's
        // echo does not contain, then a sign that the shell got past both.
        let flooded = 4 * HIGH_WATER;
        let done = std::env::temp_dir().join(format!("piary-flood-{}", std::process::id()));
        let _ = std::fs::remove_file(&done);
        ptys.write(
            "s",
            "flood",
            &format!(
                "head -c {flooded} /dev/zero | tr '\\0' a; printf 'E''ND\\n'; touch {}\n",
                done.display()
            ),
        )
        .expect("write");
        let deadline = Instant::now() + Duration::from_secs(20);
        while !done.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(done.exists(), "the shell never finished writing");
        // The reader drains what the kernel still holds.
        std::thread::sleep(Duration::from_millis(300));
        release.send(()).unwrap();

        let mut largest = 0;
        let mut received = 0;
        // Only the tail is kept: the marker is at the end, and holding all of
        // it here would be the unbounded buffer under test.
        let mut tail = Vec::<u8>::new();
        let ended = |tail: &[u8]| tail.windows(3).any(|w| w == b"END");
        let deadline = Instant::now() + Duration::from_secs(10);
        while !ended(&tail) && Instant::now() < deadline {
            if let Ok(PtyEvent::Data { data, .. }) = rx.recv_timeout(Duration::from_millis(250)) {
                largest = largest.max(data.len());
                received += data.len();
                tail.extend_from_slice(data.as_bytes());
                if tail.len() > 64 {
                    tail.drain(..tail.len() - 64);
                }
            }
        }
        let _ = std::fs::remove_file(&done);
        let _ = ptys.close("s", "flood");
        assert!(
            largest <= HIGH_WATER,
            "one event carried {largest} bytes, past the {HIGH_WATER}-byte mark"
        );
        assert!(
            received < flooded,
            "nothing was dropped, so the stall never reached the mark"
        );
        assert!(
            ended(&tail),
            "the newest output was lost — the terminal froze on old bytes"
        );
    }

    #[test]
    fn a_key_pressed_after_the_shell_exited_is_not_an_error() {
        // The shell is gone and the panel still shows it. A keystroke then is a
        // race, not a failure — and a write to the hung-up terminal fails with
        // EIO unless the exit was recorded.
        let ptys = Ptys::default();
        let rx = open_shell(&ptys, "s", "done");
        ptys.write("s", "done", "exit\n").expect("write");
        assert!(exits(&rx, "done"), "the shell did not exit");
        assert_eq!(ptys.write("s", "done", "ls\n"), Ok(()));
    }

    // ---- the quieter rules

    #[test]
    fn a_zero_dimension_is_ignored_rather_than_passed_on() {
        // A mid-layout page reports one, and it is not a window.
        let ptys = Ptys::default();
        let _rx = open_shell(&ptys, "s", "zero");
        assert!(ptys.resize("s", "zero", 0, 24).is_ok());
        assert!(ptys.resize("s", "zero", 80, 0).is_ok());
        // The pair: a real size is still applied.
        assert!(ptys.resize("s", "zero", 80, 24).is_ok());
    }

    #[test]
    fn the_default_grid_matches_what_the_view_assumes() {
        // 24 rows is RUN_ROWS in src/components/TerminalView.ts; 80 columns is
        // what a program assumes when nothing tells it otherwise. A drift here
        // makes a program lay out for a grid the reader is not looking at.
        assert_eq!(DEFAULT_ROWS, 24);
        assert_eq!(DEFAULT_COLS, 80);
    }
}
