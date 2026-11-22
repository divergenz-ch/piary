//! Every type that crosses the IPC boundary, declared once.
//!
//! `ts-rs` exports these to `src/bridge-types.ts`, which `src/bridge.ts`
//! imports — so the page and the Rust side cannot disagree about a payload
//! without the compiler saying so on one end or the other. A hand-written
//! TypeScript copy of a wire type drifts: a seam only holds while something
//! checks it.
//!
//! Regenerate with `cargo test export_bindings` (wired into `pnpm verify:rust`).
//! The generated file is committed, because `pnpm typecheck` must not need a
//! Rust toolchain to run.
//!
//! This module holds no `tauri::` types, which is what lets `cargo test` drive
//! it without an app (ADR 0014).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One assertion's outcome, as the page reports it to whoever launched the app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub name: String,
    pub passed: bool,
    pub detail: Option<String>,
}

/// What the page reports when a window moved or resized, and what it gets back
/// when asking where a window should open.
/// One row of a conversation's extension menu.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRow {
    pub source: String,
    pub name: Option<String>,
    pub scope: String,
    pub enabled: bool,
    pub pinned_off: bool,
    pub files: u32,
    /// Piary's own package: listed, never offered to be turned off.
    pub own: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct WindowBox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Which overlay primitives this platform actually honoured.
///
/// Reported rather than assumed: the capture overlay (ADR 0015) needs
/// always-on-top, transparency and click-through, and finding out one of them
/// misbehaves while building the capture feature would be expensive. A window
/// answers for itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct OverlaySupport {
    pub always_on_top: bool,
    pub click_through: bool,
    pub all_workspaces: bool,
    pub undecorated: bool,
}

/// What the page asks for when it opens a terminal.
///
/// A struct rather than eight parameters: the command surface takes it as one
/// serde payload, which is also how the page already sends it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct TerminalRequest {
    /// Which session owns the terminal.
    pub sid: String,
    /// The page's id for this terminal — also the `pi:view` id it renders into.
    pub term_id: String,
    /// The program to run, or empty for the user's login shell. Ignored when
    /// `pi` is set.
    pub command: String,
    /// Run the user's own pi, resolved as it is for a session (ADR 0004),
    /// rather than `command`: which pi that is, is Rust's to know.
    pub pi: bool,
    /// What pi is given. A `command` always runs with none.
    pub args: Vec<String>,
    /// Where it runs, or empty for the workspace.
    pub cwd: String,
    /// From the rendered grid, so the program's winsize matches what the reader
    /// is looking at. Absent before the page has measured one.
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// How the user chose the app to behave (ADR 0048). Every window gets the
/// whole of it, at boot and again on each change.
///
/// `default` on the container: a key the file lacks is its default, so adding
/// a preference never invalidates a file written before it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    /// A faint, slow wash over the artifact a run is working on, while its
    /// cell chip is blue. Off, the chip alone says it. The lock on that
    /// artifact is not a preference.
    pub cell_work_pulse: bool,
    /// The camera reads the user's face while they type, and a message may
    /// carry what it saw to the agent as a block of plain words
    /// (`docs/face-format.md`). Off, nothing reads a face and pi is told
    /// nothing of one.
    pub face: bool,
    /// The user has read what reading their face sends, and to whom, and
    /// agreed. Until then nothing reads a face, whatever `face` says
    /// (ADR 0057).
    pub face_explained: bool,
    /// The camera the user chose to be read by, as the system labels it. Empty,
    /// the app picks one: never a phone's.
    pub face_camera: String,
    /// What of the face is passed on, as the user set it where the reading
    /// is shown (ADR 0059).
    pub face_tuning: FaceReading,
    /// The agent may say a sentence or two without being asked, when the
    /// user's face moved at an answer and no message followed (ADR 0061).
    /// It means something only while a face is read.
    pub face_speaks: bool,
}

/// How the user tuned the reading of their face: what is too weak or too
/// short to pass on, and how far the head may turn before nothing is read.
/// The page holds each to the values it offers (`app/face/state.ts`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase", default)]
pub struct FaceReading {
    /// The weakest intensity passed on, as FACS's letter.
    pub intensity: String,
    /// The shortest a movement is held to be passed on, in milliseconds.
    pub min_ms: u32,
    /// How far the head may turn, and tip, off its rest with the face still
    /// read, in degrees.
    pub yaw: u32,
    pub pitch: u32,
}

impl Default for FaceReading {
    /// The reading as it was measured (`docs/face-format.md` §The filter).
    fn default() -> Self {
        Self {
            intensity: "C".into(),
            min_ms: 500,
            yaw: 12,
            pitch: 10,
        }
    }
}

impl Preferences {
    /// Whether a face is read at all: the switch is on and the user has agreed
    /// to what it sends. What a pi is told follows this, as the page does.
    pub fn reads_face(&self) -> bool {
        self.face && self.face_explained
    }
}

impl Default for Preferences {
    /// The behaviour the app has with no file.
    fn default() -> Self {
        Self {
            cell_work_pulse: true,
            face: false,
            face_explained: false,
            face_camera: String::new(),
            face_tuning: FaceReading::default(),
            face_speaks: false,
        }
    }
}

/// What the host sends a page when it is about to close it or quit: end the
/// running turn, write the buffer, then answer (ADR 0019 §2, steps 2–3).
///
/// The page's bound for ending its turn travels with the request, so it is
/// declared once, beside the host's own bound that has to outlast it
/// (`exit::TURN_END_BOUND`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct FlushRequest {
    pub turn_bound_ms: u32,
}

/// An attachment the store just took in: the document's `FileRef` (the
/// format's §Attachments) plus its size. `url` is site-relative,
/// `/attachments/<stored name>`; `name` is what the document's link shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct Stored {
    pub id: String,
    /// Sniffed from the bytes, never the page's claim.
    pub mime: String,
    pub url: String,
    pub name: String,
    /// In bytes. Never over `attachments::MAX_BYTES`, which fits a `u32` and
    /// so crosses as a plain number.
    pub size: u32,
}

/// One conversation an export is asked for: its id, and the stored names of
/// the attachments its document references, which the page read out of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub id: String,
    pub attachments: Vec<String>,
}

/// What became of one conversation of an export.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct ExportedOne {
    pub id: String,
    /// The name of the file or folder written, inside the folder chosen.
    pub name: String,
    /// Attachments the document references that the store does not hold, by
    /// stored name: the export went ahead without them.
    pub missing: Vec<String>,
    /// Why this conversation was not written, when it was not. The others of
    /// the same export are not held up by it.
    pub error: Option<String>,
}

/// What an export came to: the folder the user chose, by its name alone, and
/// each conversation's outcome in the order asked.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    pub folder: String,
    pub conversations: Vec<ExportedOne>,
}

/// An import the user picked, read and held until the page places it
/// (ADR 0049). The page never learns where it came from: `token` names it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct ImportStaged {
    pub token: String,
    /// The file's name without `.md`: the id it asks for.
    pub name: String,
    pub content: String,
    /// The stored names of the attachments it carries.
    pub attachments: Vec<String>,
}

/// What placing an import's attachments came to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct ImportPlaced {
    /// A carried file stored under another name, old → new: the document's
    /// links must follow before it is written.
    pub renames: std::collections::BTreeMap<String, String>,
    /// Referenced names that neither the import nor the store holds.
    pub broken: Vec<String>,
}

/// One conversation as the list shows it: the document's id, and when its file
/// last changed, in milliseconds since the Unix epoch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    pub id: String,
    pub modified_ms: f64,
}

/// What reads the user's face in this run (`harness::face_source`): the
/// camera, a script standing in for one, or nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FaceSource {
    Camera,
    /// The text of the script, for `app/face/scripted.ts` to read.
    Script {
        script: String,
    },
    None,
}

/// What a suite's run came to: how many assertions were made and how many of
/// them failed. Returned rather than only printed, so a caller inside the page
/// can act on the verdict too.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bridge-types.ts")]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub total: u32,
    pub failures: u32,
}

impl Verdict {
    /// Tallies a batch of reports.
    pub fn of(reports: &[Report]) -> Self {
        Self {
            total: reports.len() as u32,
            failures: reports.iter().filter(|report| !report.passed).count() as u32,
        }
    }

    /// The exit code this verdict means: 0 only when nothing failed.
    pub fn exit_code(&self) -> i32 {
        if self.failures == 0 {
            0
        } else {
            1
        }
    }

    /// The line a harness greps for. Prefixed so ordinary page output cannot be
    /// mistaken for a result.
    pub fn summary(&self) -> String {
        format!("PROBE DONE failures={}", self.failures)
    }
}

/// How one report prints. A harness reads these lines; a human reads them too,
/// which is why the detail is appended rather than encoded.
pub fn format_report(report: &Report) -> String {
    let mark = if report.passed { "PASS" } else { "FAIL" };
    match &report.detail {
        Some(detail) => format!("PROBE {mark} {} — {detail}", report.name),
        None => format!("PROBE {mark} {}", report.name),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(name: &str, passed: bool) -> Report {
        Report {
            name: name.into(),
            passed,
            detail: None,
        }
    }

    #[test]
    fn a_face_is_read_only_with_the_switch_on_and_agreed_to() {
        let kept = |face, face_explained| Preferences {
            face,
            face_explained,
            ..Preferences::default()
        };
        assert!(kept(true, true).reads_face());
        // Switched on in the Preferences window, the sheet not yet agreed to.
        assert!(!kept(true, false).reads_face());
        // Agreed to once, and switched off since.
        assert!(!kept(false, true).reads_face());
        assert!(!Preferences::default().reads_face());
    }

    #[test]
    fn a_verdict_counts_only_the_failures() {
        let reports = [report("a", true), report("b", false), report("c", true)];
        let verdict = Verdict::of(&reports);
        assert_eq!(verdict.total, 3);
        assert_eq!(verdict.failures, 1);
    }

    #[test]
    fn an_empty_run_passes() {
        // A suite that asserted nothing has failed nothing. The vacuous case is
        // caught by the harness noticing no PROBE lines, not by an exit code
        // here — so this is deliberately 0 rather than an error.
        let verdict = Verdict::of(&[]);
        assert_eq!(verdict.exit_code(), 0);
        assert_eq!(verdict.total, 0);
    }

    #[test]
    fn one_failure_is_enough_to_fail_the_run() {
        let verdict = Verdict::of(&[report("a", true), report("b", false)]);
        assert_eq!(verdict.exit_code(), 1);
        // The paired assertion: an all-passing run of the same size must be 0,
        // so a mistake in the comparison cannot pass both tests.
        assert_eq!(
            Verdict::of(&[report("a", true), report("b", true)]).exit_code(),
            0
        );
    }

    #[test]
    fn a_report_prints_its_detail_when_it_has_one() {
        let plain = format_report(&report("bare", true));
        assert_eq!(plain, "PROBE PASS bare");
        let detailed = format_report(&Report {
            name: "with detail".into(),
            passed: false,
            detail: Some("7 lines".into()),
        });
        assert_eq!(detailed, "PROBE FAIL with detail — 7 lines");
    }

    #[test]
    fn the_summary_names_the_failure_count() {
        assert_eq!(
            Verdict::of(&[report("a", false)]).summary(),
            "PROBE DONE failures=1"
        );
    }
}
