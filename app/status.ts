// The status line (`app/index.html`): the one place a notice reaches the user
// (ADR 0011). A notice stays until another replaces it or the user dismisses
// it — nothing fades on a timer, because every notice here says something was
// refused, lost or ended, and that is the user's to dismiss. The
// one exception is a "Not saved" notice: a later save that lands makes it
// false, so that save takes it down. Every notice is also written to the app's
// log, so a bug report holds what the user was told (`src-tauri/src/diag.rs`).

import { logLine } from "../src/bridge.ts";
import { sender } from "../src/console-line.ts";

/** Never fails its caller: a log that cannot be written costs only the log. */
const log = sender(logLine);

/** What a module may say to the user, and how a landed save retracts a
 *  "Not saved" notice. */
export interface StatusLine {
	/** Shows `message`, replacing whatever was there; empty clears the line. */
	notify(message: string): void;
	/** Shows that a save did not happen, and why. */
	notSaved(why: string): void;
	/** A save landed: a "Not saved" notice is no longer true, so it goes. */
	saved(): void;
}

/** The page's status line, over its line and its dismiss button. */
export function createStatus(line: HTMLElement, dismiss: HTMLElement): StatusLine {
	/** Whether the line shows a "Not saved" notice a landed save makes false. */
	let unsavedShown = false;

	const notify = (message: string) => {
		if (message) log("notice", [message]);
		line.textContent = message;
		unsavedShown = false;
	};
	dismiss.addEventListener("click", () => notify(""));

	return {
		notify,
		notSaved(why) {
			notify(`Not saved: ${why}`);
			unsavedShown = true;
		},
		saved() {
			if (unsavedShown) notify("");
		},
	};
}
