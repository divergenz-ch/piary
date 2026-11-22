//! The capture sidecar, as the Rust side holds it.
//!
//! Screen and system audio come from ScreenCaptureKit and camera/microphone
//! from AVFoundation, in a Swift helper rather than through the webview
//! (ADR 0015). This module spawns it, writes commands to its stdin, and relays
//! its JSON lines outward.
//!
//! Rust's job here is relay and lifetime, not protocol: the lines are passed
//! through as strings, because every field in them belongs to the page and
//! parsing twice would mean two places to update when the helper grows a reply.
//! A line is checked to be JSON and no longer than `LINE_CAP` before it goes,
//! and dropped otherwise (ADR 0013 rule 6).
//!
//! No `tauri::` types (ADR 0014).

use std::io::{BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::diag;
use crate::lines::{self, Line};

/// The helper's filename inside the bundle. `externalBin` appends the target
/// triple, which Tauri strips again when it copies the binary in.
pub const HELPER: &str = "piary-capture";

/// How long a stopped helper is given to end its capture and exit before it is
/// killed. Long enough for ScreenCaptureKit to tear a stream down; a helper
/// that has not gone in this long is wedged.
pub const STOP_GRACE: Duration = Duration::from_secs(1);

/// How often a stop looks to see whether the helper has gone.
const STOP_POLL: Duration = Duration::from_millis(50);

/// The longest line the helper is trusted to write. Its largest reply is
/// `sources`, a few hundred bytes per window, so a mebibyte is thousands of
/// windows; a line past it is a runaway, not a reply.
pub const LINE_CAP: usize = 1024 * 1024;

/// Where a capture's lines go.
pub trait Sink: Send + Sync + 'static {
    /// One JSON line from the helper's stdout.
    fn line(&self, line: String);
    /// The helper went away. A capture grant held by a process nobody is
    /// reading is the failure this exists to announce.
    fn ended(&self, code: Option<i32>);
}

impl Capture {
    /// Resolves the helper beside the running executable.
    ///
    /// In a bundle that is `Contents/MacOS/`, where Tauri puts an
    /// `externalBin`; in a checkout it is wherever cargo built, so a dev build
    /// falls back to `sidecar/bin/` relative to the manifest.
    pub fn helper_path(exe_dir: Option<PathBuf>, manifest_dir: &str) -> PathBuf {
        if let Some(dir) = exe_dir {
            let bundled = dir.join(HELPER);
            if bundled.is_file() {
                return bundled;
            }
        }
        PathBuf::from(manifest_dir)
            .join("..")
            .join("sidecar")
            .join("bin")
            .join(HELPER)
    }
}

/// The running helper, if any.
#[derive(Default)]
pub struct Capture {
    inner: Arc<Mutex<Option<Running>>>,
    starts: AtomicU64,
}

struct Running {
    child: Child,
    stdin: ChildStdin,
    /// Which start this is. The reader of an earlier helper must not free a
    /// later one's slot.
    generation: u64,
}

impl Capture {
    /// Starts the helper and streams its replies to `sink`.
    ///
    /// One at a time: a second helper would compete for the same grant, and the
    /// page has no way to tell two streams of events apart.
    pub fn start(&self, path: &PathBuf, sink: Arc<dyn Sink>) -> Result<(), String> {
        let mut held = self.inner.lock().map_err(|e| e.to_string())?;
        if held.is_some() {
            return Err("the capture helper is already running".into());
        }
        let mut child = Command::new(path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // Inherited on purpose: the helper's diagnostics are the operator's
            // only view of why a capture failed, and swallowing them would make
            // a permission refusal invisible.
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("starting {}: {e}", path.display()))?;

        let stdout = child.stdout.take().ok_or("the helper has no stdout")?;
        let stdin = child.stdin.take().ok_or("the helper has no stdin")?;
        let generation = self.starts.fetch_add(1, Ordering::Relaxed);

        // An OS thread rather than a task: reading a pipe blocks.
        //
        // When stdout closes the helper has gone — on its own if it crashed or
        // had its grant revoked, or because `stop` asked it to. Either way the
        // page is told, because a capture surface that silently stops producing
        // is indistinguishable from one that is still recording. A helper
        // that went on its own is reaped here and its slot freed (ADR 0019 §5),
        // so a new capture can start; one `stop` took is reaped by `stop`.
        let reader_sink = Arc::clone(&sink);
        let reader_inner = Arc::clone(&self.inner);
        std::thread::spawn(move || {
            for line in lines::bounded(BufReader::new(stdout), LINE_CAP) {
                match line {
                    Ok(Line::Whole(line)) if line.trim_ascii().is_empty() => continue,
                    Ok(Line::Whole(line)) => match json_text(line) {
                        Some(line) => reader_sink.line(line),
                        None => diag::note(
                            "piary: dropped a line from the capture helper that is not JSON",
                        ),
                    },
                    Ok(Line::TooLong(len)) => diag::note(&format!(
                        "piary: dropped a {len}-byte line from the capture helper, past {LINE_CAP}"
                    )),
                    Err(_) => break,
                }
            }
            let code = take(&reader_inner, generation).and_then(end);
            reader_sink.ended(code);
        });

        *held = Some(Running {
            child,
            stdin,
            generation,
        });
        Ok(())
    }

    /// Sends one command line to the helper.
    pub fn send(&self, line: &str) -> Result<(), String> {
        let mut held = self.inner.lock().map_err(|e| e.to_string())?;
        let running = held.as_mut().ok_or("the capture helper is not running")?;
        writeln!(running.stdin, "{line}").map_err(|e| format!("writing to the helper: {e}"))?;
        running.stdin.flush().map_err(|e| e.to_string())
    }

    /// Whether a helper is running.
    pub fn is_running(&self) -> bool {
        self.inner
            .lock()
            .map(|held| held.is_some())
            .unwrap_or(false)
    }

    /// Stops the helper.
    ///
    /// Closing stdin is the polite route — the helper stops its capture and
    /// exits — and the kill is the guarantee. Without the kill a wedged helper
    /// keeps a Screen Recording grant alive with nobody reading it, which is the
    /// same shape of leak a terminal's shell outliving its panel would be
    /// (ADR 0013).
    ///
    /// The helper is taken out under the lock and waited for after it is
    /// released, so asking whether a capture is running never waits on a stop.
    pub fn stop(&self) -> Result<Option<i32>, String> {
        let taken = self.inner.lock().map_err(|e| e.to_string())?.take();
        Ok(taken.and_then(end))
    }
}

/// The line as text, if it is JSON — checked, not read: the page reads it.
///
/// Anything else is not a capture event, and a Swift panic's backtrace is the
/// likely case; dropping it keeps one bad line from ending the relay, the same
/// rule `session.rs` applies to pi (ADR 0019 §6).
fn json_text(line: Vec<u8>) -> Option<String> {
    serde_json::from_slice::<serde::de::IgnoredAny>(&line).ok()?;
    String::from_utf8(line).ok()
}

/// Takes the helper out, if it is still the start the caller knew.
fn take(inner: &Mutex<Option<Running>>, generation: u64) -> Option<Running> {
    let mut held = inner.lock().ok()?;
    if held.as_ref()?.generation != generation {
        return None;
    }
    held.take()
}

/// Asks the helper to quit, gives it `STOP_GRACE` to, then kills it; answers
/// its exit code. Called holding no lock.
fn end(running: Running) -> Option<i32> {
    let Running {
        mut child,
        mut stdin,
        ..
    } = running;
    let _ = stdin.write_all(b"{\"op\":\"quit\"}\n");
    let _ = stdin.flush();
    drop(stdin);
    let deadline = Instant::now() + STOP_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.code(),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(STOP_POLL),
            Ok(None) | Err(_) => break,
        }
    }
    let _ = child.kill();
    child.wait().ok().and_then(|status| status.code())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    struct Collector(mpsc::Sender<String>);

    impl Sink for Collector {
        fn line(&self, line: String) {
            let _ = self.0.send(line);
        }
        fn ended(&self, _code: Option<i32>) {}
    }

    /// The helper this checkout built, or `None` when it has not been built.
    ///
    /// Skipped rather than failed when absent: `swiftc` is a macOS toolchain and
    /// the Rust suite must stay runnable without having run the sidecar build.
    fn built_helper() -> Option<PathBuf> {
        let path = Capture::helper_path(None, env!("CARGO_MANIFEST_DIR"));
        path.is_file().then_some(path)
    }

    #[test]
    fn the_bundled_helper_wins_over_the_checkout() {
        // In a bundle the helper sits beside the executable; a dev build has to
        // fall back to the checkout, and getting this the wrong way round means
        // a release silently runs a developer's stale binary.
        let dir = std::env::temp_dir().join(format!("piary-helper-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bundled = dir.join(HELPER);
        std::fs::write(&bundled, b"#!/bin/sh\n").unwrap();
        assert_eq!(Capture::helper_path(Some(dir.clone()), "/nowhere"), bundled);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn with_no_bundled_helper_the_checkout_is_used() {
        let path = Capture::helper_path(None, "/repo/src-tauri");
        assert!(path.ends_with("sidecar/bin/piary-capture"), "{path:?}");
    }

    #[test]
    fn sending_without_a_helper_is_an_error_rather_than_a_silent_no_op() {
        let capture = Capture::default();
        assert!(capture.send("{\"op\":\"status\"}").is_err());
        assert!(!capture.is_running());
    }

    /// Says when the helper ended, and with what code.
    struct Ends(mpsc::Sender<Option<i32>>);

    impl Sink for Ends {
        fn line(&self, _line: String) {}
        fn ended(&self, code: Option<i32>) {
            let _ = self.0.send(code);
        }
    }

    /// A stand-in helper: a real script that ignores its stdin closing, as a
    /// wedged helper would, so only the kill ends it.
    fn wedged_helper() -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("piary-wedged-{}", std::process::id()));
        std::fs::write(&path, b"#!/bin/sh\nexec sleep 600\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[test]
    fn a_helper_that_exits_on_its_own_is_reaped_and_another_can_start() {
        // ADR 0019 §5: whatever observes the exit frees the slot. Kept, a dead
        // helper's entry answered "running" for ever, and every new capture was
        // refused as a second helper.
        let capture = Capture::default();
        let (tx, rx) = mpsc::channel();
        capture
            .start(&PathBuf::from("/usr/bin/false"), Arc::new(Ends(tx)))
            .expect("start");
        let code = rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("the page is told the helper ended");
        assert_eq!(code, Some(1), "the exit was reaped, so its code is known");
        assert!(!capture.is_running());

        // `cat` reads its stdin until it closes, so it is a helper that stays.
        capture
            .start(
                &PathBuf::from("/bin/cat"),
                Arc::new(Collector(mpsc::channel().0)),
            )
            .expect("a new capture starts a new helper");
        assert!(capture.is_running());
        let _ = capture.stop();
    }

    /// A stand-in helper that writes `body` to its stdout and exits.
    fn scripted_helper(name: &str, body: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("piary-{name}-{}", std::process::id()));
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[test]
    fn a_line_that_is_not_json_or_is_too_long_is_dropped_and_the_relay_goes_on() {
        // ADR 0019 §6. A Swift panic writes a multi-line backtrace, and a
        // newline-free burst would be held whole until it ended; neither is a
        // capture event, and neither may stop the reply after it arriving.
        let path = scripted_helper(
            "garbled",
            &format!(
                "echo 'Fatal error: Unexpectedly found nil'\n\
                 printf '{{\"event\":\"'; head -c {} /dev/zero | tr '\\0' a; echo '\"}}'\n\
                 echo '{{\"event\":\"ready\"}}'",
                LINE_CAP + 1
            ),
        );
        let capture = Capture::default();
        let (tx, rx) = mpsc::channel();
        capture
            .start(&path, Arc::new(Collector(tx)))
            .expect("start");
        let relayed: Vec<String> = rx
            .iter()
            .map(|line| line.chars().take(80).collect())
            .collect();
        let _ = std::fs::remove_file(&path);
        assert_eq!(relayed, vec!["{\"event\":\"ready\"}".to_string()]);
    }

    #[test]
    fn stopping_a_wedged_helper_does_not_hold_the_capture_while_it_waits() {
        // The stop waits up to its grace for a helper that will not go. Held
        // across that wait, the lock would stall the page's every capture call
        // — on the main thread — for as long.
        let path = wedged_helper();
        let capture = Arc::new(Capture::default());
        capture
            .start(&path, Arc::new(Collector(mpsc::channel().0)))
            .expect("start");
        let stopping = {
            let capture = Arc::clone(&capture);
            std::thread::spawn(move || capture.stop())
        };
        std::thread::sleep(std::time::Duration::from_millis(100));
        let asked = std::time::Instant::now();
        assert!(
            !capture.is_running(),
            "the stopping helper is no longer the capture"
        );
        assert!(
            asked.elapsed() < std::time::Duration::from_millis(300),
            "asking waited {:?} on the stop",
            asked.elapsed()
        );
        assert!(stopping.join().unwrap().is_ok());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_start_made_during_a_stop_keeps_its_own_helper() {
        // `capture_stop` runs off the main thread, so a `capture_start` can land
        // while the stop waits out its grace. It finds the slot empty and starts
        // a fresh helper; the old helper's reader, reaching EOF when the stop
        // kills it, must leave that fresh helper's slot alone.
        // A path of its own: `wedged_helper`'s is shared, and the other test
        // using it removes it while this one may still be starting.
        let path = scripted_helper("wedged-during-stop", "exec sleep 600");
        let capture = Arc::new(Capture::default());
        capture
            .start(&path, Arc::new(Collector(mpsc::channel().0)))
            .expect("first");
        let stopping = {
            let capture = Arc::clone(&capture);
            std::thread::spawn(move || capture.stop())
        };
        std::thread::sleep(std::time::Duration::from_millis(100));
        capture
            .start(
                &PathBuf::from("/bin/cat"),
                Arc::new(Collector(mpsc::channel().0)),
            )
            .expect("a start during the stop");
        assert!(stopping.join().unwrap().is_ok());
        // The old reader has seen its EOF once the stop has reaped its helper;
        // give it the moment it needs to act on it.
        std::thread::sleep(std::time::Duration::from_millis(200));
        let _ = std::fs::remove_file(&path);

        assert!(
            capture.is_running(),
            "the old helper's exit freed the new one's slot"
        );
        let _ = capture.stop();
    }

    #[test]
    fn stopping_nothing_is_not_an_error() {
        // The ordinary case on the way out.
        let capture = Capture::default();
        assert_eq!(capture.stop().unwrap(), None);
    }

    #[test]
    fn the_helper_answers_a_status_request() {
        let Some(path) = built_helper() else {
            eprintln!("skipped: run `pnpm sidecar:build` to build the capture helper");
            return;
        };
        let capture = Capture::default();
        let (tx, rx) = mpsc::channel();
        capture
            .start(&path, Arc::new(Collector(tx)))
            .expect("start");
        assert!(capture.is_running());

        // `ready` first, then the status reply. What is asserted is the round
        // trip — a line in, a line out — not what this machine permits, which
        // differs per machine and per grant.
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let mut saw_ready = false;
        let mut saw_status = false;
        capture.send("{\"op\":\"status\"}").expect("send");
        while std::time::Instant::now() < deadline && !saw_status {
            match rx.recv_timeout(std::time::Duration::from_millis(250)) {
                Ok(line) if line.contains("\"ready\"") => saw_ready = true,
                Ok(line) if line.contains("\"status\"") => saw_status = true,
                Ok(_) => continue,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        let _ = capture.stop();
        assert!(saw_ready, "the helper never said it was ready");
        assert!(saw_status, "the helper never answered the status request");
    }

    #[test]
    fn a_second_helper_is_refused() {
        let Some(path) = built_helper() else {
            eprintln!("skipped: run `pnpm sidecar:build` to build the capture helper");
            return;
        };
        let capture = Capture::default();
        capture
            .start(&path, Arc::new(Collector(mpsc::channel().0)))
            .expect("start");
        // Two helpers would compete for the same grant and the page could not
        // tell their events apart.
        assert!(capture
            .start(&path, Arc::new(Collector(mpsc::channel().0)))
            .is_err());
        let _ = capture.stop();
    }

    #[test]
    fn stopping_the_helper_ends_its_process() {
        let Some(path) = built_helper() else {
            eprintln!("skipped: run `pnpm sidecar:build` to build the capture helper");
            return;
        };
        let capture = Capture::default();
        capture
            .start(&path, Arc::new(Collector(mpsc::channel().0)))
            .expect("start");
        let code = capture.stop().expect("stop");
        assert!(code.is_some(), "the helper did not exit");
        assert!(!capture.is_running());
        // The pair: a second stop is the ordinary no-op, so the state really was
        // cleared rather than the first stop having lied.
        assert_eq!(capture.stop().unwrap(), None);
    }
}
