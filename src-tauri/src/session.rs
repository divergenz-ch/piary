//! One resident `pi --mode rpc` per session, and the relay between it and the
//! page.
//!
//! **A relay, not a model.** The page sends `{type, …}`; this module adds the
//! correlation id, writes the line, matches the reply, and passes `data`
//! straight through. It knows pi's envelope and, by name, only the one command
//! pi does not answer (`NO_REPLY`) — `commands.rs` names `prompt` as well — and
//! none of pi's payload shapes, so a field added upstream is not a change here.
//! That is a relay's rule, the one the capture sidecar follows too (ADR 0015);
//! the page's document core translates pi's messages and so names their types
//! (ADR 0020).
//!
//! The protocol, verified against the binary rather than taken from a type:
//!
//! ```text
//! → {"type":"get_state","id":"req_1"}
//! ← {"id":"req_1","type":"response","command":"get_state","success":true,"data":{…}}
//! ← {"type":"agent_message_delta", …}        an event: same stream, no id
//! ```
//!
//! A line with `type == "response"` AND an `id` resolves that request; anything
//! else is an event for the page. ADR 0002 is about pi's JSONL **transcript**,
//! which this module never reads — speaking the RPC wire is the supported
//! interface. A rebuild replaces the transcript whole, and that is
//! `transcript.rs`, which keeps the header line and parses nothing (ADR 0021).
//!
//! No `tauri::` types (ADR 0014).

use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::os::unix::process::CommandExt;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};

use crate::diag;
use crate::lines::{self, Line};

/// How long a request waits for its reply before giving up.
///
/// Matches the 30s the upstream client uses. A prompt's own work does not block
/// this — pi answers `prompt` immediately with a disposition and streams the
/// turn as events.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// The one command pi answers by doing rather than replying.
///
/// rpc-mode resolves an `extension_ui_response` internally and emits no
/// correlated response, so a caller that waited for one would block for the
/// full timeout on every answered prompt. Written and forgotten instead.
pub const NO_REPLY: &str = "extension_ui_response";

/// Tells Piary's `cell` tool that a page answers its verdict request
/// (`pi-extension/cell.ts`).
pub const VERDICTS_ENV: &str = "PIARY_VERDICTS";

/// Tells Piary's `view` and `cell` tools how an answer to look at is drawn, which
/// picks the guidance they register with (`pi-extension/draw-mode.ts`, ADR 0044).
pub const DRAW_ENV: &str = "PIARY_DRAW";

/// The draw mode a value of `PIARY_DRAW` names: `free` for `free`, and `a2ui`
/// for anything else, unset included.
pub fn draw_mode(env: Option<&str>) -> &'static str {
    match env {
        Some("free") => "free",
        _ => "a2ui",
    }
}

/// The longest line pi is trusted to write.
///
/// pi's longest lines carry images as base64 — an attachment, or a screenshot
/// a tool read — each at most 4.5 MB (pi resizes to that), and an `agent_end`
/// carries a whole turn's messages. 64 MiB is fourteen such images in one
/// line. A line past it is dropped and noted; if it was the turn's ending, the
/// page's silence probe ends the turn (ADR 0019 §4).
pub const LINE_CAP: usize = 64 * 1024 * 1024;

/// How long a stopped pi is given to go on its own before its group is killed.
///
/// Closing stdin asks pi to end its tools and exit, which is the path that
/// leaves least behind (ADR 0019 §3); a pi that has not gone in this long is
/// not going, and a quit must not wait on it.
pub const STOP_GRACE: Duration = Duration::from_secs(1);

/// How often a stop looks to see whether pi has gone.
const STOP_POLL: Duration = Duration::from_millis(50);

/// Signals a process group. The standard library signals one process only.
const KILL: &str = "/bin/kill";

/// Where a session's events go.
pub trait Sink: Send + Sync + 'static {
    /// One event line from pi — anything that is not a correlated response.
    fn event(&self, sid: &str, event: Value);
    /// The process went away. A page still waiting on a turn needs to know.
    fn exited(&self, sid: &str, code: Option<i32>);
}

/// What a session needs in order to start.
#[derive(Debug, Clone)]
pub struct Spawn {
    /// The `pi` to run. ADR 0004: the user's own, resolved before we get here.
    pub cli: String,
    /// The workspace pi operates in.
    pub cwd: String,
    /// pi's own id for the session, so a reopened document resumes rather than
    /// starting fresh.
    pub session_id: String,
    /// Extra flags — the per-session extension set, and anything else a caller
    /// has decided on.
    pub args: Vec<String>,
    /// How pi is told to draw an answer: what `draw_mode` answered.
    pub draw: String,
    /// The `PATH` pi runs with, when it is not this process's own: the login
    /// shell's directories after it, so a pi the Finder launch could not have
    /// found also finds its Node and the tools its commands name (ADR 0068).
    pub path: Option<String>,
}

struct Live {
    child: Child,
    stdin: ChildStdin,
    /// Requests awaiting a reply, by correlation id.
    pending: Arc<Mutex<HashMap<String, Sender<Value>>>>,
    /// Which start this is. The reader of an earlier pi for the same session
    /// must not free a later one's slot.
    generation: u64,
}

/// Every session this process has open.
pub struct Sessions {
    live: Arc<Mutex<HashMap<String, Live>>>,
    next_id: AtomicU64,
    starts: AtomicU64,
    /// How long `send` waits for a reply: `REQUEST_TIMEOUT`, but for a test
    /// that has to reach the branch without sitting through it.
    request_timeout: Duration,
}

impl Default for Sessions {
    fn default() -> Self {
        Self {
            live: Arc::default(),
            next_id: AtomicU64::default(),
            starts: AtomicU64::default(),
            request_timeout: REQUEST_TIMEOUT,
        }
    }
}

impl Sessions {
    /// Whether a session has a process.
    pub fn is_live(&self, sid: &str) -> bool {
        self.live
            .lock()
            .map(|live| live.contains_key(sid))
            .unwrap_or(false)
    }

    /// Starts `pi --mode rpc` for `sid`, if it is not already running.
    ///
    /// Idempotent on purpose: the page calls this before a send rather than
    /// tracking whether it has, and a session that died is respawned by
    /// `drop` + `start` rather than by this returning an error forever.
    pub fn start(&self, sid: &str, spawn: &Spawn, sink: Arc<dyn Sink>) -> Result<(), String> {
        let mut live = self.live.lock().map_err(|e| e.to_string())?;
        if live.contains_key(sid) {
            return Ok(());
        }

        let mut command = Command::new(&spawn.cli);
        command
            .arg("--mode")
            .arg("rpc")
            .arg("--session-id")
            .arg(&spawn.session_id)
            .args(&spawn.args)
            .current_dir(&spawn.cwd)
            // The page answers the `cell` tool's verdict request
            // (`docs/notebook-cells.md` §Policy). A pi not started here — in a
            // terminal — has no page to ask, and must
            // not pop the question at a person.
            .env(VERDICTS_ENV, "1")
            // One mode per pi, set on every start rather than left to what this
            // process inherited: the tools read it once, when they register.
            .env(DRAW_ENV, &spawn.draw)
            // pi leads a process group of its own, so a stop reaches every
            // tool it started as well as pi (ADR 0019 §1).
            .process_group(0)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // Inherited: pi's stderr is how a startup failure explains itself,
            // and ADR 0011 wants a credential problem visible rather than
            // swallowed.
            .stderr(Stdio::inherit());

        if let Some(path) = &spawn.path {
            command.env("PATH", path);
        }

        let mut child = command.spawn().map_err(|e| {
            // Says what to do about it, where a user who launched the app from
            // the Finder can do it (ADR 0068).
            format!(
                "could not start `{}`: {e}. Choose the pi to run in Piary → Settings…, or install \
                 pi (https://pi.dev).",
                spawn.cli
            )
        })?;

        let stdout = child.stdout.take().ok_or("pi has no stdout")?;
        let stdin = child.stdin.take().ok_or("pi has no stdin")?;
        let pending: Arc<Mutex<HashMap<String, Sender<Value>>>> = Arc::default();
        let generation = self.starts.fetch_add(1, Ordering::Relaxed);

        let reader_pending = Arc::clone(&pending);
        let reader_sink = Arc::clone(&sink);
        let reader_sid = sid.to_string();
        let reader_live = Arc::clone(&self.live);
        // A reader thread rather than a task: reading a pipe blocks, and the
        // lines arrive interleaved with whatever the page is doing.
        //
        // Forwarded a line at a time, uncoalesced (ADR 0019 §6): pi throttles a
        // tool's streamed output itself (`BASH_UPDATE_THROTTLE_MS`, 100 ms) and
        // awaits its stdout's backpressure between events, so it cannot write
        // faster than this thread reads.
        std::thread::spawn(move || {
            for line in lines::bounded(BufReader::new(stdout), LINE_CAP) {
                let line = match line {
                    Ok(Line::Whole(line)) => line,
                    Ok(Line::TooLong(len)) => {
                        diag::note(&format!(
                            "piary: dropped a {len}-byte line from pi, past {LINE_CAP}"
                        ));
                        continue;
                    }
                    Err(_) => break,
                };
                if line.trim_ascii().is_empty() {
                    continue;
                }
                let Ok(value) = serde_json::from_slice::<Value>(&line) else {
                    // A line that is not JSON is pi misbehaving, and dropping it
                    // keeps one bad line from ending the session.
                    diag::note("piary: dropped a line from pi that is not JSON");
                    continue;
                };
                match correlation_of(&value) {
                    Some(id) => {
                        // A reply whose waiter has already timed out has nowhere
                        // to go; that is not an error, it is a slow answer.
                        if let Some(waiter) =
                            reader_pending.lock().ok().and_then(|mut p| p.remove(&id))
                        {
                            let _ = waiter.send(value);
                        }
                    }
                    None => reader_sink.event(&reader_sid, value),
                }
            }
            // stdout closed: pi has gone, or is going. Whatever observes the
            // exit reaps it and frees the slot (ADR 0019 §5), so the next
            // `start` spawns a fresh pi rather than finding a dead one — unless
            // a stop took the entry first, and is reaping it itself. The page
            // is told either way, so a live turn does not hang.
            let code = take(&reader_live, &reader_sid, generation).and_then(end);
            reader_sink.exited(&reader_sid, code);
        });

        live.insert(
            sid.to_string(),
            Live {
                child,
                stdin,
                pending,
                generation,
            },
        );
        Ok(())
    }

    /// Sends one command and waits for its reply.
    ///
    /// `command` is the page's object, passed through untouched but for the
    /// correlation id. A command pi does not answer returns `null` immediately
    /// rather than waiting for a reply that never comes.
    pub fn send(&self, sid: &str, mut command: Map<String, Value>) -> Result<Value, SendError> {
        let kind = command
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let id = format!("req_{}", self.next_id.fetch_add(1, Ordering::Relaxed) + 1);

        let receiver: Option<Receiver<Value>> = {
            let mut live = self.live.lock().map_err(|e| e.to_string())?;
            let session = live.get_mut(sid).ok_or("that session is not running")?;

            let receiver = if kind == NO_REPLY {
                None
            } else {
                command.insert("id".into(), Value::String(id.clone()));
                let (tx, rx) = channel();
                session
                    .pending
                    .lock()
                    .map_err(|e| e.to_string())?
                    .insert(id.clone(), tx);
                Some(rx)
            };

            let line = format!("{}\n", Value::Object(command));
            session
                .stdin
                .write_all(line.as_bytes())
                .and_then(|()| session.stdin.flush())
                .map_err(|e| format!("writing to pi: {e}"))?;
            receiver
        };

        // The lock is released before waiting: a 30-second request must not stop
        // every other session from being driven.
        let Some(receiver) = receiver else {
            return Ok(Value::Null);
        };
        match receiver.recv_timeout(self.request_timeout) {
            Ok(reply) => Ok(reply),
            // The waiter was dropped with the session: pi went away, and a reply
            // can no longer come.
            Err(RecvTimeoutError::Disconnected) => Err(SendError::Failed(format!(
                "pi went away before answering `{kind}`"
            ))),
            Err(RecvTimeoutError::Timeout) => {
                if let Ok(live) = self.live.lock() {
                    if let Some(session) = live.get(sid) {
                        if let Ok(mut pending) = session.pending.lock() {
                            pending.remove(&id);
                        }
                    }
                }
                Err(SendError::TimedOut(format!(
                    "pi did not answer `{kind}` within {:?}",
                    self.request_timeout
                )))
            }
        }
    }

    /// Ends one session's process and the tools it started (`end`). A session
    /// left running would hold a model's context and a working
    /// directory with nobody reading it.
    ///
    /// The entry is taken out under the lock and the wait happens after it is
    /// released: up to `STOP_GRACE` of waiting is this session's alone, not
    /// every other session's.
    pub fn drop_session(&self, sid: &str) -> Result<Option<i32>, String> {
        let taken = self.live.lock().map_err(|e| e.to_string())?.remove(sid);
        Ok(taken.and_then(end))
    }

    /// Ends every session — the exit sequence's step 4 (ADR 0019 §2).
    ///
    /// Each stop on a thread of its own, so a quit waits one `STOP_GRACE` and
    /// not one per session.
    pub fn stop_all(&self) {
        let Ok(mut live) = self.live.lock() else {
            return;
        };
        let doomed: Vec<Live> = live.drain().map(|(_, session)| session).collect();
        drop(live);
        let stops: Vec<_> = doomed
            .into_iter()
            .map(|session| std::thread::spawn(move || end(session)))
            .collect();
        for stop in stops {
            let _ = stop.join();
        }
    }

    /// Every live session's id.
    pub fn open(&self) -> Vec<String> {
        self.live
            .lock()
            .map(|live| live.keys().cloned().collect())
            .unwrap_or_default()
    }
}

/// Takes a session's entry out, if it is still the start the caller knew.
fn take(live: &Mutex<HashMap<String, Live>>, sid: &str, generation: u64) -> Option<Live> {
    let mut live = live.lock().ok()?;
    if live.get(sid)?.generation != generation {
        return None;
    }
    live.remove(sid)
}

/// Ends one pi and everything it started, and answers its exit code.
///
/// Closing stdin is how pi is asked to go; the group kill is the guarantee.
/// The kill is sent even when pi went on its own: a tool pi started is in its
/// group and is not ended by pi's exit (ADR 0019 §1). Called holding no lock.
fn end(session: Live) -> Option<i32> {
    let Live {
        mut child, stdin, ..
    } = session;
    drop(stdin);
    let deadline = Instant::now() + STOP_GRACE;
    let went = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(STOP_POLL),
            Ok(None) | Err(_) => break None,
        }
    };
    kill_group(child.id());
    let status = match went {
        Some(status) => Some(status),
        None => {
            let _ = child.kill();
            child.wait().ok()
        }
    };
    status.and_then(|status| status.code())
}

/// Kills a process group: pi, and every tool it started.
///
/// Through `/bin/kill` because the standard library signals a single process
/// (`Child::kill`) and `killpg` is in `libc`, which is not a dependency.
/// `/bin/kill` is part of every macOS base system, and its cost — one
/// short-lived process — is small beside a stop that may already have waited
/// `STOP_GRACE`. It failing is ordinary: after pi went on its own the group is
/// usually empty. pi itself is still killed by `Child::kill` if this fails.
///
/// The group's id is pi's pid, because pi leads its group. That id is not
/// reused while any member of the group lives, so the signal reaches a stranger
/// only if the group had already emptied and macOS recycled the id in the
/// moments since — pids are handed out in sequence, so that wants the whole
/// pid space to wrap within one stop.
fn kill_group(leader: u32) {
    let _ = Command::new(KILL)
        .args(["-KILL", "--", &format!("-{leader}")])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// The request a line answers, or `None` when the line is an event.
///
/// Both halves are required: pi's events carry a `type` of their own, and a
/// `response` without an `id` is not an answer to anything we asked.
fn correlation_of(value: &Value) -> Option<String> {
    if value.get("type").and_then(Value::as_str) != Some("response") {
        return None;
    }
    value.get("id").and_then(Value::as_str).map(str::to_string)
}

/// Why a request came back without pi's reply.
///
/// Two cases because they mean opposite things to the page: a request that
/// failed was never acted on, and one that timed out may have been — pi can
/// still be running the turn it was asked for (ADR 0019 §4).
#[derive(Debug)]
pub enum SendError {
    /// The request did not reach pi, or pi went away before answering.
    Failed(String),
    /// pi took the request and said nothing within the request timeout.
    TimedOut(String),
}

impl From<String> for SendError {
    fn from(message: String) -> Self {
        SendError::Failed(message)
    }
}

impl From<&str> for SendError {
    fn from(message: &str) -> Self {
        SendError::Failed(message.to_string())
    }
}

/// The error shape pi uses, for a failure raised on this side of the wire.
///
/// Same shape as a real refusal so the page has one branch rather than two
/// (ADR 0011: a failure is visible, not swallowed).
pub fn failure(message: &str) -> Value {
    json!({ "type": "response", "success": false, "error": message })
}

/// `failure`'s shape, marked as a reply that is late rather than refused.
///
/// The mark is what lets the page probe instead of unlocking: a timed-out
/// prompt may be a turn still writing into the document (ADR 0019 §4).
pub fn timed_out(message: &str) -> Value {
    json!({ "type": "response", "success": false, "error": message, "timedOut": true })
}

impl SendError {
    /// The reply the page reads, in pi's own shape.
    pub fn into_reply(self) -> Value {
        match self {
            SendError::Failed(message) => failure(&message),
            SendError::TimedOut(message) => timed_out(&message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
    use std::sync::mpsc;

    /// Collects what the page would have seen.
    struct Collector(Mutex<mpsc::Sender<(String, Value)>>);

    impl Sink for Collector {
        fn event(&self, sid: &str, event: Value) {
            let _ = self.0.lock().unwrap().send((sid.to_string(), event));
        }
        fn exited(&self, sid: &str, code: Option<i32>) {
            let _ = self
                .0
                .lock()
                .unwrap()
                .send((sid.to_string(), json!({ "type": "__exited", "code": code })));
        }
    }

    /// A stand-in for pi: `tests/fixtures/fake-pi`, a real process speaking the
    /// real newline-delimited JSON over real pipes.
    ///
    /// What it is NOT is `sh -c "<script>"`. The session layer always prepends
    /// `--mode rpc --session-id <id>`, and `sh` rejects `--mode` outright — so
    /// an inline script would only ever have proved that `sh` dislikes a flag.
    /// A fake has to tolerate the real spawn's arguments, which is why the
    /// fixture discards them and takes its behaviour from `FAKE_PI_MODE`.
    fn fake_pi(mode: &str) -> Spawn {
        fake_pi_as(mode, "anon")
    }

    /// The fake, told which behaviour to take and who it is.
    ///
    /// The mode rides in `args` rather than in the environment: cargo runs
    /// tests as threads in one process, so a `set_var` is shared and two tests
    /// wanting different modes would race.
    fn fake_pi_as(mode: &str, who: &str) -> Spawn {
        Spawn {
            cli: concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/fake-pi").into(),
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            session_id: "s".into(),
            args: vec!["--fake".into(), mode.into(), who.into()],
            draw: "a2ui".into(),
            path: None,
        }
    }

    fn collector() -> (Arc<dyn Sink>, mpsc::Receiver<(String, Value)>) {
        let (tx, rx) = mpsc::channel();
        (Arc::new(Collector(Mutex::new(tx))), rx)
    }

    #[test]
    fn a_reply_is_matched_to_its_request() {
        // The whole of the correlation rule: echo the id back inside a
        // `response`, and the waiting caller gets it.
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        sessions.start("s1", &fake_pi("echo"), sink).expect("start");

        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let reply = sessions.send("s1", command).expect("send");
        assert_eq!(reply["success"], json!(true));
        assert_eq!(reply["data"]["echo"], json!("get_state"));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn concurrent_requests_do_not_cross() {
        // The failure this prevents: two requests in flight, the second's reply
        // handed to the first. Answered out of order on purpose.
        let sessions = Arc::new(Sessions::default());
        let (sink, _rx) = collector();
        sessions.start("s1", &fake_pi("slow"), sink).expect("start");

        let first = {
            let sessions = Arc::clone(&sessions);
            std::thread::spawn(move || {
                let mut c = Map::new();
                c.insert("type".into(), json!("alpha"));
                sessions.send("s1", c)
            })
        };
        let second = {
            let sessions = Arc::clone(&sessions);
            std::thread::spawn(move || {
                let mut c = Map::new();
                c.insert("type".into(), json!("beta"));
                sessions.send("s1", c)
            })
        };
        let a = first.join().unwrap().expect("alpha");
        let b = second.join().unwrap().expect("beta");
        assert_eq!(a["data"]["echo"], json!("alpha"));
        assert_eq!(b["data"]["echo"], json!("beta"));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn an_event_reaches_the_page_rather_than_a_waiter() {
        // An event has a `type` of its own and no `id`. Treating one as a reply
        // would resolve whatever request happened to be in flight with the
        // wrong payload.
        let sessions = Sessions::default();
        let (sink, rx) = collector();
        sessions
            .start("s1", &fake_pi("event"), sink)
            .expect("start");

        let (sid, event) = rx.recv_timeout(Duration::from_secs(5)).expect("an event");
        assert_eq!(sid, "s1");
        assert_eq!(event["type"], json!("agent_message_delta"));
        assert_eq!(event["text"], json!("hello"));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn a_line_that_is_not_json_is_dropped_and_the_relay_goes_on() {
        // Not UTF-8 is not JSON either. Read as text, the bad bytes would fail the
        // whole read and end the session's relay over one line.
        let sessions = Sessions::default();
        let (sink, rx) = collector();
        sessions
            .start("s1", &fake_pi("garbled"), sink)
            .expect("start");
        let (_, event) = rx.recv_timeout(Duration::from_secs(5)).expect("an event");
        assert_eq!(event["type"], json!("agent_message_delta"));
        assert_eq!(event["text"], json!("after"));
        assert!(sessions.is_live("s1"));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn a_response_without_an_id_is_an_event_not_an_answer() {
        // Both halves of the correlation rule are required. A `response` with
        // no id answers nothing we asked, so it must not be matched to a
        // waiting request.
        assert_eq!(
            correlation_of(&json!({"type": "response", "id": "req_1"})),
            Some("req_1".into())
        );
        assert_eq!(correlation_of(&json!({"type": "response"})), None);
        assert_eq!(
            correlation_of(&json!({"type": "agent_settled", "id": "x"})),
            None
        );
    }

    #[test]
    fn the_unanswered_command_returns_at_once() {
        // rpc-mode resolves extension_ui_response internally and emits no
        // correlated response. Waiting would block for the full 30s on every
        // answered prompt, so this is the one command sent and forgotten.
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        // Reads and never answers, which is what pi does for this command.
        sessions
            .start("s1", &fake_pi("silent"), sink)
            .expect("start");

        let mut command = Map::new();
        command.insert("type".into(), json!(NO_REPLY));
        let started = std::time::Instant::now();
        let reply = sessions.send("s1", command).expect("send");
        assert_eq!(reply, Value::Null);
        assert!(
            started.elapsed() < Duration::from_secs(2),
            "it waited for a reply that never comes"
        );
        let _ = sessions.drop_session("s1");
    }

    /// How long the timeout rows wait for a reply. The real `REQUEST_TIMEOUT`
    /// is 30s, which no test should sit through.
    const SHORT_TIMEOUT: Duration = Duration::from_millis(200);

    #[test]
    fn a_silent_pi_times_out_rather_than_hanging_forever() {
        // A pi that is alive and says nothing: the waiter is released as a
        // timeout — which the page probes rather than unlocks (ADR 0019 §4) —
        // and its pending entry is gone, so a reply that turns up later has
        // nowhere to land and the map does not grow one entry per lost reply.
        let sessions = Sessions {
            request_timeout: SHORT_TIMEOUT,
            ..Sessions::default()
        };
        let (sink, _rx) = collector();
        sessions
            .start("s1", &fake_pi("silent"), sink)
            .expect("start");

        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let started = Instant::now();
        let outcome = sessions.send("s1", command);
        assert!(
            matches!(outcome, Err(SendError::TimedOut(_))),
            "a pi that is there and silent timed out: {outcome:?}"
        );
        assert!(
            started.elapsed() < SHORT_TIMEOUT * 10,
            "the wait was {:?}, not the session's timeout",
            started.elapsed()
        );
        assert!(
            sessions.is_live("s1"),
            "a timeout leaves pi running — it may still be on the turn"
        );
        let waiting = sessions.live.lock().unwrap()["s1"]
            .pending
            .lock()
            .unwrap()
            .len();
        assert_eq!(waiting, 0, "the timed-out request is still pending");
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn a_request_whose_pi_goes_away_failed_rather_than_timed_out() {
        // The page unlocks on a failure and probes on a timeout (ADR 0019 §4),
        // so a pi that is gone must not read as one that is merely slow — and
        // must not take `REQUEST_TIMEOUT` to say so.
        let sessions = Arc::new(Sessions::default());
        let (sink, _rx) = collector();
        sessions
            .start("s1", &fake_pi("silent"), sink)
            .expect("start");

        let waiting = {
            let sessions = Arc::clone(&sessions);
            std::thread::spawn(move || {
                let mut command = Map::new();
                command.insert("type".into(), json!("get_state"));
                sessions.send("s1", command)
            })
        };
        std::thread::sleep(Duration::from_millis(300));
        let started = Instant::now();
        let _ = sessions.drop_session("s1");
        let outcome = waiting.join().unwrap();
        assert!(
            matches!(outcome, Err(SendError::Failed(_))),
            "a pi that went away is a failure: {outcome:?}"
        );
        assert!(
            started.elapsed() < REQUEST_TIMEOUT / 2,
            "answered without waiting out the timeout"
        );
    }

    #[test]
    fn a_timeout_reaches_the_page_marked_and_a_failure_does_not() {
        // The page reads `timedOut` to probe rather than unlock (ADR 0019 §4);
        // `src/bridge.ts`'s `PiReply` is the other half of this contract.
        let late = SendError::TimedOut("late".into()).into_reply();
        assert_eq!(late["success"], json!(false));
        assert_eq!(late["timedOut"], json!(true));
        let refused = SendError::Failed("refused".into()).into_reply();
        assert_eq!(refused["success"], json!(false));
        assert!(refused.get("timedOut").is_none());
    }

    #[test]
    fn sending_to_a_session_that_is_not_running_is_an_error() {
        let sessions = Sessions::default();
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        assert!(sessions.send("nope", command).is_err());
    }

    #[test]
    fn starting_twice_is_idempotent() {
        // The page calls start before a send rather than tracking whether it
        // has; a second process per session would double every event.
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        let spawn = fake_pi("linger");
        sessions
            .start("s1", &spawn, Arc::clone(&sink))
            .expect("first");
        sessions.start("s1", &spawn, sink).expect("second");
        assert_eq!(sessions.open(), vec!["s1".to_string()]);
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn dropping_a_session_ends_its_process_and_forgets_it() {
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        sessions
            .start("s1", &fake_pi("linger"), sink)
            .expect("start");
        assert!(sessions.is_live("s1"));
        sessions.drop_session("s1").expect("drop");
        assert!(!sessions.is_live("s1"));
        // The pair: dropping again is the ordinary no-op, so the first really
        // did forget it.
        assert_eq!(sessions.drop_session("s1").unwrap(), None);
    }

    #[test]
    fn one_session_does_not_see_anothers_events() {
        let sessions = Sessions::default();
        let (sink, rx) = collector();
        // Each child is told who it is, so an event arriving under the wrong
        // sid is visible rather than merely plausible.
        sessions
            .start("alpha", &fake_pi_as("event", "alpha"), Arc::clone(&sink))
            .expect("alpha");
        sessions
            .start("beta", &fake_pi_as("event", "beta"), sink)
            .expect("beta");

        let mut seen = Vec::new();
        for _ in 0..4 {
            if let Ok((sid, event)) = rx.recv_timeout(Duration::from_secs(5)) {
                if event["type"] == json!("agent_message_delta") {
                    seen.push((sid, event["who"].as_str().unwrap_or_default().to_string()));
                }
            }
            if seen.len() == 2 {
                break;
            }
        }
        seen.sort();
        assert_eq!(
            seen,
            vec![
                ("alpha".to_string(), "alpha".to_string()),
                ("beta".to_string(), "beta".to_string())
            ]
        );
        let _ = sessions.drop_session("alpha");
        let _ = sessions.drop_session("beta");
    }

    /// The arguments a session's pi was really started with, as the argv fake
    /// reports them.
    fn started_with(places: &crate::extension::Places) -> Vec<String> {
        let mut spawn = fake_pi("argv");
        spawn.args = crate::extension::session_args(places, vec!["--fake".into(), "argv".into()]);
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        sessions.start("s1", &spawn, sink).expect("start");
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let reply = sessions.send("s1", command).expect("send");
        let _ = sessions.drop_session("s1");
        reply["data"]["argv"]
            .as_array()
            .expect("argv")
            .iter()
            .map(|arg| arg.as_str().unwrap_or_default().to_string())
            .collect()
    }

    #[test]
    fn pi_is_started_with_piarys_own_package_and_prompt() {
        // A bare workspace and home: nothing the user installed supplies the
        // package, so the app's copy is passed, as one flag and one path.
        let bare = std::env::temp_dir().join(format!("piary-argv-{}", std::process::id()));
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let argv = started_with(&crate::extension::Places {
            resource_dir: None,
            checkout: Some(manifest),
            cwd: &bare,
            agent: Some(&bare),
            home: Some(&bare),
            face: false,
        });
        let package = manifest.parent().unwrap().join("pi-extension");
        let at = argv.iter().position(|arg| arg == "--extension");
        assert_eq!(
            at.and_then(|at| argv.get(at + 1)).map(String::as_str),
            Some(package.to_string_lossy().as_ref()),
            "pi was started without Piary's package: {argv:?}"
        );
        let at = argv.iter().position(|arg| arg == "--append-system-prompt");
        assert_eq!(
            at.and_then(|at| argv.get(at + 1)).map(String::as_str),
            Some(package.join("system-prompt.md").to_string_lossy().as_ref()),
            "pi was started without Piary's prompt: {argv:?}"
        );
    }

    #[test]
    fn pi_is_told_the_page_answers_cell_verdicts() {
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        sessions.start("s1", &fake_pi("argv"), sink).expect("start");
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let reply = sessions.send("s1", command).expect("send");
        let _ = sessions.drop_session("s1");
        assert_eq!(reply["data"]["verdicts"], json!("1"), "{reply}");
    }

    #[test]
    fn draw_mode_is_free_only_when_free_is_asked_for() {
        assert_eq!(draw_mode(Some("free")), "free");
        assert_eq!(draw_mode(None), "a2ui");
        assert_eq!(draw_mode(Some("a2ui")), "a2ui");
        assert_eq!(draw_mode(Some("")), "a2ui");
        assert_eq!(draw_mode(Some("FREE")), "a2ui");
        assert_eq!(draw_mode(Some("cells")), "a2ui");
    }

    #[test]
    fn the_draw_mode_a_start_names_reaches_pi() {
        // Each start names its own mode, whatever this process inherited: the
        // mode is the starter's to decide, and pi's tools read it once.
        for mode in ["free", "a2ui"] {
            let sessions = Sessions::default();
            let (sink, _rx) = collector();
            let spawn = Spawn {
                draw: mode.into(),
                ..fake_pi("argv")
            };
            sessions.start("s1", &spawn, sink).expect("start");
            let mut command = Map::new();
            command.insert("type".into(), json!("get_state"));
            let reply = sessions.send("s1", command).expect("send");
            let _ = sessions.drop_session("s1");
            assert_eq!(reply["data"]["draw"], json!(mode), "{reply}");
        }
    }

    #[test]
    fn a_workspace_that_installs_the_package_gets_no_second_copy() {
        // This checkout installs it through `.pi/settings.json`; a second copy
        // would make pi exit on the duplicate `cell`.
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let repo = manifest.parent().unwrap();
        let bare = std::env::temp_dir().join(format!("piary-argv-home-{}", std::process::id()));
        let argv = started_with(&crate::extension::Places {
            resource_dir: None,
            checkout: Some(manifest),
            cwd: repo,
            agent: Some(&bare),
            home: Some(&bare),
            face: false,
        });
        assert!(
            !argv.iter().any(|arg| arg == "--extension"),
            "a second copy was passed: {argv:?}"
        );
    }

    #[test]
    fn a_missing_pi_says_what_to_install() {
        // A Tauri app bundles no Node, so there is no fallback pi to quietly
        // use instead: the failure has to name the fix (ADR 0004).
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        let spawn = Spawn {
            cli: "/nonexistent/pi".into(),
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            session_id: "s".into(),
            args: vec![],
            draw: "a2ui".into(),
            path: None,
        };
        let error = sessions.start("s1", &spawn, sink).expect_err("should fail");
        assert!(error.contains("install"), "unhelpful message: {error}");
        assert!(
            error.contains("Settings"),
            "where to choose another is not said: {error}"
        );
    }

    /// Whether a process is still there. `kill -0` sends nothing and answers
    /// whether the pid could be signalled.
    fn alive(pid: u32) -> bool {
        Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    /// Whether a process is gone within `within`. An orphan is reaped by
    /// `launchd`, not by us, so its end is observed rather than waited for.
    fn gone_within(pid: u32, within: Duration) -> bool {
        let deadline = std::time::Instant::now() + within;
        while std::time::Instant::now() < deadline {
            if !alive(pid) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        !alive(pid)
    }

    /// The pid of the child a `tools` fake started.
    fn tool_pid(rx: &mpsc::Receiver<(String, Value)>) -> u32 {
        loop {
            let (_, event) = rx.recv_timeout(Duration::from_secs(5)).expect("the tool");
            if event["type"] == json!("tool") {
                return event["pid"].as_u64().expect("a pid") as u32;
            }
        }
    }

    fn pid_of(sessions: &Sessions, sid: &str) -> u32 {
        sessions.live.lock().unwrap()[sid].child.id()
    }

    #[test]
    fn stopping_pi_ends_the_tools_it_started() {
        // pi runs tools. Its own exit does not end a `bash` it spawned — the
        // child is reparented and keeps editing the user's repository with
        // nobody watching (ADR 0019 §1).
        let sessions = Sessions::default();
        let (sink, rx) = collector();
        sessions
            .start("s1", &fake_pi("tools"), sink)
            .expect("start");
        let tool = tool_pid(&rx);
        assert!(alive(tool), "the tool is running before the stop");
        sessions.drop_session("s1").expect("drop");
        assert!(
            gone_within(tool, Duration::from_secs(2)),
            "pi's tool outlived it"
        );
    }

    #[test]
    fn a_pi_that_exits_on_its_own_is_reaped_and_the_next_start_is_fresh() {
        // ADR 0019 §5: whatever observes the exit frees the slot. Kept, a dead
        // pi's entry made `start` a no-op, so every later send wrote to a
        // closed pipe and the notice's "the next send starts it again" was false.
        let sessions = Sessions::default();
        let (sink, rx) = collector();
        sessions
            .start("s1", &fake_pi("quit"), Arc::clone(&sink))
            .expect("start");
        let (sid, exited) = rx.recv_timeout(Duration::from_secs(5)).expect("exit");
        assert_eq!(sid, "s1");
        assert_eq!(exited["type"], json!("__exited"));
        assert_eq!(
            exited["code"],
            json!(7),
            "the exit was reaped, so its code is known"
        );
        assert!(!sessions.is_live("s1"));

        sessions
            .start("s1", &fake_pi("echo"), sink)
            .expect("restart");
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let reply = sessions.send("s1", command).expect("a fresh pi answers");
        assert_eq!(reply["success"], json!(true));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn stopping_one_session_does_not_hold_up_another() {
        // The stop waits up to its grace for a pi that will not go. That wait
        // is the stopped session's alone; holding the map across it would stall
        // every other session's send behind it.
        let sessions = Arc::new(Sessions::default());
        let (sink, _rx) = collector();
        sessions
            .start("wedged", &fake_pi("deaf"), Arc::clone(&sink))
            .expect("wedged");
        sessions
            .start("other", &fake_pi("echo"), sink)
            .expect("other");
        let stopping = {
            let sessions = Arc::clone(&sessions);
            std::thread::spawn(move || sessions.drop_session("wedged"))
        };
        std::thread::sleep(Duration::from_millis(100));

        let started = std::time::Instant::now();
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        sessions.send("other", command).expect("send");
        assert!(
            started.elapsed() < STOP_GRACE / 2,
            "the other session waited {:?} on someone else's stop",
            started.elapsed()
        );
        stopping.join().unwrap().expect("stop");
        let _ = sessions.drop_session("other");
    }

    #[test]
    fn a_start_made_during_a_stop_keeps_its_own_pi() {
        // `pi_stop` runs off the main thread, so a `pi_start` for the same
        // session can land while the stop waits out its grace. The start finds
        // the slot empty and spawns a fresh pi; the old pi's reader, reaching
        // EOF when the stop kills it, must leave that fresh pi's slot alone.
        let sessions = Arc::new(Sessions::default());
        let (sink, _rx) = collector();
        sessions
            .start("s1", &fake_pi("deaf"), Arc::clone(&sink))
            .expect("first");
        let stopping = {
            let sessions = Arc::clone(&sessions);
            std::thread::spawn(move || sessions.drop_session("s1"))
        };
        std::thread::sleep(Duration::from_millis(100));
        sessions
            .start("s1", &fake_pi("echo"), sink)
            .expect("a start during the stop");
        stopping.join().unwrap().expect("stop");
        // The old reader has seen its EOF once the stop has reaped its pi; give
        // it the moment it needs to act on it.
        std::thread::sleep(Duration::from_millis(200));

        assert!(
            sessions.is_live("s1"),
            "the old pi's exit freed the new one's slot"
        );
        let mut command = Map::new();
        command.insert("type".into(), json!("get_state"));
        let reply = sessions.send("s1", command).expect("the new pi answers");
        assert_eq!(reply["success"], json!(true));
        let _ = sessions.drop_session("s1");
    }

    #[test]
    fn stopping_every_session_ends_every_process_within_one_grace() {
        // The exit sequence's step 4 (ADR 0019 §2). Stopped side by side: one
        // at a time, a window of wedged sessions would hold a quit for a grace
        // each.
        let sessions = Sessions::default();
        let (sink, _rx) = collector();
        let sids = ["a", "b", "c"];
        for sid in sids {
            sessions
                .start(sid, &fake_pi("deaf"), Arc::clone(&sink))
                .expect("start");
        }
        let pids: Vec<u32> = sids.iter().map(|sid| pid_of(&sessions, sid)).collect();

        let started = std::time::Instant::now();
        sessions.stop_all();
        assert!(
            started.elapsed() < STOP_GRACE * 2,
            "took {:?} — one grace per session",
            started.elapsed()
        );
        assert!(sessions.open().is_empty());
        for pid in pids {
            assert!(
                gone_within(pid, Duration::from_secs(2)),
                "pid {pid} outlived the stop"
            );
        }
    }

    #[test]
    fn a_failure_looks_like_pis_own() {
        // One branch in the page for a refusal, whether it came from pi or from
        // this side of the wire.
        let value = failure("something went wrong");
        assert_eq!(value["type"], json!("response"));
        assert_eq!(value["success"], json!(false));
        assert_eq!(value["error"], json!("something went wrong"));
    }
}
