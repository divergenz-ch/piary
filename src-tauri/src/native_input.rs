//! Events handed to a driven window as the system would hand them.
//!
//! WebDriver's own clicks and keys on macOS are made in the page by script: no
//! hover follows them, WebKit places no caret for them, and a page that asks
//! whether an event is trusted is told no. A real event has to come through
//! AppKit, and one posted to the system would move the user's cursor and land
//! in whatever app is in front. So the event is made here, in the process, and
//! given straight to the web view's own responder methods: WebKit hit-tests,
//! hovers, focuses and types as it does for a hand, and nothing outside the
//! process hears of it (ADR 0068).
//!
//! Only in a debug build with the `e2e` feature, as the embedded WebDriver
//! server is: a release build holds none of this. What an event is, and where
//! it lands, is `harness::native_event`, which `cargo test` drives; this file
//! is the messages.

use std::ffi::c_void;

use objc2::runtime::{AnyClass, AnyObject, Bool, Sel};
use objc2::{class, msg_send, sel};
use objc2_foundation::{NSPoint, NSRect, NSString};

use crate::harness::{self, Deliver, ViewGeometry};
use crate::wire::{HarnessEvent, HarnessSent};

/// `NSEventType`'s left mouse down, left mouse up, left mouse dragged, key
/// down and key up.
const LEFT_DOWN: usize = 1;
const LEFT_UP: usize = 2;
const LEFT_DRAGGED: usize = 6;
const KEY_DOWN: usize = 10;
const KEY_UP: usize = 11;

/// `kCGScrollEventUnitPixel`, and the two axes a wheel event here has.
const PIXELS: u32 = 0;
const AXES: u32 = 2;

// Quartz makes the one event AppKit has no constructor for, a scroll. It is
// made and converted, never posted: nothing here reaches the system's event
// stream.
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreateScrollWheelEvent2(
        source: *const c_void,
        units: u32,
        wheel_count: u32,
        wheel1: i32,
        wheel2: i32,
        wheel3: i32,
    ) -> *mut c_void;
    fn CGEventSetLocation(event: *mut c_void, location: NSPoint);
    fn CGMainDisplayID() -> u32;
    fn CGDisplayPixelsHigh(display: u32) -> usize;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: *const c_void);
}

/// The `WKWebView` at or under `view`, or null.
///
/// # Safety
/// `view` is null or a live `NSView`, on the main thread.
unsafe fn web_view_in(view: *mut AnyObject, web_view: &AnyClass) -> *mut AnyObject {
    if view.is_null() {
        return view;
    }
    let is: Bool = msg_send![view, isKindOfClass: web_view];
    if is.as_bool() {
        return view;
    }
    let subviews: *mut AnyObject = msg_send![view, subviews];
    let count: usize = msg_send![subviews, count];
    for index in 0..count {
        let found = web_view_in(msg_send![subviews, objectAtIndex: index], web_view);
        if !found.is_null() {
            return found;
        }
    }
    std::ptr::null_mut()
}

/// Where the system's cursor is, in screen points.
fn cursor() -> (f64, f64) {
    // SAFETY: a class method that reads the cursor's position and changes
    // nothing.
    let at: NSPoint = unsafe { msg_send![class!(NSEvent), mouseLocation] };
    (at.x, at.y)
}

/// Hands `event` to the web view of `ns_window`.
///
/// # Safety
/// `ns_window` is a live `NSWindow`, and the call is on the main thread.
pub unsafe fn send(ns_window: *mut c_void, event: &HarnessEvent) -> Result<HarnessSent, String> {
    let window = ns_window.cast::<AnyObject>();
    let cursor_before = cursor();

    let class = AnyClass::get(c"WKWebView").ok_or("WebKit is not loaded")?;
    let content: *mut AnyObject = msg_send![window, contentView];
    let web = web_view_in(content, class);
    if web.is_null() {
        return Err("the window has no web view".into());
    }
    let flipped: Bool = msg_send![web, isFlipped];
    let bounds: NSRect = msg_send![web, bounds];
    let content_bounds: NSRect = msg_send![content, bounds];
    let layout: NSRect = msg_send![window, contentLayoutRect];
    let native = harness::native_event(
        event,
        ViewGeometry {
            top_inset: harness::top_inset(content_bounds.size.height, layout.size.height),
            height: bounds.size.height,
            flipped: flipped.as_bool(),
        },
    );

    let no_view: *mut AnyObject = std::ptr::null_mut();
    let in_window: NSPoint =
        msg_send![web, convertPoint: NSPoint::new(native.at.0, native.at.1), toView: no_view];
    let number: isize = msg_send![window, windowNumber];
    let process: *mut AnyObject = msg_send![class!(NSProcessInfo), processInfo];
    let now: f64 = msg_send![process, systemUptime];
    let no_context: *mut AnyObject = std::ptr::null_mut();

    let mouse = |kind: usize, pressure: f32| -> *mut AnyObject {
        msg_send![class!(NSEvent),
            mouseEventWithType: kind, location: in_window, modifierFlags: native.modifiers,
            timestamp: now, windowNumber: number, context: no_context, eventNumber: 0isize,
            clickCount: native.clicks as isize, pressure: pressure]
    };
    let key = |kind: usize| -> *mut AnyObject {
        let chars = NSString::from_str(&native.chars);
        msg_send![class!(NSEvent),
            keyEventWithType: kind, location: in_window, modifierFlags: native.modifiers,
            timestamp: now, windowNumber: number, context: no_context, characters: &*chars,
            charactersIgnoringModifiers: &*chars, isARepeat: false, keyCode: native.code]
    };
    let (made, message): (*mut AnyObject, Sel) = match native.deliver {
        Deliver::MouseDragged => (mouse(LEFT_DRAGGED, 0.0), sel!(mouseDragged:)),
        Deliver::MouseDown => (mouse(LEFT_DOWN, 1.0), sel!(mouseDown:)),
        Deliver::MouseUp => (mouse(LEFT_UP, 0.0), sel!(mouseUp:)),
        Deliver::KeyDown => (key(KEY_DOWN), sel!(keyDown:)),
        Deliver::KeyUp => (key(KEY_UP), sel!(keyUp:)),
        Deliver::ScrollWheel => {
            let scroll = CGEventCreateScrollWheelEvent2(
                std::ptr::null(),
                PIXELS,
                AXES,
                native.wheel.0,
                native.wheel.1,
                0,
            );
            if scroll.is_null() {
                return Err("Quartz made no scroll event".into());
            }
            let display = CGDisplayPixelsHigh(CGMainDisplayID()) as f64;
            let at = harness::wheel_location((in_window.x, in_window.y), display);
            CGEventSetLocation(scroll, NSPoint::new(at.0, at.1));
            let made: *mut AnyObject = msg_send![class!(NSEvent), eventWithCGEvent: scroll];
            CFRelease(scroll);
            (made, sel!(scrollWheel:))
        }
    };
    if made.is_null() {
        return Err("AppKit made no event".into());
    }
    let _: *mut AnyObject = msg_send![web, performSelector: message, withObject: made];

    let key_window: Bool = msg_send![window, isKeyWindow];
    Ok(HarnessSent {
        cursor_before,
        cursor_after: cursor(),
        key_window: key_window.as_bool(),
    })
}
