//! Whether a newer Piary exists: when the app may ask, and what it last heard
//! (ADR 0063).
//!
//! The request itself is the page's: Rust holds no HTTP client. What is kept
//! here is what must be one for the app rather than one per window: the turn
//! to ask, so several windows make one request an hour between them, and the
//! newest release tag any of them read, so a window opened later shows it
//! without asking.
//!
//! No `tauri::` types (ADR 0014).

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long after one check the next may be made. GitHub allows a machine
/// without a token sixty requests an hour; one is far inside that, and a
/// release is heard of within the hour.
pub const CHECK_EVERY: Duration = Duration::from_secs(60 * 60);

/// Names a file a driven run answers the check with, in place of GitHub
/// (`harness::update_source`).
pub const SCRIPT_ENV: &str = "PIARY_UPDATE_SCRIPT";

/// The event every window hears when a check read a release tag, with the tag.
pub const LATEST_EVENT: &str = "update-latest";

/// The longest tag kept. A version is a few characters; anything longer is
/// not one, and is not held for every window to be handed.
const TAG_CAP: usize = 64;

#[derive(Default)]
struct Kept {
    checked: Option<Instant>,
    latest: Option<String>,
}

/// The app's one record of its checks.
#[derive(Default)]
pub struct Updates(Mutex<Kept>);

impl Updates {
    /// Whether whoever asks at `now` may make a check, and takes the turn if
    /// so: the next is refused until `CHECK_EVERY` has passed. With `wanted`
    /// false (the preference is off) the answer is no and no turn is taken, so
    /// the first ask after it is switched on is granted.
    pub fn claim(&self, now: Instant, wanted: bool) -> bool {
        if !wanted {
            return false;
        }
        let mut kept = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let due = kept
            .checked
            .is_none_or(|last| now.saturating_duration_since(last) >= CHECK_EVERY);
        if due {
            kept.checked = Some(now);
        }
        due
    }

    /// Takes the turn at `now` whatever the hour says: the user asked for a
    /// check. The next unasked one is an hour after it.
    pub fn take(&self, now: Instant) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).checked = Some(now);
    }

    /// Keeps `tag` as the newest release heard of. Answers whether it was
    /// kept: an empty or overlong one is not.
    pub fn found(&self, tag: &str) -> bool {
        if tag.is_empty() || tag.len() > TAG_CAP {
            return false;
        }
        self.0.lock().unwrap_or_else(|e| e.into_inner()).latest = Some(tag.to_owned());
        true
    }

    /// The newest release tag heard of since launch, if any.
    pub fn latest(&self) -> Option<String> {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .latest
            .clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_first_ask_is_granted_and_the_next_only_after_the_interval() {
        let updates = Updates::default();
        let start = Instant::now();
        assert!(updates.claim(start, true));
        // A second window asking a moment later, and one just short of the hour.
        assert!(!updates.claim(start + Duration::from_secs(5), true));
        assert!(!updates.claim(start + CHECK_EVERY - Duration::from_secs(1), true));
        assert!(updates.claim(start + CHECK_EVERY, true));
        // The turn just taken is the one counted from.
        assert!(!updates.claim(start + CHECK_EVERY + Duration::from_secs(5), true));
    }

    #[test]
    fn with_the_preference_off_nothing_is_granted_and_no_turn_is_taken() {
        let updates = Updates::default();
        let start = Instant::now();
        assert!(!updates.claim(start, false));
        assert!(!updates.claim(start + CHECK_EVERY, false));
        // Switched on: the asks made while it was off cost nothing.
        assert!(updates.claim(start + CHECK_EVERY + Duration::from_secs(1), true));
    }

    #[test]
    fn a_check_the_user_asked_for_is_the_turn_the_hour_counts_from() {
        let updates = Updates::default();
        let start = Instant::now();
        assert!(updates.claim(start, true));
        let asked = start + Duration::from_secs(600);
        updates.take(asked);
        assert!(!updates.claim(start + CHECK_EVERY, true));
        assert!(updates.claim(asked + CHECK_EVERY, true));
    }

    #[test]
    fn the_last_tag_found_is_the_one_kept() {
        let updates = Updates::default();
        assert_eq!(updates.latest(), None);
        assert!(updates.found("v0.2.0"));
        assert!(updates.found("v0.3.0"));
        assert_eq!(updates.latest().as_deref(), Some("v0.3.0"));
    }

    #[test]
    fn what_is_no_tag_is_not_kept() {
        let updates = Updates::default();
        assert!(updates.found("v0.2.0"));
        assert!(!updates.found(""));
        assert!(!updates.found(&"9".repeat(TAG_CAP + 1)));
        assert_eq!(updates.latest().as_deref(), Some("v0.2.0"));
    }
}
