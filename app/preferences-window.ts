// The Preferences window's page: one for the app, opened by Piary → Settings…
// (`src-tauri/src/menu.rs`, ADR 0048).
//
// It draws every preference as a row under its topic and writes a change the
// moment it is made: there is no Save. It draws what Rust says is kept, never
// what was just clicked: a control moves when the change comes back as
// `preferences-changed`, the same event every other window applies it from, so
// the window cannot show a choice the file does not hold.

import "../src/forward-console.ts";
import "../src/styles/styles.css";
import "./preferences.css";

import { exitFlushed, onExitFlush, onMenu, preferencesWrite, type Preferences } from "../src/bridge.ts";
import { windowVerbs } from "./transfer.ts";
import { preferences, watchPreferences } from "./preferences.ts";

/** One preference as the window offers it. */
interface Row {
	/** The topic it is listed under. */
	group: string;
	label: string;
	/** What on and off each do, in a line. */
	hint: string;
}

/** The preferences that are a switch: what this window can draw. */
type Switch = { [Key in keyof Preferences]: Preferences[Key] extends boolean ? Key : never }[keyof Preferences];

/** Every preference, in the order drawn; a topic is drawn where its first row
 *  is. Keyed by `Preferences`, so the compiler refuses a preference this
 *  window has not decided about: a switch has a row, and `null` is one this
 *  window does not offer, with where it is set instead. */
const ROWS: { [Key in keyof Preferences]: (Key extends Switch ? Row : never) | null } = {
	cellWorkPulse: {
		group: "Runs",
		label: "Pulse the cell a run is working on",
		hint: "A faint gray wash that comes and goes over a cell while the agent works on it. Off, the chip above the cell alone says so. Either way the cell takes no click until the run is done with it.",
	},
	face: {
		group: "Camera",
		label: "Read my face while I type",
		hint: "The camera's picture stays on this Mac. What your face did while you typed (brows, eyes, mouth, head) goes to the agent with your message, as a few words. The first time, a document's window shows what is sent and asks before the camera is used.",
	},
	// Agreed to in a document's window, on the sheet that says what is sent
	// (`app/face/sheet.ts`): a box ticked here would agree to nothing read.
	faceExplained: null,
	// Chosen from the cameras there are, which only a window that has read
	// one knows (`app/face/pill.ts`).
	faceCamera: null,
	// Set where the reading is shown, beside what it changes (`app/face/inspector.ts`).
	faceTuning: null,
	faceSpeaks: {
		group: "Camera",
		label: "Let the agent speak first",
		hint: "When your face moves at an answer and you write nothing for a few seconds, the agent is shown what your face did and may add a sentence or two under its answer, marked as unasked, or say nothing. Each time is one more request to the model. Only while your face is read.",
	},
};

/** Said when a change could not be kept; the control stays where it was. */
const NOT_KEPT = "That change could not be saved";

const status = document.getElementById("status")!;
const switches = new Map<Switch, HTMLInputElement>();

function draw(root: HTMLElement): void {
	const sections = new Map<string, HTMLElement>();
	for (const key of Object.keys(ROWS) as Switch[]) {
		const row = ROWS[key];
		if (!row) continue;
		let section = sections.get(row.group);
		if (!section) {
			section = document.createElement("section");
			section.className = "prefs-group";
			const title = document.createElement("h2");
			title.textContent = row.group;
			section.append(title);
			sections.set(row.group, section);
			root.append(section);
		}
		const label = document.createElement("label");
		label.className = "prefs-row";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.dataset["preference"] = key;
		// Until what is kept has been read there is nothing true to show, and a
		// click would be written over the defaults.
		input.disabled = true;
		const text = document.createElement("span");
		text.className = "prefs-label";
		text.textContent = row.label;
		const hint = document.createElement("span");
		hint.className = "prefs-hint";
		hint.textContent = row.hint;
		const words = document.createElement("span");
		words.className = "prefs-words";
		words.append(text, hint);
		label.append(input, words);
		section.append(label);
		switches.set(key, input);
		input.addEventListener("change", () => {
			const wanted = input.checked;
			// Back to what is kept until Rust says otherwise.
			input.checked = preferences()[key];
			status.textContent = "";
			preferencesWrite({ ...preferences(), [key]: wanted }).catch((error: unknown) => {
				status.textContent = `${NOT_KEPT}: ${String(error)}`;
			});
		});
	}
}

function show(kept: Preferences): void {
	for (const [key, input] of switches) {
		input.checked = kept[key];
		input.disabled = false;
	}
}

draw(document.getElementById("preferences")!);
watchPreferences(show);

// The menu's clicks come here while this window is focused. It answers the
// verbs that open a window — New Document, Open…, Welcome, Import…, Export… —
// so they work from here as from a document. Settings… is this window, already
// in front, and every other item acts on a document, which this window does
// not have.
const verbs: Record<string, (() => void) | undefined> = windowVerbs((message) => void (status.textContent = message));
void onMenu((id) => verbs[id]?.());

// This window holds nothing to write, so the host closing it or quitting is
// answered at once (ADR 0019 §2).
void onExitFlush(() => void exitFlushed());
