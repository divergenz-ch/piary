// What the camera reads and what a message would carry, shown while it
// happens (ADR 0059).
//
// A panel over the model chip, opened from the face's pill. It is not a menu:
// it stays open while the user types, because the camera is on only then and
// what it shows is what typing does. Each expression's level against the
// face's own rest, what the reading found in the last half minute with what
// the filter dropped struck through and why, the block the draft would end
// with now, and the filter's own settings, which apply as they are changed.
// The camera's picture is shown only when asked for, and is the camera
// source's own element (`mediapipe.ts`): nothing here reads it.

import { X } from "lucide";
import type { FaceReading } from "../../src/bridge-types.ts";
import { CODES, INTENSITY, type Unit } from "../../src/document/face.ts";
import { iconDOM } from "../../src/utils/icons.ts";
import type { Inspection } from "./detector.ts";
import type { Judged } from "./sent.ts";
import { DROPPED, MEASURED, stretchSays, TUNABLE, type Unprompted } from "./state.ts";

/** What the panel shows now. */
export interface InspectorView {
	/** Where the reading stands, in the pill's sentence. */
	says: string;
	inspection: Inspection | null;
	/** The block the draft would end with as it stands; empty for none. */
	draft: string;
	/** The filter as it is set. */
	reading: FaceReading;
	/** There is a camera whose picture can be shown. */
	camera: boolean;
	/** How the agent speaking first has gone this session; `null` with that off. */
	unprompted: Pick<Unprompted, "asked" | "spoke" | "silent"> | null;
	/** How often a sent block the user looked at was right about them, by their word. */
	judged: Judged;
}

export interface InspectorActs {
	tune(change: Partial<FaceReading>): void;
	reset(): void;
	/** Shows the camera's picture in `host`, or takes it back with `null`. */
	picture(host: HTMLElement | null): void;
}

export interface Inspector {
	/** Opens the panel over `anchor`, or closes it when it is open. */
	toggle(anchor: HTMLElement): void;
	close(): void;
	isOpen(): boolean;
	show(view: InspectorView): void;
}

/** A level this far above rest fills its bar: past the strongest letter's start
 *  (`FaceTuning.letters`). */
const FULL = 1.15;

/** How each part of the filter is asked for, and how a value of it reads. */
const TUNED: { [K in keyof FaceReading]: { label: string; says: (value: FaceReading[K]) => string } } = {
	intensity: { label: "Pass on what is at least", says: (letter) => INTENSITY[letter as Unit[1]] },
	minMs: { label: "and held for", says: (ms) => `${ms / 1000} s` },
	yaw: { label: "Read with the head turned up to", says: (degrees) => `${degrees}°` },
	pitch: { label: "and tipped up to", says: (degrees) => `${degrees}°` },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ""): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
}

function button(className: string, text: string, run: () => void): HTMLButtonElement {
	const node = el("button", className, text);
	node.type = "button";
	node.addEventListener("click", run);
	return node;
}

export function createInspector(acts: InspectorActs): Inspector {
	let panel: HTMLElement | null = null;
	let view: InspectorView | null = null;
	let pictured = false;
	/** Draws `view` into the open panel; set when it opens. */
	let draw: (view: InspectorView) => void = () => {};

	const close = (): void => {
		if (!panel) return;
		if (pictured) acts.picture(null);
		pictured = false;
		panel.remove();
		panel = null;
	};

	function open(anchor: HTMLElement): void {
		const root = el("div", "face-inspector");
		root.setAttribute("role", "dialog");
		root.setAttribute("aria-label", "What the camera reads");
		const box = anchor.getBoundingClientRect();
		root.style.bottom = `${window.innerHeight - box.top + 6}px`;
		root.style.right = `${Math.max(window.innerWidth - box.right, 8)}px`;

		const shut = button("face-inspector-close", "", close);
		shut.setAttribute("aria-label", "Close");
		shut.append(iconDOM(X, "sm"));
		const head = el("div", "face-inspector-head");
		head.append(el("div", "face-inspector-title", "What the camera reads"), shut);
		const says = el("p", "face-inspector-says");

		const levels = el("div", "face-levels");
		const bars = new Map<number, { row: HTMLElement; fill: HTMLElement; word: HTMLElement }>();
		const talking = el("p", "face-inspector-hint", "Your mouth is talking, so it is not read.");

		const recent = el("ul", "face-recent");
		const draft = el("pre", "face-draft");

		const asked = el("p", "face-inspector-hint");
		const right = el("p", "face-inspector-hint");
		const tuning = el("div", "face-tuning");
		const choices: { key: keyof FaceReading; value: FaceReading[keyof FaceReading]; node: HTMLButtonElement }[] = [];
		for (const key of Object.keys(TUNED) as (keyof FaceReading)[]) {
			const row = el("div", "face-tuning-row");
			row.setAttribute("role", "group");
			row.setAttribute("aria-label", TUNED[key].label);
			row.append(el("span", "face-tuning-label", TUNED[key].label));
			for (const value of TUNABLE[key]) {
				const node = button("face-tuning-choice", (TUNED[key].says as (value: FaceReading[keyof FaceReading]) => string)(value), () => acts.tune({ [key]: value }));
				choices.push({ key, value, node });
				row.append(node);
			}
			tuning.append(row);
		}
		const reset = button("face-inspector-toggle", "Reset", acts.reset);

		const host = el("div", "face-picture-host");
		const camera = button("face-inspector-toggle", "Show camera", () => {
			pictured = !pictured;
			acts.picture(pictured ? host : null);
			if (view) draw(view);
		});

		root.append(head, says, levels, talking, el("div", "face-inspector-label", "The last 30 seconds"), recent, el("div", "face-inspector-label", "This message would carry"), draft, asked, right, el("div", "face-inspector-label", "What is passed on"), tuning, reset, camera, host);
		root.addEventListener("keydown", (event) => {
			if (event.key !== "Escape") return;
			event.stopPropagation();
			close();
		});

		draw = (next) => {
			says.textContent = next.says;
			const read = next.inspection?.levels ?? null;
			levels.hidden = read === null;
			for (const level of read ?? []) {
				let bar = bars.get(level.code);
				if (!bar) {
					const row = el("div", "face-level");
					const fill = el("div", "face-level-fill");
					const track = el("div", "face-level-track");
					track.append(fill);
					const word = el("span", "face-level-word");
					row.append(el("span", "face-level-name", CODES[level.code]), track, word);
					levels.append(row);
					bar = { row, fill, word };
					bars.set(level.code, bar);
				}
				bar.row.dataset["read"] = String(level.value !== null);
				bar.fill.style.width = `${Math.round(Math.min(Math.max(level.value ?? 0, 0) / FULL, 1) * 100)}%`;
				bar.word.textContent = level.value === null ? "not read" : level.letter ? INTENSITY[level.letter] : "";
			}
			talking.hidden = !next.inspection?.talking;

			const found = next.inspection?.recent ?? [];
			recent.replaceChildren(
				...(found.length
					? found.map((stretch) => {
							const item = el("li", "");
							if (stretch.dropped === null) item.textContent = stretchSays(stretch);
							else item.append(el("s", "", stretchSays(stretch)), el("span", "face-recent-why", DROPPED[stretch.dropped]));
							return item;
						})
					: [el("li", "face-recent-none", "Nothing yet.")]),
			);
			draft.textContent = next.draft || "Nothing, as it stands.";
			draft.dataset["empty"] = String(!next.draft);
			right.hidden = next.judged.right + next.judged.wrong === 0;
			right.textContent = `Of the sent blocks you judged, ${next.judged.right} were right about you and ${next.judged.wrong} were not.`;
			asked.hidden = next.unprompted === null;
			if (next.unprompted) asked.textContent = `Shown your face with no message ${next.unprompted.asked} ${next.unprompted.asked === 1 ? "time" : "times"} this session, the agent spoke ${next.unprompted.spoke} and stayed silent ${next.unprompted.silent}.`;
			for (const { key, value, node } of choices) node.setAttribute("aria-pressed", String(next.reading[key] === value));
			reset.disabled = (Object.keys(MEASURED) as (keyof FaceReading)[]).every((key) => next.reading[key] === MEASURED[key]);
			camera.hidden = !next.camera;
			camera.textContent = pictured ? "Hide camera" : "Show camera";
			camera.setAttribute("aria-pressed", String(pictured));
			host.hidden = !pictured;
		};

		document.body.append(root);
		panel = root;
		if (view) draw(view);
	}

	return {
		toggle(anchor) {
			if (panel) close();
			else open(anchor);
		},
		close,
		isOpen: () => panel !== null,
		show(next) {
			view = next;
			if (panel) draw(next);
		},
	};
}
