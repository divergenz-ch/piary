// The face's pill: last in the model chip, right of the effort (ADR 0057).
//
// An icon that says, by how it is drawn, whether the user's face is read and
// whether the camera is on right now, and a menu that says the same in a
// sentence and holds what can be done about it: turn it on or off, choose the
// camera, open System Settings after a refusal, try again after a failure, see
// what is read and what would be sent (`inspector.ts`).
// What it shows is decided elsewhere (`state.ts`); this draws it.

import { ScanFace } from "lucide";
import { iconDOM } from "../../src/utils/icons.ts";
import { type MenuItem, openMenu } from "../menu.ts";
import "./face.css";
import { type PillState, pillTitle } from "./state.ts";

/** What the pill shows now. */
export interface PillView {
	state: PillState;
	/** The state in a sentence, for the menu. */
	says: string;
	/** The cameras there are to choose from, by label; empty until one was read. */
	cameras: readonly string[];
	/** The camera the user chose, or the empty string for none chosen. */
	camera: string;
	/** The message being written would carry a block as it stands. */
	lines: boolean;
	/** The agent may speak first (the `faceSpeaks` preference). */
	speaks: boolean;
}

/** What the menu's rows do. */
export interface PillActs {
	turnOn(): void;
	turnOff(): void;
	retry(): void;
	openSettings(): void;
	choose(camera: string): void;
	/** Opens what the camera reads and what would be sent, over `pill`. */
	inspect(pill: HTMLElement): void;
	setSpeaks(speaks: boolean): void;
}

export interface Pill {
	show(view: PillView): void;
}

/** The menu's rows for `view`: the sentence, then what can be done. */
export function pillRows(view: PillView, acts: PillActs, pill: HTMLElement): MenuItem[] {
	const { state } = view;
	const rows: MenuItem[] = [{ note: view.says }];
	if (state === "off") return [...rows, { label: "Turn on", run: acts.turnOn }];
	if (state === "ask") rows.push({ label: "Read what is sent…", run: acts.turnOn });
	if (state === "refused") rows.push({ label: "Open System Settings", run: acts.openSettings });
	if (state === "failed" || state === "no-camera") rows.push({ label: "Try again", run: acts.retry });
	if (state !== "ask") {
		rows.push({ label: "What is read and sent…", run: () => acts.inspect(pill) });
		rows.push({ label: `Let the agent speak first${view.speaks ? " ·" : ""}`, title: "When your face moves at an answer and you write nothing, the agent may add a sentence or two, or say nothing", run: () => acts.setSpeaks(!view.speaks) });
	}
	rows.push({ label: "Turn off", run: acts.turnOff });
	if (state !== "ask" && view.cameras.length > 1) {
		rows.push({ section: "camera" });
		for (const label of view.cameras) rows.push({ label: `${label}${label === view.camera ? " ·" : ""}`, disabled: label === view.camera, run: () => acts.choose(label) });
	}
	return rows;
}

/** Puts the pill at the end of `chip`. */
export function mountPill(chip: HTMLElement, acts: PillActs): Pill {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "face-pill";
	button.setAttribute("aria-haspopup", "menu");
	button.append(iconDOM(ScanFace, "sm"));
	chip.append(button);

	let view: PillView | null = null;
	button.addEventListener("click", () => {
		// The tour walks the window (`app/onboarding.ts`): its step on the chip
		// is about the model, and this is not what it asks for.
		if (!view || document.body.classList.contains("coaching")) return;
		const box = button.getBoundingClientRect();
		openMenu(box.left, box.top, pillRows(view, acts, button), { above: true });
	});

	return {
		show(next) {
			view = next;
			button.dataset["state"] = next.state;
			// A mark that the message as it stands would carry something.
			button.dataset["lines"] = String(next.lines);
			button.title = pillTitle(next.state);
			button.setAttribute("aria-label", button.title);
			// Pressed is the switch, whatever the camera is doing.
			button.setAttribute("aria-pressed", String(next.state !== "off"));
		},
	};
}
