//! Whether a test harness drives this run: the decision behind the embedded
//! WebDriver server, the `Prohibited` activation policy and the windows kept
//! out of sight (`main.rs`, docs/TEST_ARCHITECTURE.md §6).
//!
//! Three conditions, deliberately: the `e2e` feature, a debug build, and
//! `PIARY_E2E=1`. The feature alone would arm the WebDriver server for any
//! developer running `cargo test --all-features`, and a port answering IPC
//! commands is not something to arm by accident. Separate from `main.rs` so the
//! decision is drivable by `cargo test`, which cannot build or run the app.
//!
//! Also here, for the same reason: what an event a driven run hands its own
//! window is to AppKit, and where in the web view it lands (ADR 0068). The
//! messages that send it are `native_input.rs`, which no test can run.

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

/// A web view as AppKit holds it, as far as placing an event in it needs.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewGeometry {
    /// How much of the view's top lies under the title bar: the page's own
    /// top is this far below the view's.
    pub top_inset: f64,
    /// The view's height, in points.
    pub height: f64,
    /// Whether the view's y runs downward, as a web view's does.
    pub flipped: bool,
}

/// Which message of the web view an event is: AppKit's own responder
/// methods, which is where a real event ends up.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Deliver {
    MouseDragged,
    MouseDown,
    MouseUp,
    ScrollWheel,
    KeyDown,
    KeyUp,
}

/// One `HarnessEvent` as AppKit is to be handed it (ADR 0068).
#[derive(Debug, Clone, PartialEq)]
pub struct NativeEvent {
    pub deliver: Deliver,
    /// The point in the view's own coordinates; a key has none and gets the
    /// view's origin.
    pub at: (f64, f64),
    /// `NSEvent`'s click count: 0 for a move.
    pub clicks: u8,
    /// A wheel's two axes as Quartz counts them, vertical then horizontal.
    pub wheel: (i32, i32),
    pub chars: String,
    pub code: u16,
    /// `NSEventModifierFlags`, as bits.
    pub modifiers: usize,
}

/// `NSEventModifierFlags`' shift, control, option and command.
const SHIFT: usize = 1 << 17;
const CONTROL: usize = 1 << 18;
const OPTION: usize = 1 << 19;
const COMMAND: usize = 1 << 20;

/// The top of the page lies under the title bar by the difference between the
/// content view and the part of it the window lays content out in.
#[cfg_attr(not(all(feature = "e2e", debug_assertions)), allow(dead_code))]
pub fn top_inset(content_height: f64, layout_height: f64) -> f64 {
    (content_height - layout_height).max(0.0)
}

/// A point of the page as a point of the view.
fn in_view(x: f64, y: f64, view: ViewGeometry) -> (f64, f64) {
    let down = y + view.top_inset;
    (
        x,
        if view.flipped {
            down
        } else {
            view.height - down
        },
    )
}

/// What to hand AppKit for one event.
///
/// A move is a left-mouse-dragged event with no button down: a mouse-moved
/// event handed to a driven window's view reaches the page as nothing, and
/// this one reaches it as a move. A wheel's signs are turned, because Quartz counts the way
/// the content travels and the page the way the view does.
#[cfg_attr(not(all(feature = "e2e", debug_assertions)), allow(dead_code))]
pub fn native_event(event: &crate::wire::HarnessEvent, view: ViewGeometry) -> NativeEvent {
    use crate::wire::HarnessEvent;
    let blank = NativeEvent {
        deliver: Deliver::MouseDragged,
        at: in_view(0.0, 0.0, view),
        clicks: 0,
        wheel: (0, 0),
        chars: String::new(),
        code: 0,
        modifiers: 0,
    };
    let held = |shift: bool, control: bool, option: bool, command: bool| {
        [
            (shift, SHIFT),
            (control, CONTROL),
            (option, OPTION),
            (command, COMMAND),
        ]
        .into_iter()
        .filter(|(on, _)| *on)
        .fold(0, |bits, (_, bit)| bits | bit)
    };
    match event {
        HarnessEvent::Move { x, y } => NativeEvent {
            at: in_view(*x, *y, view),
            ..blank
        },
        HarnessEvent::Down { x, y, clicks } => NativeEvent {
            deliver: Deliver::MouseDown,
            at: in_view(*x, *y, view),
            clicks: (*clicks).max(1),
            ..blank
        },
        HarnessEvent::Up { x, y, clicks } => NativeEvent {
            deliver: Deliver::MouseUp,
            at: in_view(*x, *y, view),
            clicks: (*clicks).max(1),
            ..blank
        },
        HarnessEvent::Wheel { x, y, dx, dy } => NativeEvent {
            deliver: Deliver::ScrollWheel,
            at: in_view(*x, *y, view),
            wheel: (-dy.round() as i32, -dx.round() as i32),
            ..blank
        },
        HarnessEvent::KeyDown {
            chars,
            code,
            shift,
            control,
            option,
            command,
        } => NativeEvent {
            deliver: Deliver::KeyDown,
            chars: chars.clone(),
            code: *code,
            modifiers: held(*shift, *control, *option, *command),
            ..blank
        },
        HarnessEvent::KeyUp {
            chars,
            code,
            shift,
            control,
            option,
            command,
        } => NativeEvent {
            deliver: Deliver::KeyUp,
            chars: chars.clone(),
            code: *code,
            modifiers: held(*shift, *control, *option, *command),
            ..blank
        },
    }
}

/// Where a wheel event says it is. The event AppKit makes from a Quartz one
/// has no window, and a web view reads its location as its window's own
/// coordinates: so the point handed to Quartz, whose y runs down from the top
/// of the main display, is the point in the window turned over.
#[cfg_attr(not(all(feature = "e2e", debug_assertions)), allow(dead_code))]
pub fn wheel_location(in_window: (f64, f64), display_height: f64) -> (f64, f64) {
    (in_window.0, display_height - in_window.1)
}

#[cfg(test)]
mod tests {
    use super::{
        driven, face_source, native_event, top_inset, update_source, wheel_location, Deliver,
        ViewGeometry,
    };
    use crate::wire::{FaceSource, HarnessEvent, UpdateSource};

    /// A web view 760 points high whose top 28 lie under the title bar.
    const VIEW: ViewGeometry = ViewGeometry {
        top_inset: 28.0,
        height: 760.0,
        flipped: true,
    };

    #[test]
    fn the_page_starts_below_the_title_bar() {
        assert_eq!(top_inset(760.0, 732.0), 28.0);
        // A window with no title bar over its content has no inset, and a
        // layout rect taller than the view is not a negative one.
        assert_eq!(top_inset(732.0, 732.0), 0.0);
        assert_eq!(top_inset(700.0, 732.0), 0.0);
        let down = native_event(
            &HarnessEvent::Down {
                x: 400.0,
                y: 100.0,
                clicks: 1,
            },
            VIEW,
        );
        assert_eq!(down.at, (400.0, 128.0));
    }

    #[test]
    fn a_view_whose_y_runs_upward_is_turned_over() {
        let up = ViewGeometry {
            flipped: false,
            ..VIEW
        };
        let at = native_event(&HarnessEvent::Move { x: 10.0, y: 100.0 }, up).at;
        assert_eq!(at, (10.0, 632.0));
    }

    #[test]
    fn a_move_is_a_drag_with_no_button_and_a_press_carries_its_count() {
        let moved = native_event(&HarnessEvent::Move { x: 1.0, y: 2.0 }, VIEW);
        assert_eq!((moved.deliver, moved.clicks), (Deliver::MouseDragged, 0));
        let second = native_event(
            &HarnessEvent::Down {
                x: 1.0,
                y: 2.0,
                clicks: 2,
            },
            VIEW,
        );
        assert_eq!((second.deliver, second.clicks), (Deliver::MouseDown, 2));
        // A press that names no count is still one click, never none.
        let unnamed = native_event(
            &HarnessEvent::Up {
                x: 1.0,
                y: 2.0,
                clicks: 0,
            },
            VIEW,
        );
        assert_eq!((unnamed.deliver, unnamed.clicks), (Deliver::MouseUp, 1));
    }

    #[test]
    fn a_wheel_that_scrolls_the_page_down_is_content_travelling_up() {
        let wheel = native_event(
            &HarnessEvent::Wheel {
                x: 300.0,
                y: 200.0,
                dx: 200.0,
                dy: 240.0,
            },
            VIEW,
        );
        assert_eq!(wheel.deliver, Deliver::ScrollWheel);
        // Vertical first, then horizontal, each with its sign turned.
        assert_eq!(wheel.wheel, (-240, -200));
        assert_eq!(wheel.at, (300.0, 228.0));
    }

    #[test]
    fn a_wheel_event_names_its_point_in_the_window_from_the_top_of_the_display() {
        assert_eq!(wheel_location((358.0, 462.0), 956.0), (358.0, 494.0));
    }

    #[test]
    fn a_key_carries_what_it_types_its_code_and_the_modifiers_held() {
        let tab = native_event(
            &HarnessEvent::KeyDown {
                chars: "\t".into(),
                code: 48,
                shift: true,
                control: false,
                option: false,
                command: false,
            },
            VIEW,
        );
        assert_eq!(tab.deliver, Deliver::KeyDown);
        assert_eq!((tab.chars.as_str(), tab.code), ("\t", 48));
        assert_eq!(tab.modifiers, 1 << 17);
        let all = native_event(
            &HarnessEvent::KeyUp {
                chars: "k".into(),
                code: 40,
                shift: true,
                control: true,
                option: true,
                command: true,
            },
            VIEW,
        );
        assert_eq!(all.deliver, Deliver::KeyUp);
        assert_eq!(all.modifiers, (1 << 17) | (1 << 18) | (1 << 19) | (1 << 20));
    }

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
