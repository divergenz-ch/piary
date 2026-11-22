// The only place the canvas talks to the Rust process.
//
// One seam, for two reasons. The suite replaces this module wholesale to drive
// the page without an app (the strategy's layer 3), which only works while
// every caller comes through here. And an IPC call that is not granted in
// `src-tauri/capabilities/default.json` is denied at runtime with no visible
// trace, so having one place that names every command is what makes the grant
// list auditable against the code.
//
// A second `invoke()` anywhere else is a bug, and `pnpm lint` says so.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

// Generated from src-tauri/src/wire.rs by `cargo test export_bindings`. The
// wire types are declared once, in Rust, so the two ends cannot disagree about
// a payload without the compiler saying so. Never hand-edit.
import type { DocEntry, ExportRequest, Exported, ExportedOne, ExtensionRow, FaceSource, FlushRequest, ImportPlaced, ImportStaged, OverlaySupport, Preferences, Report, Stored, TerminalRequest, UpdateSource, UpdateState, Verdict, WindowBox } from "./bridge-types.ts";

export type { DocEntry, ExportRequest, Exported, ExportedOne, ExtensionRow, FaceSource, FlushRequest, ImportPlaced, ImportStaged, OverlaySupport, Preferences, Report, Stored, TerminalRequest, UpdateSource, UpdateState, Verdict, WindowBox };

/**
 * What pi answers a command with.
 *
 * Deliberately loose: `data`'s shape is pi's and differs per command, and
 * modelling it here would be a second place to update whenever pi grows a
 * field. The page reads the fields it asked for.
 */
export type PiReply = {
	type?: string;
	command?: string;
	success?: boolean;
	error?: string;
	/** Set on a failure that is a late reply rather than a refusal: pi may
	 *  still be acting on the command (ADR 0019 §4). Never set by pi itself. */
	timedOut?: boolean;
	data?: Record<string, unknown>;
} | null;

/**
 * Sends one line to the process's stdout.
 *
 * `src/forward-console.ts` is the only expected caller: it routes the page's
 * own `console` here, because WKWebView's console reaches no parent process.
 */
export function logLine(level: string, message: string): Promise<void> {
	return invoke("log_line", { level, message });
}

/**
 * Reports assertions to whoever launched the app, and answers with the tally.
 * With `done`, the process exits — 0 if every report passed, 1 otherwise —
 * which is how a test that needs the real shell returns a verdict without a
 * human reading the window.
 */
export function report(reports: readonly Report[], done: boolean): Promise<Verdict> {
	return invoke("report", { reports, done });
}

/**
 * Reads one document, or `null` when it has never been written.
 *
 * A missing document is not an error: a conversation that has never been
 * written is one pending user message (ADR 0001).
 */
/** The text of the markdown file pi names as a command's source, or `null`. */
export function extensionsList(id: string): Promise<ExtensionRow[]> {
	return invoke("extensions_list", { id });
}

/** Turns one installed package on or off for one conversation; the new rows. */
export function extensionsSet(id: string, source: string, enabled: boolean): Promise<ExtensionRow[]> {
	return invoke("extensions_set", { id, source, enabled });
}

export function commandDocRead(path: string): Promise<string | null> {
	return invoke("command_doc_read", { path });
}

export function docsRead(id: string): Promise<string | null> {
	return invoke("docs_read", { id });
}

/** The last write of each document still in flight. */
const writing = new Map<string, Promise<void>>();

/**
 * Writes one document. The write is atomic and synced on the Rust side.
 *
 * Writes of one document are made in the order they were asked for, each after
 * the one before it has finished. The command runs off the main thread, and a
 * sync takes as long as the drive says, so two writes in flight can finish in
 * either order — and an older one finishing last would leave the older
 * document as the file. A failed write does not stop the next.
 */
export function docsWrite(id: string, content: string): Promise<void> {
	const previous = writing.get(id) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(() => invoke<void>("docs_write", { id, content }));
	writing.set(id, next);
	const forget = () => {
		if (writing.get(id) === next) writing.delete(id);
	};
	next.then(forget, forget);
	return next;
}

/**
 * The widget state kept for a document: `undefined` when none was ever
 * written, otherwise what was — which may be `null`, a record that there is
 * none. Rust wraps a record as `{ state }` so the two cross the wire apart.
 */
export async function cellStateRead(id: string): Promise<unknown> {
	const record = await invoke<{ state: unknown } | null>("cell_state_read", { id });
	return record == null ? undefined : record.state;
}

/** The last widget-state write of each document still in flight. */
const writingState = new Map<string, Promise<void>>();

/** Keeps a document's widget state, in the order the writes were asked for, as
 *  `docsWrite` does: an older write finishing last must not win. */
export function cellStateWrite(id: string, state: unknown): Promise<void> {
	const previous = writingState.get(id) ?? Promise.resolve();
	const next = previous.catch(() => {}).then(() => invoke<void>("cell_state_write", { id, state }));
	writingState.set(id, next);
	const forget = () => {
		if (writingState.get(id) === next) writingState.delete(id);
	};
	next.then(forget, forget);
	return next;
}

/**
 * Stores one dropped or pasted file beside the conversation, and answers with
 * what the document records of it (the format's §Attachments) plus its size.
 *
 * The bytes go as the raw request body rather than JSON, and the name in a
 * header, percent-encoded so any name survives it. The mime is
 * Rust's to sniff, so the file's own `type` is not sent at all.
 */
export async function attachmentsStore(file: File): Promise<Stored> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	return invoke("attachments_store", bytes, { headers: { "x-filename": encodeURIComponent(file.name) } });
}

/** A stored attachment's bytes, by its stored name (the last segment of its
 *  `/attachments/` url). */
export function attachmentsRead(name: string): Promise<ArrayBuffer> {
	return invoke("attachments_read", { name });
}

/** Where a stored attachment is on disk, absolute, by its stored name: what the
 *  agent is told to open for a file the model cannot see. */
export function attachmentsPath(name: string): Promise<string> {
	return invoke("attachments_path", { name });
}

/** The things a conversation is exported as: the document itself, alone or in
 *  a bundle (ADR 0049), or what the page drew of it, for a reader without
 *  Piary (ADR 0066). */
export type ExportKind = "markdown" | "folder" | "zip" | "html" | "pdf";

/**
 * Writes conversations into a folder the user chooses in the system's panel,
 * each under its own name, with the attachments named for it (the ones its
 * document references). `null` when the panel was cancelled.
 *
 * No path crosses here in either direction: Rust shows the panel, so the page
 * cannot be made to write anywhere the user did not choose.
 *
 * An HTML export carries each conversation as the page drawn of it
 * (`content`). A PDF is this window's own page, printed by Rust: one
 * conversation a call, shown to paper by the caller first. `into` is the
 * token an earlier call of the same export was answered with, and names its
 * folder instead of asking again.
 */
export function exportConversations(conversations: ExportRequest[], kind: ExportKind, into?: string): Promise<Exported | null> {
	return invoke("export_conversations", { conversations, kind, into });
}

/** Shows the Import or the Export window, focusing it when it is already
 *  open. `from` is the conversation the export is asked for, which the Export
 *  window shows chosen: a new one opens with it, and one already open hears
 *  it through `onExportFrom`. */
export function openTransfer(kind: "import" | "export", from?: string): Promise<void> {
	return invoke("open_transfer", { kind, from });
}

/** Asks the user for a conversation to import — a markdown file or a zip
 *  (`file`), or a folder bundle (`folder`) — and answers with what was read,
 *  held by Rust under a token. `null` when the panel was cancelled. */
export function importPick(kind: "file" | "folder"): Promise<ImportStaged | null> {
	return invoke("import_pick", { kind });
}

/** Puts a held import's attachments in the store: those of `names`. */
export function importPlace(token: string, names: string[]): Promise<ImportPlaced> {
	return invoke("import_place", { token, names });
}

/** Writes a held import's document under `id` and lets the import go. A taken
 *  id is refused unless `replace`. */
export function importWrite(token: string, id: string, content: string, replace: boolean): Promise<void> {
	return invoke("import_write", { token, id, content, replace });
}

/** Lets go of an import the user did not go through with. */
export function importCancel(token: string): Promise<void> {
	return invoke("import_cancel", { token });
}

/** Shows a document in a window of its own: the window already showing it,
 *  focused, or a new one. */
export function openDocument(docId: string): Promise<void> {
	return invoke("open_document", { docId });
}

/** Tells Rust which document this window shows, so another window asking for
 *  it is sent here rather than opening a second editor on the same file. */
export function windowShows(docId: string): Promise<void> {
	return invoke("window_shows", { docId });
}

/** Before this window switches to a document: `true` when another window shows
 *  it, which Rust has just focused instead. */
export function showDocument(docId: string): Promise<boolean> {
	return invoke("show_document", { docId });
}

/** Every conversation in this workspace with when its file last changed, most
 *  recent first: what the conversation list shows. */
export function docsEntries(): Promise<DocEntry[]> {
	return invoke("docs_entries");
}

/** Deletes a conversation whole — its pi stopped, its document, widget state
 *  and pi's transcript removed, another window showing it closed. Start its pi
 *  first: the transcript's path is asked of it. */
export function deleteConversation(id: string): Promise<void> {
	return invoke("delete_conversation", { id });
}

/** Every document in this workspace, by id, sorted. */
export function docsList(): Promise<string[]> {
	return invoke("docs_list");
}

/**
 * Calls back with a document's id when something outside the app changed it.
 *
 * A conversation is a file anyone may edit, so an editor or a `git checkout`
 * can change one while a window has it open.
 */
export function onDocChanged(handler: (id: string) => void): Promise<UnlistenFn> {
	return on<string>("doc-changed", handler);
}

/**
 * Opens a terminal, owned by this session.
 *
 * `interactive` is not a parameter here: it is the KIND of panel the VIEW
 * renders (ADR 0013), and the shell behind an agent's read-only output is the
 * same PTY either way. What differs is whether the view forwards a keystroke.
 */
export function ptyOpen(request: TerminalRequest): Promise<void> {
	return invoke("pty_open", { request });
}

/** Forwards a keystroke, or pasted text. */
export function ptyWrite(sid: string, termId: string, data: string): Promise<void> {
	return invoke("pty_write", { sid, termId, data });
}

/** Tells a terminal its rendered grid changed. */
export function ptyResize(sid: string, termId: string, cols: number, rows: number): Promise<void> {
	return invoke("pty_resize", { sid, termId, cols, rows });
}

/**
 * Kills one terminal.
 *
 * The page calls this when a view's marker leaves the document: disposing the
 * view frees only the browser's half, and the shell would run on with nobody
 * reading it (ADR 0013).
 */
export function ptyClose(sid: string, termId: string): Promise<void> {
	return invoke("pty_close", { sid, termId });
}

/** Closes every terminal this session owns, for a window going away. */
export function ptyCloseSession(sid: string): Promise<number> {
	return invoke("pty_close_session", { sid });
}

/** A terminal's output. */
export function onPtyData(handler: (termId: string, data: string) => void): Promise<UnlistenFn> {
	return on<[string, string]>("pty-data", ([termId, data]) => handler(termId, data));
}

/** A terminal's program exited. */
export function onPtyExit(handler: (termId: string, exitCode: number) => void): Promise<UnlistenFn> {
	return on<[string, number]>("pty-exit", ([termId, code]) => handler(termId, code));
}

/**
 * Where the window for `docId` should open: what was saved, corrected for the
 * screens that exist now.
 *
 * A window restored onto a display that has since gone is invisible and reads
 * as a crash, so the correction happens in Rust rather than being left to the
 * caller.
 */
export function windowGeometry(docId: string): Promise<WindowBox> {
	return invoke("window_geometry", { docId });
}

/** Remembers where a window is, so it opens there next launch. */
export function rememberWindow(docId: string, geometry: WindowBox): Promise<void> {
	return invoke("remember_window", { docId, geometry });
}

/**
 * Which overlay primitives this platform honoured.
 *
 * Asked of a real window and reported rather than assumed: the capture overlay
 * (ADR 0015) needs all four, and discovering a gap while building that feature
 * would mean building on a false premise. The probe restores the window, so
 * calling it leaves nothing switched on.
 */
export function overlaySupport(): Promise<OverlaySupport> {
	return invoke("overlay_support");
}

/** Shows the app's one Preferences window, focusing it when it is already
 *  open (ADR 0048). */
export function openPreferences(): Promise<void> {
	return invoke("open_preferences");
}

/** How the user chose the app to behave; the defaults when nothing is kept
 *  (ADR 0048). */
export function preferencesRead(): Promise<Preferences> {
	return invoke("preferences_read");
}

/** Keeps the preferences. Every window, this one included, then hears them
 *  through `onPreferencesChanged`. */
export function preferencesWrite(preferences: Preferences): Promise<void> {
	return invoke("preferences_write", { preferences });
}

/** What reads the user's face in this run: the camera, a script standing in
 *  for one in a driven run (`PIARY_FACE_SCRIPT`), or nothing (ADR 0058). */
export function faceSource(): Promise<FaceSource> {
	return invoke("face_source");
}

/** The version this app is, and the newest release tag a check has read
 *  since launch (ADR 0064). */
export function updateState(): Promise<UpdateState> {
	return invoke("update_state");
}

/** Asks for the turn to check for a newer Piary. `none` is no turn: another
 *  window checked within the hour, the preference is off, or a driven run has
 *  nothing to ask. Otherwise, where to ask. With `asked` the user chose Check
 *  for Updates…, and neither the hour nor the preference refuses it. */
export function updateClaim(asked: boolean): Promise<UpdateSource> {
	return invoke("update_claim", { asked });
}

/** A check read the release tag `tag`: every window then hears it through
 *  `onUpdateLatest`. */
export function updateFound(tag: string): Promise<void> {
	return invoke("update_found", { tag });
}

/** Calls back with the release tag a check read, in any window. */
export function onUpdateLatest(handler: (tag: string) => void): Promise<UnlistenFn> {
	return on<string>("update-latest", handler);
}

/** The chord of every menu item that has one, by the id its click emits, as
 *  the system draws it under the keyboard layout in use (ADR 0051). */
export function menuChords(): Promise<Record<string, string> | null> {
	return invoke("menu_chords");
}

/** Calls back, in the Export window, with the conversation an export was asked
 *  for while the window was already open. */
export function onExportFrom(handler: (id: string) => void): Promise<UnlistenFn> {
	return on<string>("export-from", handler);
}

/** Calls back with the preferences each time one changed, in any window. */
export function onPreferencesChanged(handler: (preferences: Preferences) => void): Promise<UnlistenFn> {
	return on<Preferences>("preferences-changed", handler);
}

/** A menu item was chosen. The page owns every verb, so the menu and the
 *  keyboard reach one implementation. */
export function onMenu(handler: (id: string) => void): Promise<UnlistenFn> {
	return on<string>("menu", handler);
}

/**
 * Starts the capture helper (ADR 0015).
 *
 * The permission prompt this may raise belongs to the APP, not the helper:
 * macOS resolves a privacy grant against the responsible process, and
 * responsibility is inherited across spawn — so one grant on Piary covers the
 * sidecar, and the user is asked once.
 */
export function captureStart(): Promise<void> {
	return invoke("capture_start");
}

/**
 * Sends one command to the helper, as a JSON line.
 *
 * The protocol's shape belongs here rather than in Rust, which relays the lines
 * untouched: parsing in both places would mean two things to change whenever
 * the helper grows a reply.
 */
export function captureSend(command: Record<string, unknown>): Promise<void> {
	return invoke("capture_send", { line: JSON.stringify(command) });
}

/** Stops the helper. No Screen Recording grant is left held with nobody reading. */
export function captureStop(): Promise<number | null> {
	return invoke("capture_stop");
}

/** Whether a helper is running, asked before offering to start one. */
export function captureRunning(): Promise<boolean> {
	return invoke("capture_running");
}

/** One JSON line from the helper. */
export function onCapture(handler: (event: Record<string, unknown>) => void): Promise<UnlistenFn> {
	return on<string>("capture", (line) => {
		try {
			handler(JSON.parse(line) as Record<string, unknown>);
		} catch {
			// A line that is not JSON is the helper misbehaving, not something
			// the page can act on. Dropping it keeps one bad line from killing
			// the subscription.
		}
	});
}

/** The helper went away — on its own, or because it was asked to. */
export function onCaptureEnded(handler: (code: number | null) => void): Promise<UnlistenFn> {
	return on<number | null>("capture-ended", handler);
}

/**
 * Which `pi` would run, or a message naming the fix when there is none.
 *
 * It is the user's own pi that runs (ADR 0004), and the app bundles no fallback
 * — so an absent one is a notice the page shows before a first prompt rather
 * than a failed send.
 */
export function piWhich(): Promise<string> {
	return invoke("pi_which");
}

/** Starts a session's `pi --mode rpc`. Idempotent. */
export function piStart(sid: string, args: string[] = []): Promise<void> {
	return invoke("pi_start", { sid, args });
}

/**
 * Sends one command to pi and answers with its reply.
 *
 * The command is pi's own `{type, …}` — Rust adds the correlation id and passes
 * the reply back untouched, so the shapes this page sends and reads are pi's
 * documented protocol and not a wrapper over it. A refusal arrives in the same
 * shape as pi's own, so there is one branch to handle.
 */
export function piSend(sid: string, command: Record<string, unknown>): Promise<PiReply> {
	return invoke("pi_send", { sid, command });
}

/**
 * Replaces a session's transcript with rebuilt entries (ADR 0021).
 *
 * `sessionFile` is the path pi reported through `get_state`; Rust refuses any
 * other. pi is stopped and left stopped — the next `piStart` loads the new
 * transcript. The entries are pi's own, written one per line as given.
 */
export function piRebuild(sid: string, sessionFile: string, entries: readonly unknown[]): Promise<void> {
	return invoke("pi_rebuild", { sid, sessionFile, entries });
}

/** Ends a session's process, and its terminals with it (ADR 0013), unless
 *  `keepTerminals`: pi restarted, not the window closed. */
export function piStop(sid: string, keepTerminals = false): Promise<number | null> {
	return invoke("pi_stop", keepTerminals ? { sid, keepTerminals } : { sid });
}

/** Whether a session has a process. */
export function piRunning(sid: string): Promise<boolean> {
	return invoke("pi_running", { sid });
}

/** Every session with a live process — what a window asks after a reload. */
export function piSessions(): Promise<string[]> {
	return invoke("pi_sessions");
}

/** One event from pi: anything that is not a correlated reply. */
export function onPiEvent(handler: (sid: string, event: Record<string, unknown>) => void): Promise<UnlistenFn> {
	return on<[string, Record<string, unknown>]>("pi-event", ([sid, event]) => handler(sid, event));
}

/** A session's pi went away. A page waiting on a turn needs to know. */
export function onPiExited(handler: (sid: string, code: number | null) => void): Promise<UnlistenFn> {
	return on<[string, number | null]>("pi-exited", ([sid, code]) => handler(sid, code));
}

/**
 * Calls back when the host is about to close this window or quit (ADR 0019 §2).
 * The page ends its running turn, writes its buffer, then calls `exitFlushed`.
 *
 * Scoped to this window: closing one window asks only its own page, and a
 * page answering for another would end a turn nobody asked to stop.
 */
export function onExitFlush(handler: (request: FlushRequest) => void): Promise<UnlistenFn> {
	const target = { kind: "WebviewWindow" as const, label: getCurrentWebviewWindow().label };
	return listen<FlushRequest>("exit-flush", (received) => handler(received.payload), { target });
}

/** Answers the exit sequence: this window's buffer is written. */
export function exitFlushed(): Promise<void> {
	return invoke("exit_flushed");
}

/** Subscribes to one of the Rust side's events. */
export function on<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
	return listen<T>(event, (received) => handler(received.payload));
}

/** Whether the page is running inside the app rather than a plain browser. */
export function inApp(): boolean {
	return "__TAURI_INTERNALS__" in window;
}

/** Opens a web address in the user's browser (ADR 0034). Rust refuses anything
 *  that is not `http(s)`. */
export function openUrl(url: string): Promise<void> {
	return invoke("open_url", { url });
}

/** Opens System Settings where the user allows Piary the camera (ADR 0057).
 *  The page names no address: Rust holds the one it opens. */
export function openCameraSettings(): Promise<void> {
	return invoke("open_camera_settings");
}

/** Brings this window, and the app, to the front (ADR 0034). */
export function focusWindow(): Promise<void> {
	return invoke("focus_window");
}
