//! Whether a test harness drives this run: the decision behind the embedded
//! WebDriver server, the `Prohibited` activation policy and the windows kept
//! out of sight (`main.rs`, docs/TEST_ARCHITECTURE.md §6).
//!
//! Three conditions, deliberately: the `e2e` feature, a debug build, and
//! `PIARY_E2E=1`. The feature alone would arm the WebDriver server for any
//! developer running `cargo test --all-features`, and a port answering IPC
//! commands is not something to arm by accident. Separate from `main.rs` so the
//! decision is drivable by `cargo test`, which cannot build or run the app.

/// `compiled_in` is the feature-and-debug half, decided at compile time;
/// `armed` is the `PIARY_E2E` variable as read, if it is set at all.
pub fn driven(compiled_in: bool, armed: Option<&str>) -> bool {
    compiled_in && armed == Some("1")
}

/// What reads the face in this run (`app/face/index.ts`, ADR 0058). A driven
/// run never gets the camera: a test that opened it would need a person in
/// front of it and would light the user's camera while they work. It gets the
/// script it was handed (`PIARY_FACE_SCRIPT`'s file, read by the caller), or
/// nothing. Every other run gets the camera.
pub fn face_source(driven: bool, script: Option<String>) -> crate::wire::FaceSource {
    use crate::wire::FaceSource;
    match (driven, script) {
        (false, _) => FaceSource::Camera,
        (true, Some(script)) => FaceSource::Script { script },
        (true, None) => FaceSource::None,
    }
}

/// Where this run asks whether a newer Piary exists (ADR 0064). A driven run
/// never asks GitHub: a suite that did would make a request per launch from
/// whoever runs it, and would pass or fail by what is released that day. It
/// gets the answer it was handed (`PIARY_UPDATE_SCRIPT`'s file, read by the
/// caller), or asks nothing. Every other run asks GitHub.
pub fn update_source(driven: bool, script: Option<String>) -> crate::wire::UpdateSource {
    use crate::wire::UpdateSource;
    match (driven, script) {
        (false, _) => UpdateSource::Github,
        (true, Some(answer)) => UpdateSource::Script { answer },
        (true, None) => UpdateSource::None,
    }
}

#[cfg(test)]
mod tests {
    use super::{driven, face_source, update_source};
    use crate::wire::{FaceSource, UpdateSource};

    #[test]
    fn a_driven_run_asks_a_script_or_nothing_and_never_github() {
        assert_eq!(update_source(true, None), UpdateSource::None);
        assert_eq!(
            update_source(true, Some("{}".into())),
            UpdateSource::Script {
                answer: "{}".into()
            }
        );
    }

    #[test]
    fn a_run_nobody_drives_asks_github_whatever_script_is_lying_about() {
        assert_eq!(update_source(false, None), UpdateSource::Github);
        assert_eq!(
            update_source(false, Some("{}".into())),
            UpdateSource::Github
        );
    }

    #[test]
    fn a_driven_run_reads_a_script_or_nothing_and_never_the_camera() {
        assert_eq!(face_source(true, None), FaceSource::None);
        assert_eq!(
            face_source(true, Some("[]".into())),
            FaceSource::Script {
                script: "[]".into()
            }
        );
    }

    #[test]
    fn a_run_nobody_drives_reads_the_camera_whatever_script_is_lying_about() {
        assert_eq!(face_source(false, None), FaceSource::Camera);
        assert_eq!(face_source(false, Some("[]".into())), FaceSource::Camera);
    }

    #[test]
    fn a_build_with_the_harness_compiled_in_is_driven_only_when_armed() {
        assert!(driven(true, Some("1")));
        assert!(!driven(true, None), "unset is not armed");
    }

    #[test]
    fn only_the_exact_value_arms_it() {
        for value in ["0", "true", "yes", " 1", "1 ", ""] {
            assert!(
                !driven(true, Some(value)),
                "{value:?} must not arm the harness"
            );
        }
    }

    #[test]
    fn a_build_without_the_harness_is_never_driven_whatever_the_environment() {
        assert!(!driven(false, Some("1")));
        assert!(!driven(false, None));
    }
}
