// How the user chose the app to behave, as this window knows it (ADR 0048).
//
// Rust keeps the preferences in one file for the app and tells every window
// when one changes, so a change in the Preferences window applies at once,
// here, with no restart. Until the first read lands a window behaves by
// `DEFAULT_PREFERENCES`, and it stays on them when the read fails: a
// preference is never a reason for a window not to open.

import { onPreferencesChanged, preferencesRead, type Preferences } from "../src/bridge.ts";

/** What the app does with nothing kept: `Preferences::default()` in
 *  `src-tauri/src/wire.rs`, to which `tests/contract/preferences.test.ts`
 *  holds this. */
export const DEFAULT_PREFERENCES: Preferences = { cellWorkPulse: true, face: false, faceExplained: false, faceCamera: "", faceTuning: { intensity: "C", minMs: 500, yaw: 12, pitch: 10 }, faceSpeaks: false, updateCheck: true, updateDismissed: "", piPath: "" };

let current: Preferences = DEFAULT_PREFERENCES;
const watchers = new Set<(preferences: Preferences) => void>();
let following = false;

function take(preferences: Preferences | null | undefined): void {
	// Over the defaults, so an answer short of a key still leaves every one set.
	current = { ...DEFAULT_PREFERENCES, ...preferences };
	for (const watcher of watchers) watcher(current);
}

/** Listens before it reads, so a change made between the two is not lost. A
 *  change that arrives first is newer than the read, which then says nothing. */
async function follow(): Promise<void> {
	let changed = false;
	await onPreferencesChanged((preferences) => {
		changed = true;
		take(preferences);
	}).catch(() => {});
	const kept = await preferencesRead().catch(() => null);
	// Said even when nothing could be read: a watcher's first call is where the
	// window starts from, and what comes after it is a change.
	if (!changed) take(kept);
}

/** The preferences as they stand now. */
export function preferences(): Preferences {
	return current;
}

/** Calls `changed` each time the preferences are read or changed, and starts
 *  following them on the first call. */
export function watchPreferences(changed: (preferences: Preferences) => void): void {
	watchers.add(changed);
	if (following) return;
	following = true;
	void follow();
}
