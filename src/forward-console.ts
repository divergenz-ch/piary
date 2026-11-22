// Sends the page's console and its uncaught errors to the process's stdout and
// the app's log file (`src-tauri/src/diag.rs`).
//
// WKWebView's console reaches no parent process: there is no stdout, no log
// file, nothing a shell or a harness can read. So a page-side exception is
// invisible from outside and a broken boot looks exactly like a hung one —
// which is the single most expensive property of the system-webview lane
// (ADR 0014), and this module is the whole answer to it.
//
// Import it FIRST in an entry module, so an import-time throw in any later
// module is already being forwarded.

import { logLine } from "./bridge.ts";
import { sender } from "./console-line.ts";

const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

const send = sender(logLine);

for (const level of LEVELS) {
	const original = console[level].bind(console);
	console[level] = (...parts: unknown[]) => {
		original(...parts);
		send(level, parts);
	};
}

window.addEventListener("error", (event) => {
	send("uncaught", [event.message, `${event.filename}:${event.lineno}`, event.error]);
});

window.addEventListener("unhandledrejection", (event) => {
	send("unhandled-rejection", [event.reason]);
});
