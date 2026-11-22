// The user's face, from a detector to the message pi is handed (ADR 0058,
// ADR 0055).
//
// With the preference on, this keeps a key log of each prompt being written
// (`log.ts`), has a detector watch while the user types, and at a send joins
// the two into the `[face]` block the message ends with
// (`docs/face-format.md`): assembled, filtered and worded with no model in
// between. The block goes to pi and never into the document. With the
// preference off it keeps nothing, watches nothing and says nothing.
//
// What watches is Rust's to say (`face_source`): the camera, or in a driven
// run a script or nothing. The camera's code and its model are a chunk of
// their own, loaded the first time the camera is wanted.
//
// The detector watches from a key in a prompt until the user has not typed
// for a while, the window is no longer in front, or pi has taken the message;
// and for a few seconds after an answer appears, which the next message
// carries as what the face did while reading it (ADR 0060).
// Nothing watches before the user has agreed to what is sent (`sheet.ts`), or
// while the tour walks the window. Where all of that stands is the pill's to
// show (`pill.ts`, ADR 0057): a camera that cannot be had is said there.
//
// What is read and what a message would carry can be looked at while it
// happens (`inspector.ts`), what is passed on is the user's to set there, and
// what a sent message carried is read back from pi (`sent.ts`): ADR 0059.
//
// What pi must be told changes with it (its start carries the guidance for
// the block only while a face is read), so this window's pi is stopped,
// quietly, once no turn runs: the next send starts one that knows.

import { faceSource, openCameraSettings, piSend, piStart, preferencesWrite, type Preferences } from "../../src/bridge.ts";
import { filtered, renderFace } from "../../src/document/face.ts";
import { assemble, type ReadWindow } from "../../src/document/face-assemble.ts";
import { ASIDE_MARKER, escapeBody, parseDocument } from "../../src/document/format.ts";
import type { Keys } from "../../src/document/keystrokes.ts";
import { answerRange, deleteSegment } from "../../src/document/run.ts";
import { isSilent } from "../../src/document/turn-context.ts";
import type { HostFragment } from "../canvas-events.ts";
import type { AppContext } from "../context.ts";
import { type MenuItem, openMenu } from "../menu.ts";
import type { ModelPicker } from "../picks.ts";
import { preferences, watchPreferences } from "../preferences.ts";
import { type FaceDetector, sampledDetector, type SourceState } from "./detector.ts";
import { createInspector } from "./inspector.ts";
import { type FaceBlocks, PromptLogs } from "./log.ts";
import { mountPill, type Pill } from "./pill.ts";
import { parseFaceScript, scriptedDetector } from "./scripted.ts";
import { judge, judged, promptIn, type Sent, sentOf, sentRows } from "./sent.ts";
import { openFaceSheet } from "./sheet.ts";
import { MEASURED, mayAsk, pillSays, pillState, readingOf, tunedOf, type Unprompted, unaskedThreshold } from "./state.ts";

/** With no key for this long the user is reading or thinking or gone, and the
 *  camera goes off until the next key. */
const IDLE_STOP_MS = 20_000;

/** How long after an answer appears the face is taken to be reading it
 *  (`docs/face-format.md`: the experiment's window), and how long past that the
 *  camera stays on, so a movement that ends at the window's edge is seen to end. */
const READ_WINDOW_MS = 4000;
const READ_LINGER_MS = 2000;
/** A reading older than this when the next message goes is about an answer the
 *  user has since left: it is not sent. */
const READ_FRESH_MS = 120_000;
/** A key this recently means the user is writing, not reading what just appeared. */
const WRITING_MS = 2000;

/** How long after an answer appears, with no key, the agent is asked whether
 *  it has something to add: the reading and the camera's two seconds past it. */
const QUIET_MS = READ_WINDOW_MS + READ_LINGER_MS;

/** A message with no key log: nothing of it can be tied to a face. */
const NO_KEYS: Keys = { text: "", typed: [], pauses: [], deleted: [] };

/** How often the pill asks what is in view while the camera is on: a face
 *  that left is said within a moment, and nothing is read for the asking. */
const SEEN_EVERY_MS = 500;

/** How often what the draft would carry is worked out again while nothing but
 *  time has passed: it reads everything watched since the last message, which
 *  for a draft of twenty minutes takes a sixth of a second. Oftener while it
 *  is being looked at. */
const DRAFT_EVERY_MS = 3000;
const DRAFT_SHOWN_EVERY_MS = 1000;

/** The tour walks this window (`app/onboarding.ts`): it reads no face. */
const coaching = (): boolean => document.body.classList.contains("coaching");

const failed = (state: SourceState | null): boolean => state === "refused" || state === "absent" || (state !== null && typeof state === "object");

export interface Face extends FaceBlocks {
	/** Flips the switch, as the menu's item and `/face` do: off when a face is
	 *  read, and on otherwise, by way of the sheet until it was agreed to. */
	toggle(): void;
	/** The rows a block's menu gains for the block that opens at `from`: what
	 *  its message carried, shown in a menu at (x, y). None until the user has
	 *  agreed to a face being read. */
	rows(from: number, x: number, y: number): MenuItem[];
	/** Answers the canvas's report of a prompt being written, puts the pill in
	 *  `model`'s chip, and from here on follows the preference in `host`'s
	 *  window: `model` forgets what pi runs when pi was stopped for a change. */
	mount(host: Pick<AppContext, "turn" | "busy" | "notify">, model: Pick<ModelPicker, "forget" | "chip" | "onState">): HostFragment<"prompt-edit" | "aside-dismiss">;
}

export function createFace(chat: AppContext["chat"], sid: string): Face {
	const logs = new PromptLogs();
	/** How the face is read and what is passed on, as the user has it set now. */
	const tuned = () => tunedOf(preferences().faceTuning);
	/** The prompt last typed in, which is the message being written. */
	let drafting: number | null = null;
	/** A camera reads the face, so there is a picture to show. */
	let pictured = false;
	/** When the face read the last answer, with where that answer is in the
	 *  document; `null` once a message has carried it or none was read. */
	let reading: (ReadWindow & { answer: { from: number; to: number } }) | null = null;
	let lastKey = -Infinity;
	let readEnds: ReturnType<typeof setTimeout> | undefined;
	/** The agent speaking first (ADR 0061): how often it was asked this
	 *  session and what came of it, what stops it, and the model that answers. */
	const unprompted: Unprompted = { asked: 0, spoke: 0, silent: 0, silentRun: 0, dismissed: false };
	let modelId = "";
	let quiet: ReturnType<typeof setTimeout> | undefined;
	/** Asks pi off the page; set at mount. */
	let ask: ((block: string) => Promise<string | null>) | null = null;
	let hostBusy: () => boolean = () => false;
	let detector: FaceDetector | null = null;
	let asked: number | null = null;
	// Unknown until the preferences are first heard, which is no change: the pi
	// that may already run was started by a Rust that had read the same file.
	let on: boolean | null = null;
	let say: (message: string) => void = () => {};
	let idle: ReturnType<typeof setTimeout> | undefined;
	let looking: ReturnType<typeof setInterval> | undefined;
	let pill: Pill | null = null;
	/** Where whatever reads the face last said it stands. */
	let state: SourceState | null = null;
	let cameras: readonly string[] = [];

	/** The block `message` ends with, for a prompt whose body is `body` and
	 *  whose keys are `keys`; empty with nothing to say. */
	const blockOf = (message: string, body: string, keys: ReturnType<PromptLogs["peek"]>): string => {
		if (!detector) return "";
		const said = body.trim();
		const at = said ? message.indexOf(said) : -1;
		// A body pi is handed in other words (an escaped marker look-alike, a
		// prefix replaced) has no place in the message to tie a face to, and
		// neither has one with no key log: what is left is the reading, which
		// is tied to no words.
		const tied = keys !== null && at >= 0;
		const offset = tied ? at - (body.length - body.trimStart().length) : 0;
		const read = reading && performance.now() - reading.from <= READ_FRESH_MS ? { reading } : {};
		return renderFace(filtered(assemble({ steps: detector.steps(), keys: tied ? keys : NO_KEYS, message, offset, ...read }), tuned().threshold), message);
	};
	/** What the message being written would end with were it sent now. Asking
	 *  changes nothing: no log is dropped for it. */
	const draft = (): string => {
		if (!on) return "";
		// With nothing written yet there is still what the face did reading the answer.
		const body = drafting === null ? "" : bodyOf(drafting)();
		// A command carries none (`app/turn.ts`).
		if (body === null || body.trimStart().startsWith("/")) return "";
		return blockOf(body.trim(), body, drafting === null ? null : logs.peek(drafting, body));
	};

	let would = "";
	let wouldAt = -Infinity;
	/** Draws the pill, and the panel when it is open. `fresh` when something
	 *  other than time changed what the draft would carry. */
	const paint = (fresh = false): void => {
		const { face, faceExplained, faceCamera, faceTuning } = preferences();
		const now = performance.now();
		const shown = pillState({ face, explained: faceExplained, source: state, seen: detector?.seen(now) ?? null });
		const says = pillSays(shown, state);
		if (fresh || now - wouldAt >= (inspector.isOpen() ? DRAFT_SHOWN_EVERY_MS : DRAFT_EVERY_MS)) {
			would = draft();
			wouldAt = now;
		}
		pill?.show({ state: shown, says, cameras, camera: faceCamera, lines: would !== "", speaks: preferences().faceSpeaks });
		if (inspector.isOpen()) inspector.show({ says, inspection: detector?.inspect(now) ?? null, draft: would, reading: readingOf(faceTuning), camera: pictured, unprompted: preferences().faceSpeaks ? unprompted : null, judged: judged() });
	};

	const keep = (change: Partial<Preferences>): void => {
		preferencesWrite({ ...preferences(), ...change }).catch((error: unknown) => say(`That change could not be saved: ${String(error)}`));
	};
	const inspector = createInspector({
		tune: (change) => keep({ faceTuning: { ...readingOf(preferences().faceTuning), ...change } }),
		reset: () => keep({ faceTuning: MEASURED }),
		picture: (host) => void detector?.picture(host),
	});

	const adopt = (found: FaceDetector): void => {
		detector = found;
		found.onCameras((labels) => {
			cameras = labels;
			paint();
		});
		found.onState((next) => {
			// A camera that could not be had is still so once the watch for it
			// ends: the pill keeps saying it until it is let go (`release`).
			if (next === "stopped" && failed(state)) return;
			state = next;
			clearInterval(looking);
			// What is in view changes with no word from the source.
			if (next === "watching") looking = setInterval(paint, SEEN_EVERY_MS);
			paint(true);
		});
	};

	// A script that cannot be read as one throws here, unhandled and so loud: a
	// run driven by a script that was misread would pass for the wrong reason.
	const source = faceSource().catch(() => ({ kind: "none" as const }));
	void source.then((found) => {
		if (found?.kind === "script") adopt(scriptedDetector(parseFaceScript(found.script), tuned));
	});

	/** The camera's detector, made the first time it is wanted. */
	let camera: Promise<void> | null = null;
	const wantCamera = (): Promise<void> =>
		(camera ??= source.then(async (found) => {
			if (found?.kind !== "camera") return;
			const { cameraSource } = await import("./mediapipe.ts");
			pictured = true;
			adopt(sampledDetector(cameraSource({ wanted: () => preferences().faceCamera }), tuned));
		}));

	const stop = (): void => {
		clearTimeout(idle);
		idleAt = -Infinity;
		detector?.stop();
		// A reading the camera went off in the middle of ends where it went off.
		const now = performance.now();
		if (reading && now < reading.to) reading.to = Math.max(now, reading.from);
	};
	/** When the watch now running ends unless something extends it. */
	let idleAt = -Infinity;
	/** Watches from `at` for `ms` more, and never for less than was already meant. */
	const watch = (at: number, ms = IDLE_STOP_MS): void => {
		void wantCamera().then(() => {
			// The window went behind, or the preference off, while the camera loaded.
			if (!on || !document.hasFocus()) return;
			detector?.start(at);
			idleAt = Math.max(idleAt, performance.now() + ms);
			clearTimeout(idle);
			idle = setTimeout(stop, idleAt - performance.now());
		});
	};

	/** The answer that stands last in the document, if it is one to read: text
	 *  pi wrote, not an error the app put there. `said` is what it says, to tell
	 *  it from the one that stood there before. */
	const lastAnswer = (): { from: number; to: number; said: string } | null => {
		const md = chat.getDocument();
		const { segments } = parseDocument(md);
		for (let i = segments.length - 1; i >= 0; i--) {
			if (segments[i]!.kind !== "user") continue;
			const span = answerRange(segments, i);
			if (!span) continue;
			const said = segments.filter((segment) => segment.kind === "assistant" && segment.from >= span.from && segment.to <= span.to).at(-1);
			return said?.text && !said.text.startsWith("**Error:**") ? { ...span, said: `${span.from}:${md.slice(span.from, span.to)}` } : null;
		}
		return null;
	};
	/** The last answer as it stood when the message now with pi was sent. A turn
	 *  that ends with the same one standing wrote none: a command pi handled, a
	 *  send it refused, a turn that failed. */
	let answerBefore: string | null = null;
	const sending = (): void => void (answerBefore = lastAnswer()?.said ?? null);
	/** A turn has ended: for a few seconds the face is read as reading the
	 *  answer, if the user is at it. Not while they are writing, not behind
	 *  another window, not with the answer scrolled out of sight. */
	/**
	 * The answer was read with no key since, and the face moved: pi is shown
	 * what it did, with no word of the user's, and may add a sentence or two
	 * under its answer or say nothing. Once for an answer, and never to answer
	 * what it said unasked itself.
	 */
	const speakFirst = async (): Promise<void> => {
		const read = reading;
		if (!read || !ask || !detector || !on || !preferences().faceSpeaks || coaching() || hostBusy() || !document.hasFocus()) return;
		if (lastKey > read.from || !mayAsk(unprompted, modelId)) return;
		// Marked or stronger, whatever the user passes on with a message.
		const block = renderFace(filtered(assemble({ steps: detector.steps(), keys: NO_KEYS, message: "", reading: read }), unaskedThreshold(tuned().threshold)), "");
		if (!block) return;
		// It goes with this message: the next one does not say it again.
		reading = null;
		const said = await ask(block);
		// Not taken, or cut off: pi was not asked, as far as the count goes.
		if (said === null) return paint(true);
		unprompted.asked++;
		if (isSilent(said)) {
			unprompted.silent++;
			unprompted.silentRun++;
			return paint(true);
		}
		unprompted.spoke++;
		unprompted.silentRun = 0;
		// Under the answer it is about, with the reader's place and caret left alone.
		chat.edit((md) => {
			const at = lastAnswer()?.to;
			if (at === undefined) return null;
			// A blank line on either side of it, whatever stands there already
			// (`document-format.md` §Serialization rules).
			const above = /\n*$/.exec(md.slice(0, at))![0].length;
			const below = /^\n*/.exec(md.slice(at))![0].length;
			const blank = (have: number) => "\n".repeat(Math.max(0, 2 - have));
			return { changes: { from: at, to: at, insert: `${blank(above)}${ASIDE_MARKER}\n\n${escapeBody(said)}${blank(below)}` } };
		});
		paint(true);
	};

	const answered = (): void => {
		reading = null;
		clearTimeout(readEnds);
		clearTimeout(quiet);
		const now = performance.now();
		if (!on || coaching() || !document.hasFocus() || now - lastKey < WRITING_MS) return;
		const answer = lastAnswer();
		if (!answer || answer.said === answerBefore || !chat.shows(answer.from, answer.to)) return;
		reading = { from: now, to: now + READ_WINDOW_MS, answer };
		watch(now, READ_WINDOW_MS + READ_LINGER_MS);
		quiet = setTimeout(() => void speakFirst(), QUIET_MS);
		// Scrolled away meanwhile: whatever the face did was not about the answer.
		readEnds = setTimeout(() => {
			if (reading && !chat.shows(reading.answer.from, reading.answer.to)) reading = null;
			// And once it is too old to send, the pill stops marking it.
			readEnds = setTimeout(() => paint(true), READ_FRESH_MS - READ_WINDOW_MS + 1);
		}, READ_WINDOW_MS);
	};
	/** Lets go of a camera that could not be had, so the next key asks again. */
	const release = (): void => {
		stop();
		state = null;
		paint();
	};
	// Only the window in front reads a face: behind another, the user is not at it.
	window.addEventListener("blur", stop);
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) stop();
	});
	// Come back to, perhaps from System Settings: what was refused is asked for
	// again at the next key.
	window.addEventListener("focus", () => {
		if (failed(state)) release();
		offer();
	});

	const turnOff = (): void => keep({ face: false });
	/** The sheet, and what its two answers keep. Declined, a switch that was
	 *  on without it goes off: on and not agreed to is not a state to stay in. */
	const explain = (): void =>
		openFaceSheet(
			chat,
			() => keep({ face: true, faceExplained: true }),
			() => {
				if (preferences().face) turnOff();
			},
		);
	const turnOn = (): void => {
		if (preferences().faceExplained) keep({ face: true });
		else explain();
	};
	/** A switch turned on elsewhere (the Preferences window, an older build)
	 *  with the sheet never agreed to: the window in front shows it, once for
	 *  each time the switch is found so. Never while the tour walks. */
	let offered = false;
	const offer = (): void => {
		const { face, faceExplained } = preferences();
		if (!face || faceExplained) offered = false;
		else if (!offered && document.hasFocus() && !coaching()) {
			offered = true;
			explain();
		}
	};

	function bodyOf(ordinal: number): () => string | null {
		return () => {
			const md = chat.getDocument();
			const prompt = parseDocument(md).segments.filter((segment) => segment.kind === "user")[ordinal];
			return prompt ? md.slice(prompt.bodyFrom, prompt.to) : null;
		};
	}

	/** What pi holds for the prompt at `from`. Starts this window's pi to ask,
	 *  as reading anything else out of its transcript does. */
	const sent = async (from: number): Promise<Sent> => {
		try {
			await piStart(sid);
			const reply = await piSend(sid, { type: "get_entries" });
			if (reply?.success !== true || !reply.data) return "unknown";
			return sentOf(chat.getDocument(), from, (reply.data["entries"] ?? []) as Parameters<typeof sentOf>[2], (reply.data["leafId"] ?? null) as string | null);
		} catch {
			return "unknown";
		}
	};

	return {
		blockFor(message, prompt) {
			sending();
			asked = prompt.ordinal;
			if (!on || !detector) return "";
			const keys = logs.keys(prompt.ordinal, prompt.body);
			return blockOf(message, prompt.body, keys);
		},
		taken() {
			// A command comes here with no block asked for: it was sent all the same.
			if (asked === null) sending();
			if (asked !== null) logs.forget(asked);
			// A command is taken with no block asked for, and is as much gone.
			drafting = null;
			asked = null;
			// The keys so far wrote the message that has gone: what counts as
			// writing when its answer appears is a key after this.
			lastKey = -Infinity;
			// The reading went with this message, or is behind it.
			reading = null;
			clearTimeout(readEnds);
			stop();
			detector?.clear();
			paint(true);
		},
		toggle: () => (on ? turnOff() : turnOn()),
		rows(from, x, y) {
			// Asking starts a pi, which the tour's window does not do for a look.
			const prompt = preferences().faceExplained && !coaching() ? promptIn(chat.getDocument(), from) : null;
			if (prompt === null) return [];
			return [{ section: "face" }, { label: "face: what was sent", title: "The face block this message carried, as pi's transcript holds it", run: () => void sent(prompt).then((found) => openMenu(x, y, sentRows(found, judge))) }];
		},
		mount({ turn, busy, notify }, model) {
			say = notify;
			hostBusy = busy;
			ask = (block) => turn.aside(block);
			model.onState((state) => {
				const id = (state["model"] as { id?: unknown } | undefined)?.id;
				modelId = typeof id === "string" ? id : "";
			});
			pill = mountPill(model.chip, {
				turnOn,
				turnOff,
				retry: () => {
					release();
					watch(performance.now());
				},
				openSettings: () => void openCameraSettings().catch((error: unknown) => notify(String(error))),
				setSpeaks: (speaks) => keep({ faceSpeaks: speaks }),
				inspect: (anchor) => {
					inspector.toggle(anchor);
					paint(true);
				},
				choose: (label) => {
					keep({ faceCamera: label });
					// Read from the chosen camera at the next key, not at the idle stop.
					stop();
				},
			});
			paint();
			let stale = false;
			const restart = async (): Promise<void> => {
				if (!stale || busy()) return;
				stale = false;
				if (await turn.stopPi()) model.forget();
			};
			let ran = turn.running;
			turn.onChanged(() => {
				// A turn that was running when the preference changed has ended.
				void restart();
				if (ran && !turn.running) answered();
				ran = turn.running;
			});
			watchPreferences((kept) => {
				const reads = kept.face && kept.faceExplained;
				offer();
				const first = on === null;
				const changed = reads !== on;
				on = reads;
				if (changed && !on) {
					logs.clear();
					drafting = null;
					reading = null;
					inspector.close();
					release();
					detector?.clear();
				}
				// After what the change let go of: a pill switched off marks no draft.
				paint(true);
				if (!changed || first) return;
				stale = true;
				void restart();
			});
			return {
				"aside-dismiss": ({ from }) => {
					// A page being written to is not a page to take a block out of.
					if (busy()) return;
					const md = chat.getDocument();
					const { segments } = parseDocument(md);
					const next = deleteSegment(md, segments, segments.findIndex((segment) => segment.kind === "aside" && segment.from === from));
					if (next === null) return;
					chat.replaceDocument(next);
					unprompted.dismissed = true;
					paint(true);
				},
				"prompt-edit": ({ prompt, edits }) => {
					if (!on || !edits[0] || coaching()) return;
					clearTimeout(quiet);
					// The first key ends a reading: from here the face is the writing's.
					if (reading && edits[0].at < reading.to) reading.to = Math.max(edits[0].at, reading.from);
					lastKey = edits[0].at;
					watch(edits[0].at);
					logs.take(prompt, edits, bodyOf(prompt));
					drafting = prompt;
					// What the message would carry changes with every word.
					if (inspector.isOpen()) paint();
				},
			};
		},
	};
}
