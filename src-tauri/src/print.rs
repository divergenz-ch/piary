//! A webview's page written out as a PDF, by the system's own print path.
//!
//! WebKit lays the page out for paper, with its print styles, and AppKit
//! writes the pages to a file: the print operation is given a file to save to
//! instead of a printer, and shows neither the print panel nor a progress
//! panel.

use std::cell::RefCell;
use std::ffi::c_void;
use std::path::Path;
use std::sync::mpsc::Sender;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, Sel};
use objc2::{define_class, msg_send, sel, DefinedClass, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSString, NSURL};

/// The page's margin on every side, in points: half an inch.
const MARGIN_PT: f64 = 36.0;

struct Ivars {
    done: Sender<bool>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and `Done` is only
    // made and messaged on the main thread.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "PiaryPrintDone"]
    #[ivars = Ivars]
    struct Done;

    impl Done {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _operation: &AnyObject, success: bool, _context: *mut c_void) {
            let _ = self.ivars().done.send(success);
            // The operation does not keep its delegate, so `WAITING` did.
            WAITING.with_borrow_mut(|waiting| {
                waiting.retain(|held| !std::ptr::eq(&**held, self));
            });
        }
    }

    unsafe impl NSObjectProtocol for Done {}
);

thread_local! {
    /// The delegates of the operations still running, kept alive until each
    /// is told its operation ran.
    static WAITING: RefCell<Vec<Retained<Done>>> = const { RefCell::new(Vec::new()) };
}

/// Starts writing what `webview` shows to `dest` as a PDF, and sends on `done`
/// whether it was written, once it has been.
///
/// # Safety
///
/// `webview` is a live `WKWebView` that is in a window.
pub unsafe fn start(
    mtm: MainThreadMarker,
    webview: *mut c_void,
    dest: &Path,
    done: Sender<bool>,
) -> Result<(), String> {
    let webview: &AnyObject = unsafe { &*webview.cast() };
    let window: Option<Retained<AnyObject>> = unsafe { msg_send![webview, window] };
    let window = window.ok_or("the page is in no window")?;

    // A copy: the shared one is what the app's own Print would start from.
    let info: Retained<NSPrintInfo> = unsafe { msg_send![&*NSPrintInfo::sharedPrintInfo(), copy] };
    info.setTopMargin(MARGIN_PT);
    info.setBottomMargin(MARGIN_PT);
    info.setLeftMargin(MARGIN_PT);
    info.setRightMargin(MARGIN_PT);
    info.setHorizontallyCentered(false);
    info.setVerticallyCentered(false);
    unsafe {
        info.setJobDisposition(NSPrintSaveJob);
        let url = NSURL::fileURLWithPath(&NSString::from_str(&dest.to_string_lossy()));
        let settings: Retained<AnyObject> = msg_send![&*info, dictionary];
        let _: () = msg_send![&*settings, setObject: &*url, forKey: NSPrintJobSavingURL];
    }

    let operation: Option<Retained<AnyObject>> =
        unsafe { msg_send![webview, printOperationWithPrintInfo: &*info] };
    let operation = operation.ok_or("the page gave no print operation")?;
    let delegate: Retained<Done> = {
        let this = Done::alloc(mtm).set_ivars(Ivars { done });
        unsafe { msg_send![super(this), init] }
    };
    unsafe {
        let _: () = msg_send![&*operation, setShowsPrintPanel: false];
        let _: () = msg_send![&*operation, setShowsProgressPanel: false];
        // WebKit's print view starts with no size, and an operation run on a
        // view of no size writes no pages.
        let view: Option<Retained<AnyObject>> = msg_send![&*operation, view];
        if let Some(view) = view {
            let frame = NSRect::new(NSPoint::new(0.0, 0.0), info.paperSize());
            let _: () = msg_send![&*view, setFrame: frame];
        }
        let did_run: Sel = sel!(printOperationDidRun:success:contextInfo:);
        WAITING.with_borrow_mut(|waiting| waiting.push(delegate.clone()));
        let _: () = msg_send![
            &*operation,
            runOperationModalForWindow: &*window,
            delegate: &*delegate,
            didRunSelector: did_run,
            contextInfo: std::ptr::null_mut::<c_void>(),
        ];
    }
    Ok(())
}
