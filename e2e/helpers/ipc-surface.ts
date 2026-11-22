// The IPC surface the browser fakes answer: every command Rust registers, and
// the event plugin's two verbs `listen()` and its unlisten send.
//
// A fake that answers anything at all leaves a renamed command green in every
// app spec, because the page's call to the old name still resolves. So both
// fakes (app-page.spec.ts's `openAppAt`, scripted-pi.ts's `install`) refuse a
// command not on this list, the way the real runtime refuses an unknown one,
// and `tests/contract/ipc.test.ts` holds APP_COMMANDS equal to
// `generate_handler!` in src-tauri/src/main.rs — so the list cannot drift into
// answering a command that no longer exists.

/** Every `#[tauri::command]` the app registers, by name. */
export const APP_COMMANDS = [
	"log_line",
	"report",
	"docs_read",
	"command_doc_read",
	"extensions_list",
	"extensions_set",
	"docs_write",
	"docs_list",
	"docs_entries",
	"delete_conversation",
	"attachments_store",
	"attachments_read",
	"attachments_path",
	"export_conversations",
	"open_transfer",
	"import_pick",
	"import_place",
	"import_write",
	"import_cancel",
	"cell_state_read",
	"cell_state_write",
	"pty_open",
	"pty_write",
	"pty_resize",
	"pty_close",
	"pty_close_session",
	"window_geometry",
	"open_document",
	"window_shows",
	"show_document",
	"remember_window",
	"preferences_read",
	"preferences_write",
	"open_preferences",
	"face_source",
	"menu_chords",
	"overlay_support",
	"capture_start",
	"capture_send",
	"capture_stop",
	"capture_running",
	"focus_window",
	"open_url",
	"open_camera_settings",
	"pi_which",
	"pi_start",
	"pi_send",
	"pi_stop",
	"pi_running",
	"pi_sessions",
	"pi_rebuild",
	"exit_flushed",
] as const;

/** The plugin commands the page reaches through `@tauri-apps/api/event`. */
export const PLUGIN_COMMANDS = ["plugin:event|listen", "plugin:event|unlisten"] as const;

/** Every command a fake may answer. */
export const KNOWN_COMMANDS: readonly string[] = [...APP_COMMANDS, ...PLUGIN_COMMANDS];

/** What a fake rejects an unknown command with. */
export const refusal = (command: string) => `fake IPC: no answer for ${command}`;
