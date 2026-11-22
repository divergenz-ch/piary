//! The app's own log: a file a user can find without a terminal.
//!
//! Launched from Finder, the process's stdout and stderr go nowhere a user can
//! reach, so a page-side throw or a dropped relay line in a shipped build would
//! be said to no one. Everything the app has to say about itself — the page's
//! forwarded console and its notices, the relays' notes about what they
//! dropped, every exchange with pi, a panic — is also appended here, under the
//! app's log directory, which Console.app lists under Log Reports
//! (`docs/packaging.md` §5).
//!
//! Bounded, like every relay (ADR 0019 §6): the file is rotated to one previous
//! generation past `LOG_CAP` or `MAX_AGE`, whichever comes first, so the two
//! together never exceed twice the cap; one entry is cut at `ENTRY_CAP` so a
//! single huge value cannot take a whole generation; and a line repeated back
//! to back is written once, with a count. Nothing here leaves the machine.
//!
//! No `tauri::` types (ADR 0014): `main.rs` resolves the directory and installs
//! it, and the modules that note things call `note` without knowing whether a
//! log is installed — under `cargo test` none is, and a note is stderr alone.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};

/// The size one generation of the log may reach before it is rotated. The log
/// holds every exchange with pi, prompts and answers included, so a generation
/// is weeks of use at a few hundred kilobytes a session.
pub const LOG_CAP: u64 = 20 * 1024 * 1024;

/// The age one generation may reach before it is rotated, however small it is:
/// the previous week stays readable beside the current one, and nothing older.
pub const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// The longest one entry may be. A stack trace is a few kilobytes; a page
/// logging a whole document is what this stops, and the cut says how much
/// went.
pub const ENTRY_CAP: usize = 16 * 1024;

const CURRENT: &str = "piary.log";
const PREVIOUS: &str = "piary.1.log";

/// One log directory: the current generation open for appending, how big and
/// how old it is, and the line last written, held back while it repeats.
pub struct Log {
    dir: PathBuf,
    cap: u64,
    max_age: Duration,
    file: File,
    size: u64,
    /// When the current generation's first entry was written; `None` while it
    /// holds none.
    born: Option<SystemTime>,
    /// The line of the last entry written, and how many times it has arrived
    /// again since without being written.
    last: Option<String>,
    repeats: u64,
}

impl Log {
    /// Opens (creating as needed) the log in `dir`, appending to what an
    /// earlier run left there. A generation an earlier run started is as old
    /// as the file: macOS records a file's creation, and a rename keeps it.
    pub fn open(dir: &Path, cap: u64, max_age: Duration) -> io::Result<Self> {
        fs::create_dir_all(dir)?;
        let file = open_current(dir)?;
        let meta = file.metadata()?;
        let size = meta.len();
        let born = (size > 0)
            .then(|| meta.created().or_else(|_| meta.modified()).ok())
            .flatten();
        Ok(Self {
            dir: dir.to_path_buf(),
            cap,
            max_age,
            file,
            size,
            born,
            last: None,
            repeats: 0,
        })
    }

    /// The file the current generation is written to.
    pub fn path(&self) -> PathBuf {
        self.dir.join(CURRENT)
    }

    /// Appends one entry stamped `now`, rotating first if it would take the
    /// current generation past the cap or the generation is past its age.
    ///
    /// The same line arriving again straight after itself is counted, not
    /// written: a cell that throws on every frame said so twenty times in 400
    /// ms. The count is written when a different line arrives, so a run of
    /// repeats still in progress when the app ends is the one count lost.
    pub fn append(&mut self, now: SystemTime, line: &str) -> io::Result<()> {
        if self.last.as_deref() == Some(line) {
            self.repeats += 1;
            return Ok(());
        }
        if self.repeats > 0 {
            let n = self.repeats;
            self.repeats = 0;
            let times = if n == 1 { "time" } else { "times" };
            self.write(now, &format!("… the line above came {n} more {times}"))?;
        }
        self.write(now, line)?;
        self.last = Some(line.to_string());
        Ok(())
    }

    fn write(&mut self, now: SystemTime, line: &str) -> io::Result<()> {
        let entry = entry(now, line);
        let full = self.size > 0 && self.size + entry.len() as u64 > self.cap;
        let old = self.born.is_some_and(|born| {
            now.duration_since(born)
                .is_ok_and(|age| age >= self.max_age)
        });
        if full || old {
            // Renaming over the previous generation is what keeps the total
            // bounded: there are never more than two.
            fs::rename(self.dir.join(CURRENT), self.dir.join(PREVIOUS))?;
            self.file = open_current(&self.dir)?;
            self.size = 0;
            self.born = None;
        }
        // One write per entry, unbuffered, so an entry is on disk before the
        // crash that might follow it.
        self.file.write_all(entry.as_bytes())?;
        self.size += entry.len() as u64;
        self.born.get_or_insert(now);
        Ok(())
    }
}

fn open_current(dir: &Path) -> io::Result<File> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(CURRENT))
}

/// One entry as it is written: a UTC timestamp, the line cut at `ENTRY_CAP`,
/// and any continuation lines indented so an entry's end is visible.
fn entry(now: SystemTime, line: &str) -> String {
    let mut body = line;
    let mut cut = 0;
    if line.len() > ENTRY_CAP {
        let mut end = ENTRY_CAP;
        while !line.is_char_boundary(end) {
            end -= 1;
        }
        body = &line[..end];
        cut = line.len() - end;
    }
    let mut out = format!("{} {}", timestamp(now), body.replace('\n', "\n    "));
    if cut > 0 {
        out.push_str(&format!(" … [{cut} more bytes cut]"));
    }
    out.push('\n');
    out
}

/// `now` as ISO 8601 in UTC, to the millisecond.
pub(crate) fn timestamp(now: SystemTime) -> String {
    let since = now.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = since.as_secs();
    let (year, month, day) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60,
        since.subsec_millis()
    )
}

/// The proleptic Gregorian date `days` after 1970-01-01 — Howard Hinnant's
/// `civil_from_days`, because std formats no dates.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// The environment variable that names the log directory, for a run that must
/// keep its log apart from every other Piary's: a driven session's, which goes
/// into that session's own directory.
pub const LOG_DIR_ENV: &str = "PIARY_LOG_DIR";

/// Where the log goes: the directory `LOG_DIR_ENV` names, or `default` when it
/// is unset or empty. A relative one is taken as the process reads it.
pub fn log_dir(named: Option<OsString>, default: PathBuf) -> PathBuf {
    named
        .filter(|dir| !dir.is_empty())
        .map_or(default, PathBuf::from)
}

static INSTALLED: OnceLock<Mutex<Log>> = OnceLock::new();

/// Opens the log in `dir` for the rest of the process, and records a panic
/// there before the default hook reports it. Returns the file's path.
pub fn install(dir: &Path) -> io::Result<PathBuf> {
    let log = Log::open(dir, LOG_CAP, MAX_AGE)?;
    let path = log.path();
    let _ = INSTALLED.set(Mutex::new(log));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        record(&format!("panic: {info}"));
        previous(info);
    }));
    Ok(path)
}

/// Appends `line` to the installed log, if there is one.
///
/// A failed write is dropped: a log that can fail its caller would turn a
/// full disk into a broken app.
pub fn record(line: &str) {
    if let Some(log) = INSTALLED.get() {
        if let Ok(mut log) = log.lock() {
            let _ = log.append(SystemTime::now(), line);
        }
    }
}

/// Says `line` on stderr, for a terminal, and records it, for everyone else.
pub fn note(line: &str) {
    eprintln!("{line}");
    record(line);
}

// -- pi's traffic ---------------------------------------------------------------
//
// Every exchange with pi, so a bug report's log says what was sent, what pi
// answered and what it did, in order. Prompts and answers are in it: it is the
// user's own log on the user's own machine (`docs/packaging.md` §5).

/// The events left out: a streamed partial of a message or a tool's output,
/// many a second, each superseded by the `_end` event that follows it.
const STREAMED: [&str; 2] = ["message_update", "tool_execution_update"];

/// The events recorded by type alone: each repeats the messages the run's
/// `message_end` events already recorded.
const RECAPS: [&str; 2] = ["turn_end", "agent_end"];

/// A command the page sent to `sid`, as recorded.
pub fn pi_command_line(sid: &str, command: &Map<String, Value>) -> String {
    let mut command = Value::Object(command.clone());
    without_image_data(&mut command);
    without_dialog_answer(&mut command);
    format!("PI → {sid} {command}")
}

/// pi's reply to a command of type `kind`, as recorded: whether it succeeded
/// and, when it did not, why. The data is not: a transcript read is the whole
/// conversation, and the events already recorded it.
pub fn pi_reply_line(sid: &str, kind: &str, reply: &Value) -> String {
    match reply.get("success").and_then(Value::as_bool) {
        Some(true) => format!("PI ← {sid} {kind} ok"),
        Some(false) => {
            let error = reply
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("no reason given");
            let late = if reply.get("timedOut").and_then(Value::as_bool) == Some(true) {
                " (timed out)"
            } else {
                ""
            };
            format!("PI ← {sid} {kind} failed{late}: {error}")
        }
        None => format!("PI ← {sid} {kind} no reply"),
    }
}

/// One of pi's events for `sid`, as recorded, or `None` for a streamed
/// partial.
pub fn pi_event_line(sid: &str, event: &Value) -> Option<String> {
    let kind = event.get("type").and_then(Value::as_str).unwrap_or("?");
    if STREAMED.contains(&kind) {
        return None;
    }
    if RECAPS.contains(&kind) {
        return Some(format!("PI ← {sid} event {kind}"));
    }
    let mut event = event.clone();
    without_image_data(&mut event);
    Some(format!("PI ← {sid} event {event}"))
}

/// Replaces every image's bytes with their length: a screenshot is a megabyte
/// of base64 that says nothing a person reading the log can use.
/// An answer to an extension's dialog, kept to its length: the sign-in panel
/// sends a typed key to pi this way (ADR 0034), and a log is no place for it.
fn without_dialog_answer(command: &mut Value) {
    if command.get("type").and_then(Value::as_str) != Some("extension_ui_response") {
        return;
    }
    if let Some(Value::String(answer)) = command.get("value") {
        let len = answer.chars().count();
        command["value"] = Value::String(format!("[{len} chars]"));
    }
}

fn without_image_data(value: &mut Value) {
    match value {
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("image") {
                if let Some(Value::String(data)) = map.get("data") {
                    let len = data.len();
                    map.insert(
                        "data".into(),
                        Value::String(format!("[{len} bytes of base64]")),
                    );
                }
            }
            map.values_mut().for_each(without_image_data);
        }
        Value::Array(items) => items.iter_mut().for_each(without_image_data),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// A log directory under the OS temp dir, removed when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("piary-diag-{}-{name}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
        fn read(&self, name: &str) -> String {
            fs::read_to_string(self.0.join(name)).unwrap_or_default()
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn at(millis: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(millis)
    }

    #[test]
    fn an_entry_is_stamped_in_utc_to_the_millisecond() {
        let dir = Scratch::new("stamp");
        let mut log = Log::open(&dir.0, LOG_CAP, MAX_AGE).expect("open");
        log.append(at(1_700_000_000_123), "PAGE error boom")
            .expect("append");
        log.append(at(951_782_400_000), "leap day").expect("append");
        assert_eq!(
            dir.read(CURRENT),
            "2023-11-14T22:13:20.123Z PAGE error boom\n2000-02-29T00:00:00.000Z leap day\n"
        );
    }

    #[test]
    fn a_relaunch_appends_to_what_the_last_run_left() {
        let dir = Scratch::new("reopen");
        Log::open(&dir.0, LOG_CAP, MAX_AGE)
            .expect("open")
            .append(at(0), "first run")
            .expect("append");
        Log::open(&dir.0, LOG_CAP, MAX_AGE)
            .expect("reopen")
            .append(at(0), "second run")
            .expect("append");
        let text = dir.read(CURRENT);
        assert!(
            text.contains("first run") && text.contains("second run"),
            "{text}"
        );
    }

    #[test]
    fn past_the_cap_the_log_rotates_to_one_previous_generation() {
        let dir = Scratch::new("rotate");
        let one = entry(at(0), "x".repeat(70).as_str()).len() as u64;
        let mut log = Log::open(&dir.0, one * 2, MAX_AGE).expect("open");
        for n in 0..7 {
            log.append(at(0), &format!("{n}{}", "x".repeat(69)))
                .expect("append");
        }
        // Two entries a generation: 6 is current, 4 and 5 previous, and 0–3
        // are gone — never more than two generations on disk.
        let current = dir.read(CURRENT);
        let previous = dir.read(PREVIOUS);
        assert!(
            current.contains(" 6x") && current.lines().count() == 1,
            "{current}"
        );
        assert!(
            previous.contains(" 4x") && previous.contains(" 5x"),
            "{previous}"
        );
        assert!(!previous.contains(" 3x"), "{previous}");
        let files = fs::read_dir(&dir.0).expect("dir").count();
        assert_eq!(files, 2);
        assert!(previous.len() as u64 <= one * 2);
    }

    #[test]
    fn a_generation_past_its_age_rotates_however_small_it_is() {
        let dir = Scratch::new("age");
        let day = 24 * 60 * 60 * 1000;
        let mut log = Log::open(&dir.0, LOG_CAP, MAX_AGE).expect("open");
        log.append(at(0), "monday").expect("append");
        log.append(at(6 * day), "sunday").expect("append");
        assert!(dir.read(PREVIOUS).is_empty(), "rotated before its age");
        log.append(at(7 * day), "a week on").expect("append");
        let previous = dir.read(PREVIOUS);
        assert!(
            previous.contains("monday") && previous.contains("sunday"),
            "{previous}"
        );
        assert_eq!(dir.read(CURRENT).lines().count(), 1);
        // The new generation is aged from its own first entry, not the old one's.
        log.append(at(13 * day), "still this week").expect("append");
        assert!(dir.read(CURRENT).contains("still this week"));
        assert!(dir.read(PREVIOUS).contains("monday"));
    }

    #[test]
    fn a_line_repeated_back_to_back_is_written_once_with_its_count() {
        let dir = Scratch::new("repeat");
        let mut log = Log::open(&dir.0, LOG_CAP, MAX_AGE).expect("open");
        for _ in 0..20 {
            log.append(at(0), "PAGE error Plot.arc is not a function")
                .expect("append");
        }
        log.append(at(0), "next").expect("append");
        log.append(at(0), "next").expect("append");
        log.append(at(0), "last").expect("append");
        let text = dir.read(CURRENT);
        let lines: Vec<&str> = text.lines().map(|l| &l[25..]).collect();
        assert_eq!(
            lines,
            [
                "PAGE error Plot.arc is not a function",
                "… the line above came 19 more times",
                "next",
                "… the line above came 1 more time",
                "last",
            ],
            "{text}"
        );
    }

    #[test]
    fn a_prompt_is_recorded_whole_and_an_image_by_its_length() {
        let command = json!({
            "type": "prompt",
            "message": "fix the chart",
            "images": [{ "type": "image", "mimeType": "image/png", "data": "QUJD".repeat(10) }],
        });
        let line = pi_command_line("s1", command.as_object().expect("object"));
        assert!(line.starts_with("PI → s1 "), "{line}");
        assert!(line.contains("\"message\":\"fix the chart\""), "{line}");
        assert!(
            line.contains("[40 bytes of base64]") && !line.contains("QUJD"),
            "{line}"
        );
    }

    #[test]
    fn an_answer_to_an_extension_dialog_is_recorded_by_its_length_never_its_text() {
        // A key typed into the sign-in panel reaches pi as such an answer (ADR 0034).
        let command = json!({
            "type": "extension_ui_response",
            "id": "l2",
            "value": "{\"value\":\"sk-ant-secret\"}",
        });
        let line = pi_command_line("s1", command.as_object().expect("object"));
        assert!(!line.contains("sk-ant-secret"), "{line}");
        assert!(
            line.contains("\"id\":\"l2\"") && line.contains("[25 chars]"),
            "{line}"
        );
    }

    #[test]
    fn a_reply_says_whether_it_succeeded_and_why_not() {
        let ok = json!({ "success": true, "data": { "entries": ["a whole transcript"] } });
        assert_eq!(
            pi_reply_line("s1", "get_entries", &ok),
            "PI ← s1 get_entries ok"
        );
        let refused = json!({ "success": false, "error": "busy", "timedOut": true });
        assert_eq!(
            pi_reply_line("s1", "prompt", &refused),
            "PI ← s1 prompt failed (timed out): busy"
        );
        assert_eq!(
            pi_reply_line("s1", "abort", &Value::Null),
            "PI ← s1 abort no reply"
        );
    }

    #[test]
    fn a_streamed_partial_is_left_out_and_a_recap_is_named_only() {
        let partial = json!({ "type": "message_update", "message": { "content": "Fo" } });
        assert_eq!(pi_event_line("s1", &partial), None);
        let end = json!({ "type": "agent_end", "messages": ["everything again"] });
        assert_eq!(
            pi_event_line("s1", &end).as_deref(),
            Some("PI ← s1 event agent_end")
        );
        let done = json!({ "type": "message_end", "message": { "role": "assistant", "content": "Four." } });
        let line = pi_event_line("s1", &done).expect("recorded");
        assert!(line.contains("Four."), "{line}");
    }

    #[test]
    fn an_entry_past_its_cap_is_cut_and_says_how_much_went() {
        let dir = Scratch::new("cut");
        let mut log = Log::open(&dir.0, LOG_CAP, MAX_AGE).expect("open");
        // A multi-byte character straddling the cap must not split.
        let line = format!("{}é{}", "a".repeat(ENTRY_CAP - 1), "b".repeat(100));
        log.append(at(0), &line).expect("append");
        let text = dir.read(CURRENT);
        assert!(text.len() < ENTRY_CAP + 100, "{} bytes", text.len());
        assert!(
            text.ends_with(" … [102 more bytes cut]\n"),
            "{}",
            &text[text.len() - 40..]
        );
    }

    #[test]
    fn the_log_goes_where_the_environment_names_and_to_the_default_otherwise() {
        let default = PathBuf::from("/Library/Logs/piary");
        assert_eq!(
            log_dir(Some("/tmp/session/app-log".into()), default.clone()),
            PathBuf::from("/tmp/session/app-log")
        );
        assert_eq!(log_dir(None, default.clone()), default);
        // `PIARY_LOG_DIR=` is unset as far as a person typing it is concerned.
        assert_eq!(log_dir(Some(OsString::new()), default.clone()), default);
    }

    #[test]
    fn a_stack_trace_stays_inside_its_entry() {
        let dir = Scratch::new("trace");
        let mut log = Log::open(&dir.0, LOG_CAP, MAX_AGE).expect("open");
        log.append(at(0), "PAGE uncaught boom\nat f (main.js:1)")
            .expect("append");
        log.append(at(0), "next").expect("append");
        let text = dir.read(CURRENT);
        let unindented = text.lines().filter(|l| !l.starts_with(' ')).count();
        assert_eq!(unindented, 2, "{text}");
    }
}
