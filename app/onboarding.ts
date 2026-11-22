// The first run: a splash, then a guided walk through the tour document that
// lets the reader do only what the current step asks (ADR 0038).
//
// Whether a window shows the splash or walks its tour is decided from the
// store, at boot (`app/boot.ts`): the main window with nothing stored under
// `welcome` is a first run, and a tour Help → Welcome wrote that nobody has
// touched is walked at once. Nothing about the tour is kept anywhere that
// outlives the store: finishing or quitting saves the document, which is what
// ends the first run. A reload mid-walk picks it up again from the window's
// session storage. Which step comes next, and what each lets through, is
// `app/onboarding-steps.ts`; this module reads the page into what those rules
// take, and draws the cutout, the arrow and the card.

import type { EditorView } from "@codemirror/view";
import { parseDocument } from "../src/document/format.ts";
import type { AppContext } from "./context.ts";
import type { MenuId } from "./menubar.ts";
import { ACTIONS, type Action, advance, GATES, keyAllowed, label, offers, progress, recordedExchange, SAID, type Seen, type Step, tourExchange } from "./onboarding-steps.ts";
import type { TourStart } from "./boot.ts";
import "./onboarding.css";

/** Where a window remembers, across a reload, that it is walking its tour. */
const walkingKey = (sid: string) => `piary-walking:${sid}`;

/** Said when the reader quits, so they know where the tour went. */
export const QUIT_SAID = "The tour is still here whenever you want it: Help → Welcome to Piary.";

/** The cutout's margin around what a step points at. */
const PAD_PX = 6;
/** The gap between the cutout and the card. */
const CARD_GAP_PX = 12;
/** The arrow's length, kept clear between the card and its cutout. */
const ARROW_PX = 20;
/** The space between the arrow's tip and the cutout it points at. */
const ARROW_GAP_PX = 3;
/** How far left of the arrow the card starts, so the arrow meets its body. */
const CARD_LEAD_PX = 40;
/** How far in from the right of a block's menu anchor its `⋯` is drawn. */
const MENU_GLYPH_PX = 10;
/** The narrowest cutout: an empty line is still something to point at. */
const MIN_HOLE_PX = 24;
/** How many frames a step waits for what it points at to be drawn — a cell
 *  that failed to run, a list that is hidden — before the tour moves past it. */
const MISSING_FRAMES = 120;
/** How far above the window's bottom the card waits while the walk stands
 *  aside, clear of the model chip and its Sign in button. */
const ASIDE_BOTTOM_PX = 64;
/** How often the walk redraws in a window WebKit counts as hidden. */
const HIDDEN_FRAME_MS = 50;
/** Where a step's card sits against its cutout. Above for the question,
 *  whose answer below must stay in view; right of a small mark inside text,
 *  where above or below would cover the words around it; else below, or
 *  above when below has no room. */
const CARD_SIDE: Partial<Record<Step, "above" | "right">> = { edit: "above", send: "above", "block-menu": "right" };
/** How wide the empty prompt's cutout is: its gesture hint, not the page. */
const GHOST_WIDTH_PX = 440;

function walking(sid: string): boolean {
	try {
		return sessionStorage.getItem(walkingKey(sid)) === "1";
	} catch {
		return false;
	}
}

function setWalking(sid: string, on: boolean): void {
	try {
		if (on) sessionStorage.setItem(walkingKey(sid), "1");
		else sessionStorage.removeItem(walkingKey(sid));
	} catch {}
}

/** What the menu bar asks before it runs an item: whether the tour holds it. */
export interface Onboarding {
	held(id: MenuId): boolean;
}

interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface Target {
	box: Box;
	/** Where the arrow points, when not at the box's top centre. */
	point?: { x: number; y: number };
	/** Brought into view when the step begins. */
	reveal: () => void;
}

function boxOf(el: Element | null | undefined): Box | null {
	if (!el || !el.isConnected) return null;
	const r = el.getBoundingClientRect();
	return r.width || r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
}

/** The screen box of the document text `from`..`to`, the width of the page. */
function rangeBox(view: EditorView, from: number, to: number): Box | null {
	const a = view.coordsAtPos(from, 1);
	const b = view.coordsAtPos(to, -1);
	if (!a || !b) return null;
	// One line: just its text, at least a caret's worth wide. More: the page's
	// width, since the lines between start and end run to its edges.
	if (Math.abs(a.top - b.top) < 2) return { left: a.left, right: Math.max(b.right, a.left + MIN_HOLE_PX), top: a.top, bottom: Math.max(a.bottom, b.bottom) };
	const page = view.contentDOM.getBoundingClientRect();
	return { left: page.left, right: page.right, top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) };
}

/** The box of what `el` draws, not of the blocks it sits in: a cell's
 *  output and its form are as wide as the page, its slider and sentence are
 *  not. The union of its text and its controls. */
function contentBox(el: Element | null | undefined): Box | null {
	if (!el || !el.isConnected) return null;
	let box: Box | null = null;
	const add = (r: DOMRect) => {
		if (!r.width && !r.height) return;
		box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
	};
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node instanceof Text) {
			if (!node.data.trim()) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			add(range.getBoundingClientRect());
		} else if (node instanceof HTMLInputElement || node instanceof HTMLButtonElement || node instanceof HTMLSelectElement || node instanceof SVGSVGElement || node instanceof HTMLCanvasElement || node instanceof HTMLImageElement) {
			add(node.getBoundingClientRect());
		}
	}
	return box;
}

function revealAt(view: EditorView, pos: number): () => void {
	return () => {
		const line = view.domAtPos(pos).node;
		(line instanceof Element ? line : line.parentElement)?.scrollIntoView({ block: "center" });
	};
}

/** Mounts the splash or the guide, whichever this window owes. */
export function mountOnboarding(
	ctx: Pick<AppContext, "chat" | "sid" | "notify" | "busy">,
	{ tour, chip, keep }: { tour: TourStart; chip: HTMLElement; keep: (md: string) => Promise<void> },
): Onboarding {
	const { chat, sid, notify } = ctx;
	let step: Step | null = null;
	let sendTried = false;
	let ranSinceSend = false;
	// The answer under the question when the send went: a turn too quick for any
	// frame to see it running still shows as an answer that changed.
	let answerAtSend: string | null = null;
	let sliderMoved = false;
	let missing = 0;
	// The sign-in panel, as last seen, and whether one opened this step closed.
	let signInWasOpen = false;
	let signInEnded = false;
	// Whether this step's target has been brought into view: it may be drawn
	// frames after the step begins (a cell runs lazily).
	let revealed = false;
	// The splash, while it shows: the window takes nothing else.
	let screen: HTMLElement | null = null;

	const layer = document.createElement("div");
	layer.className = "coach";
	const hole = document.createElement("div");
	hole.className = "coach-hole";
	// Four panes around the cutout take the pointer; a fifth covers the cutout
	// itself on a step the reader only reads.
	const pane = () => {
		const p = document.createElement("div");
		p.className = "coach-pane";
		return p;
	};
	const [above, below, leftPane, rightPane, over] = [pane(), pane(), pane(), pane(), pane()];
	const panes = [above, below, leftPane, rightPane, over];
	const arrow = document.createElement("div");
	arrow.className = "coach-arrow";
	arrow.setAttribute("aria-hidden", "true");
	const card = document.createElement("div");
	card.className = "coach-card";
	card.setAttribute("role", "dialog");
	card.setAttribute("aria-label", "Piary tour");
	const count = document.createElement("p");
	count.className = "coach-progress";
	const said = document.createElement("p");
	said.className = "coach-text";
	const row = document.createElement("div");
	row.className = "coach-row";
	const quit = button("Quit onboarding", "coach-quit");
	const buttons = Object.fromEntries(ACTIONS.map((action) => [action, button("", action === "next" ? "coach-next" : `coach-${action}`)])) as Record<Action, HTMLButtonElement>;
	row.append(quit, ...ACTIONS.map((action) => buttons[action]));
	card.append(count, said, row);
	layer.append(hole, ...panes, arrow, card);

	const seen = (): Seen => ({
		sliderMoved,
		seededPrompt: exchange()?.question.text ?? null,
		answer: exchange()?.answer ?? null,
		sendTried,
		ranSinceSend,
		busy: ctx.busy(),
		needsSignIn: chip.classList.contains("model-chip--needs-sign-in"),
		signInOpen: signInPanelOpen(),
		signInEnded,
		listShown: document.body.classList.contains("conversations-shown"),
	});

	const segments = () => parseDocument(chat.getDocument()).segments;
	const exchange = () => tourExchange(chat.getDocument());
	const seededSpan = () => exchange()?.question ?? null;

	const target = (at: Step): Target | null => {
		const view = chat.view;
		switch (at) {
			case "slider": {
				const sentence = document.querySelector("p.tour-coffee");
				const out = sentence?.parentElement;
				const box = contentBox(out);
				// The arrow points at the thumb, which is what is dragged.
				const input = out?.querySelector<HTMLInputElement>('input[type="range"]');
				const track = boxOf(input);
				const share = input ? (Number(input.value) - Number(input.min || 0)) / ((Number(input.max || 100) - Number(input.min || 0)) || 1) : 0.5;
				const point = track ? { x: track.left + share * (track.right - track.left), y: (track.top + track.bottom) / 2 } : undefined;
				return box ? { box, point, reveal: () => out?.scrollIntoView({ block: "center" }) } : null;
			}
			case "edit":
			case "send": {
				const span = view && seededSpan();
				if (!view || !span) return null;
				const box = rangeBox(view, span.from, span.to);
				if (!box) return null;
				// The word to change, while it is still there; then the prompt's end,
				// where ⌘⏎ is pressed.
				const word = at === "edit" ? span.text.search(/\bthree\b/i) : -1;
				const a = view.coordsAtPos(word >= 0 ? span.from + word : span.to, 1);
				const b = word >= 0 ? view.coordsAtPos(span.from + word + 5, -1) : a;
				const point = a && b ? { x: (a.left + b.right) / 2, y: a.top } : undefined;
				return { box, point, reveal: revealAt(view, span.from) };
			}
			case "sign-in":
			case "sign-in-failed": {
				const box = boxOf(document.querySelector(".sign-in-alert:not([hidden])"));
				return box ? { box, reveal: () => {} } : null;
			}
			case "block-menu": {
				const answer = segments().find((segment) => segment.kind === "assistant");
				const anchor = answer ? chat.blockMenuAnchor(answer.from) : null;
				const box = contentBox(anchor);
				// At the `⋯`, the anchor's last glyph, not the role name before it.
				const point = box ? { x: box.right - MENU_GLYPH_PX, y: box.top } : undefined;
				return box ? { box, point, reveal: () => anchor?.scrollIntoView({ block: "center" }) } : null;
			}
			case "conversations": {
				const box = contentBox(document.querySelector(".conversations"));
				return box ? { box, reveal: () => {} } : null;
			}
			case "model": {
				const box = boxOf(chip);
				return box ? { box, reveal: () => {} } : null;
			}
			case "your-turn": {
				const tail = segments().at(-1);
				if (!view || tail?.kind !== "user") return null;
				// The empty prompt's line, and the gesture hint drawn under it
				// (`.doc-line-ghost`): as wide as what it says, not the page.
				const end = chat.getDocument().length;
				const line = view.contentDOM.querySelector(".cm-line.doc-line-ghost");
				const r = line?.getBoundingClientRect();
				const box = r && r.height ? { left: r.left, top: r.top, right: Math.min(r.right, r.left + GHOST_WIDTH_PX), bottom: r.bottom + r.height } : rangeBox(view, end, end);
				return box ? { box, reveal: () => line?.scrollIntoView({ block: "center" }) } : null;
			}
		}
	};

	const enter = (at: Step) => {
		// pi's own refusal, paths and all, is said on the status line; the
		// card says it for the tour, so the line is cleared rather than left
		// over every step after.
		if (at === "sign-in" && step === "send") notify("");
		step = at;
		sendTried = false;
		ranSinceSend = false;
		missing = 0;
		said.textContent = SAID[at];
		for (const action of ACTIONS) buttons[action].textContent = label(at, action);
		revealed = false;
		signInEnded = false;
		// The edit step selects the word to change, so typing replaces it wherever
		// focus was; the send step — reached again after a sign-in — puts the
		// caret at the question's end, where ⌘⏎ sends it.
		const span = at === "edit" || at === "send" ? seededSpan() : null;
		const word = at === "edit" && span ? span.text.search(/\bthree\b/i) : -1;
		if (span && chat.view) {
			chat.view.dispatch({ selection: word >= 0 ? { anchor: span.from + word, head: span.from + word + 5 } : { anchor: span.to } });
			chat.view.focus();
		}
	};

	const end = (quitting: boolean) => {
		step = null;
		setWalking(sid, false);
		// Stored, so the next launch is not a first run, whatever was edited.
		void keep(chat.getDocument());
		layer.remove();
		document.body.classList.remove("coaching");
		if (quitting) notify(QUIT_SAID);
	};

	const go = (action?: Action) => {
		if (!step) return;
		const after = advance(step, seen(), action);
		if (after === null) end(false);
		else if (after !== step) enter(after);
	};

	/** A button on the card. Later writes the recorded exchange over whatever
	 *  the question and its answer hold, so the walk goes on with no model call;
	 *  Try again opens the sign-in panel at once. */
	const act = (action: Action) => {
		if (!step || !offers(step, seen()).includes(action)) return;
		if (action === "later") {
			chat.edit((md) => {
				const change = recordedExchange(md);
				return change ? { changes: change } : null;
			});
		}
		go(action);
		if (action === "retry") document.querySelector<HTMLElement>(".sign-in-alert:not([hidden])")?.click();
	};

	const place = (box: Box, point: { x: number; y: number } | undefined, interactive: boolean, side: "above" | "right" | undefined) => {
		const l = box.left - PAD_PX;
		const t = box.top - PAD_PX;
		const r = box.right + PAD_PX;
		const b = box.bottom + PAD_PX;
		Object.assign(hole.style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
		Object.assign(above.style, { left: "0", top: "0", width: "100%", height: `${Math.max(0, t)}px` });
		Object.assign(below.style, { left: "0", top: `${b}px`, width: "100%", bottom: "0", height: "auto" });
		Object.assign(leftPane.style, { left: "0", top: `${t}px`, width: `${Math.max(0, l)}px`, height: `${b - t}px` });
		Object.assign(rightPane.style, { left: `${r}px`, top: `${t}px`, right: "0", width: "auto", height: `${b - t}px` });
		Object.assign(over.style, { left: `${l}px`, top: `${t}px`, width: `${r - l}px`, height: `${b - t}px` });
		over.hidden = interactive;

		// The card sits beside the cutout — below it, or above for a step whose
		// answer below must stay in view — and the arrow bridges the gap, from
		// the card to the spot it is about.
		const cardBox = card.getBoundingClientRect();
		const gap = CARD_GAP_PX + ARROW_PX;
		const fitsRight = r + gap + cardBox.width <= innerWidth - CARD_GAP_PX;
		arrow.classList.remove("coach-arrow--up", "coach-arrow--left");
		if (side === "right" && fitsRight) {
			const y = (t + b) / 2;
			card.style.left = `${Math.round(r + gap)}px`;
			card.style.top = `${Math.round(Math.min(Math.max(CARD_GAP_PX, y - CARD_LEAD_PX), innerHeight - cardBox.height - CARD_GAP_PX))}px`;
			arrow.classList.add("coach-arrow--left");
			arrow.style.left = `${Math.round(r + ARROW_GAP_PX)}px`;
			arrow.style.top = `${Math.round(y)}px`;
			return;
		}
		const fitsBelow = b + gap + cardBox.height <= innerHeight - CARD_GAP_PX;
		const fitsAbove = t - gap - cardBox.height >= CARD_GAP_PX;
		const cardBelow = side === "above" ? !fitsAbove : fitsBelow || !fitsAbove;
		const top = cardBelow ? Math.min(b + gap, innerHeight - cardBox.height - CARD_GAP_PX) : Math.max(CARD_GAP_PX, t - gap - cardBox.height);
		const x = Math.min(Math.max(point?.x ?? (box.left + box.right) / 2, l + ARROW_PX), r - ARROW_PX);
		const left = Math.min(Math.max(CARD_GAP_PX, x - CARD_LEAD_PX), innerWidth - cardBox.width - CARD_GAP_PX);
		card.style.left = `${Math.round(left)}px`;
		card.style.top = `${Math.round(top)}px`;
		arrow.classList.toggle("coach-arrow--up", cardBelow);
		arrow.style.left = `${Math.round(x)}px`;
		arrow.style.top = `${Math.round(cardBelow ? b + ARROW_GAP_PX : t - ARROW_GAP_PX)}px`;
	};

	/** The sign-in panel is drawn in the document; while it shows, the tour
	 *  stands aside so it can be used. */
	const signInPanelOpen = () => document.querySelector(".doc-login") !== null;
	const suspended = signInPanelOpen;

	/** One frame of the walk: where it is, and where its pieces are drawn. */
	const tick = () => {
		if (!step) return;
		if (sendTried && (ctx.busy() || (exchange()?.answer ?? null) !== answerAtSend)) ranSinceSend = true;
		const open = signInPanelOpen();
		// The panel is drawn where the document asks, often below the fold:
		// brought into view, or the click that opened it seems to do nothing.
		if (open && !signInWasOpen) document.querySelector(".doc-login")?.scrollIntoView({ block: "center" });
		if (signInWasOpen && !open) signInEnded = true;
		signInWasOpen = open;
		go();
		if (!step) return;
		// While the sign-in panel asks, the walk stands aside: no scrim, no
		// cutout, and the card in the corner, so Sign in later stays in reach.
		const aside = suspended();
		layer.classList.toggle("coach--aside", aside);
		if (aside) {
			const offered = offers(step, seen());
			for (const action of ACTIONS) buttons[action].hidden = !offered.includes(action);
			const cardBox = card.getBoundingClientRect();
			card.style.left = `${Math.round(innerWidth - cardBox.width - CARD_GAP_PX)}px`;
			card.style.top = `${Math.round(innerHeight - cardBox.height - ASIDE_BOTTOM_PX)}px`;
			return;
		}
		const found = target(step);
		// Until what the step points at is drawn, the whole window is covered.
		// A target that never comes (a cell that failed) is passed rather than
		// stranding the reader: by the step's first button, or past the slider.
		if (!found && ++missing > MISSING_FRAMES) {
			const way = offers(step, seen())[0];
			if (way) act(way);
			else if (step === "slider") enter("edit");
		}
		if (!step) return;
		if (found) missing = 0;
		if (found && !revealed) {
			revealed = true;
			found.reveal();
		}
		const { at: n, of } = progress(step, document.body.classList.contains("conversations-shown"));
		count.textContent = `Step ${n} of ${of}`;
		const offered = offers(step, seen());
		for (const action of ACTIONS) buttons[action].hidden = !offered.includes(action);
		hole.hidden = arrow.hidden = !found;
		const middle = { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3 };
		place(found?.box ?? middle, found?.point, !!found && GATES[step].pointer, CARD_SIDE[step]);
	};

	// Every frame while the walk lasts, whatever one frame threw: a loop that
	// stopped would leave the cutout where the page used to be.
	const frame = () => {
		if (!step) return;
		try {
			tick();
		} finally {
			// WebKit runs no animation frame for a window it counts as hidden; a
			// timer still runs there.
			if (step) {
				if (document.hidden) setTimeout(frame, HIDDEN_FRAME_MS);
				else requestAnimationFrame(frame);
			}
		}
	};

	const begin = () => {
		setWalking(sid, true);
		document.body.classList.add("coaching");
		document.body.append(layer);
		enter("slider");
		frame();
	};

	// A scroll or a resize redraws at once, not at the next frame: the cutout
	// must never trail what it surrounds.
	const redraw = () => {
		if (step) tick();
	};
	addEventListener("scroll", redraw, true);
	addEventListener("resize", redraw);

	quit.addEventListener("click", () => end(true));
	for (const action of ACTIONS) buttons[action].addEventListener("click", () => act(action));
	document.addEventListener(
		"change",
		(event) => {
			// The slider or the number box beside it: both change the sentence.
			// `change`, not `input`: a slider fires `input` at a drag's first
			// pixel, and the next step scrolls its target into view under a
			// pointer still holding the thumb. `change` waits for the release.
			const cell = document.querySelector("p.tour-coffee")?.parentElement;
			if (step === "slider" && event.target instanceof Node && cell?.contains(event.target)) sliderMoved = true;
		},
		true,
	);

	// Keys go nowhere the step does not allow, before the canvas sees them.
	// The card's own buttons, and the sign-in panel while it shows, take theirs.
	addEventListener(
		"keydown",
		(event) => {
			const inside = event.target instanceof Node && (card.contains(event.target) || !!screen?.contains(event.target));
			if (inside) return;
			if (screen) {
				event.preventDefault();
				event.stopImmediatePropagation();
				return;
			}
			if (!step || suspended()) return;
			// The step as of this keystroke, not the last frame: a ⌘⏎ pressed right
			// after the change it waited for belongs to the send step.
			go();
			if (!step) return;
			const key = { key: event.key, mod: event.metaKey || event.ctrlKey, alt: event.altKey };
			if (keyAllowed(step, key) && inQuestion(step, key.key)) {
				if (key.key === "Enter" && key.mod) sent();
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
		},
		true,
	);

	/** On the edit and send steps, a key reaches the page only with the caret
	 *  in the question, and never moves it out across either end. */
	const inQuestion = (at: Step, key: string): boolean => {
		if (at !== "edit" && at !== "send") return true;
		const span = seededSpan();
		const sel = chat.view?.state.selection.main;
		if (!span || !sel || sel.from < span.from || sel.to > span.to) return false;
		if (key === "ArrowLeft" || key === "Home") return sel.head > span.from;
		if (key === "ArrowRight" || key === "End") return sel.head < span.to;
		return true;
	};

	/** A send let through: the send step watches its turn; the last step is
	 *  done by it. */
	const sent = () => {
		if (step === "send") {
			sendTried = true;
			answerAtSend = exchange()?.answer ?? null;
		}
		if (step === "your-turn") requestAnimationFrame(() => end(false));
	};

	if (tour === "walk" || walking(sid)) begin();
	else if (tour === "splash") {
		screen = splash(
			() => {
				screen = null;
				begin();
			},
			() => {
				screen = null;
				end(true);
			},
		);
	}

	return {
		held: (id) => {
			if (screen) return true;
			if (!step) return false;
			const keys = GATES[step].keys;
			if (id === "send" && (keys === "send" || keys === "all")) {
				sent();
				return false;
			}
			return id !== "save";
		},
	};
}

/** The window before the canvas on a first run. Its one panel is the welcome;
 *  sign-up or a tip of the day would be panels of their own beside it. */
function splash(start: () => void, quit: () => void): HTMLElement {
	const screen = document.createElement("div");
	screen.className = "splash";
	const panel = document.createElement("div");
	panel.className = "splash-panel";
	panel.setAttribute("role", "dialog");
	panel.setAttribute("aria-label", "Welcome to Piary");
	const title = document.createElement("h1");
	title.textContent = "Welcome to Piary";
	const lead = document.createElement("p");
	lead.textContent = "One canvas, not a chat. You and the agent write in the same markdown document, and any of it can be edited, any time.";
	const more = document.createElement("p");
	more.textContent = "A short tour shows you how, one step at a time.";
	const row = document.createElement("div");
	row.className = "splash-row";
	const go = button("Take the tour", "splash-start");
	const leave = button("Quit onboarding", "splash-quit");
	row.append(leave, go);
	panel.append(title, lead, more, row);
	screen.append(panel);
	document.body.append(screen);
	go.focus();
	go.addEventListener("click", () => {
		screen.remove();
		start();
	});
	leave.addEventListener("click", () => {
		screen.remove();
		quit();
	});
	return screen;
}

function button(text: string, className: string): HTMLButtonElement {
	const b = document.createElement("button");
	b.type = "button";
	b.className = className;
	b.textContent = text;
	return b;
}
