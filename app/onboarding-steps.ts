// The guided tour's steps, as data: what each points at, what the reader may
// do while it shows, and where each leads (ADR 0038). No DOM here — the page
// (`app/onboarding.ts`) reads the world into a `Seen` each frame and asks this
// module where the tour is, so the order and the gate are testable without a
// page.
//
// The send step forks: a refusal for want of a provider leads to Sign in, and a
// sign-in that takes leads back to the send. One that fails offers Try again or
// Sign in later; later — or Next after a refusal of any other kind — goes on
// with the recorded exchange (`recordedExchange`) instead of a model call.

import { parseDocument } from "../src/document/format.ts";

/** Every step. The order of the walk is `advance`'s, not this list's. */
export const STEPS = ["slider", "edit", "send", "sign-in", "sign-in-failed", "block-menu", "conversations", "model", "your-turn"] as const;
export type Step = (typeof STEPS)[number];

/** What the reader can press on a step's card, beside Quit onboarding. */
export const ACTIONS = ["retry", "later", "next"] as const;
export type Action = (typeof ACTIONS)[number];

/** The tour's question as written, and as the recorded exchange has it. */
export const TOUR_QUESTION = "Give me three names for a houseplant.";
export const RECORDED_QUESTION = "Give me five names for a houseplant.";
/** The answer the tour shows when it goes on without pi. */
export const RECORDED_ANSWER = "1. Fernando\n2. Leaf Erikson\n3. Spike\n4. Sprout\n5. Mossimo";

/** What the page saw this frame, all the tour's steps read. */
export interface Seen {
	/** The slider was dragged since the tour began. */
	sliderMoved: boolean;
	/** The text of the tour's question, or null when it is gone. */
	seededPrompt: string | null;
	/** The answer under the question, or null when there is none yet. */
	answer: string | null;
	/** A send was let through by this step's gate. */
	sendTried: boolean;
	/** A turn has run since that send. */
	ranSinceSend: boolean;
	/** A turn is running now. */
	busy: boolean;
	/** pi refused a prompt for want of a provider (the red Sign in button). */
	needsSignIn: boolean;
	/** The sign-in panel is open. */
	signInOpen: boolean;
	/** A sign-in panel opened during this step has closed. */
	signInEnded: boolean;
	/** The conversation list is on screen. */
	listShown: boolean;
}

/** What the reader may do while a step shows. `pointer` lets clicks through
 *  the cutout; `keys` says which keystrokes reach the page. */
export interface Gate {
	pointer: boolean;
	keys: "none" | "edit" | "send" | "all";
}

export const GATES: Record<Step, Gate> = {
	slider: { pointer: true, keys: "none" },
	edit: { pointer: true, keys: "edit" },
	send: { pointer: true, keys: "send" },
	"sign-in": { pointer: true, keys: "none" },
	"sign-in-failed": { pointer: true, keys: "none" },
	"block-menu": { pointer: false, keys: "none" },
	conversations: { pointer: false, keys: "none" },
	model: { pointer: false, keys: "none" },
	"your-turn": { pointer: true, keys: "all" },
};

/** What each step's card says. */
export const SAID: Record<Step, string> = {
	slider: "Drag the slider. The sentence under it changes, with no agent involved.",
	edit: "This is a question and the answer it got. Change three to five.",
	send: "Press ⌘⏎. The new answer replaces the old one, right here.",
	"sign-in": "pi has no provider to answer with yet. Sign in here: an API key or an account.",
	"sign-in-failed": "The sign-in did not finish. Try again, or sign in later and go on with a recorded answer.",
	"block-menu": "Every block has a menu here: run again, delete.",
	conversations: "Your conversations live here. New makes another.",
	model: "Pick the model here, and how hard it thinks.",
	"your-turn": "Your turn. Write anything here and press ⌘⏎: the answer lands under the prompt the caret is in.",
};

/** Where the reader is in the walk, as the card counts it: the sign-in
 *  steps are part of the send, and a hidden list is not counted. */
export function progress(step: Step, listShown: boolean): { at: number; of: number } {
	const counted: Step[] = ["slider", "edit", "send", "block-menu", ...(listShown ? (["conversations"] as const) : []), "model", "your-turn"];
	const as: Step = step === "sign-in" || step === "sign-in-failed" ? "send" : step;
	return { at: Math.max(1, counted.indexOf(as) + 1), of: counted.length };
}

/** The buttons a step's card shows now, in order. */
export function offers(step: Step, seen: Seen): Action[] {
	switch (step) {
		case "edit":
			return seen.seededPrompt !== null && seen.seededPrompt !== TOUR_QUESTION ? ["next"] : [];
		case "send":
			// A send pi refused for another reason, or never answered, is no dead end.
			return seen.sendTried && !seen.busy && !seen.needsSignIn ? ["later"] : [];
		case "sign-in":
			return ["later"];
		case "sign-in-failed":
			return ["retry", "later"];
		case "block-menu":
		case "conversations":
		case "model":
		case "your-turn":
			return ["next"];
		default:
			return [];
	}
}

/** What a button says on a step. */
export function label(step: Step, action: Action): string {
	if (action === "retry") return "Try again";
	if (action === "later") return step === "send" ? "Go on with a recorded answer" : "Sign in later";
	return step === "your-turn" ? "Finish" : "Next";
}

/** The step after `step`, given what was seen and the button pressed, if any;
 *  `step` itself while it is not done, null when the tour is over. Every
 *  `later` is the page's to carry out first: it writes the recorded exchange. */
export function advance(step: Step, seen: Seen, action?: Action): Step | null {
	if (action && !offers(step, seen).includes(action)) return step;
	switch (step) {
		case "slider":
			return seen.sliderMoved ? "edit" : step;
		case "edit":
			return action === "next" || (seen.seededPrompt !== null && /\b(five|5)\b/i.test(seen.seededPrompt)) ? "send" : step;
		case "send":
			if (action === "later") return "block-menu";
			if (!seen.sendTried) return step;
			if (seen.needsSignIn) return "sign-in";
			// A refusal ends the turn before pi is asked whether it has a provider,
			// so an error written as the answer is not the end of this step: the
			// Sign in step may be about to follow it (`app/turn.ts`).
			return seen.ranSinceSend && !seen.busy && !refused(seen.answer) ? "block-menu" : step;
		case "sign-in":
			if (action === "later") return "block-menu";
			// Signed in: back to the send, to ask pi again.
			if (!seen.needsSignIn) return "send";
			return seen.signInEnded ? "sign-in-failed" : step;
		case "sign-in-failed":
			if (action === "later") return "block-menu";
			if (!seen.needsSignIn) return "send";
			return action === "retry" || seen.signInOpen ? "sign-in" : step;
		case "block-menu":
			return action ? (seen.listShown ? "conversations" : "model") : step;
		case "conversations":
			return action ? "model" : step;
		case "model":
			return action ? "your-turn" : step;
		case "your-turn":
			return action ? null : step;
	}
}

/** A refusal written where the answer goes. A run that wrote no prose is not
 *  one: pi may have answered only through a tool, such as `canvas_edit`. */
function refused(answer: string | null): boolean {
	return answer !== null && answer.startsWith("**Error:**");
}

/** A keystroke, as far as the gate cares. */
export interface Key {
	key: string;
	mod: boolean;
	alt: boolean;
}

/** Whether `key` reaches the page during `step`. Editing keys stay on the
 *  line the pointer put the caret on: nothing that moves it to another block. */
export function keyAllowed(step: Step, { key, mod, alt }: Key): boolean {
	const keys = GATES[step].keys;
	if (keys === "all") return true;
	const send = key === "Enter" && mod && !alt;
	if (keys === "send") return send || editing(key, mod);
	if (keys === "edit") return editing(key, mod);
	return false;
}

function editing(key: string, mod: boolean): boolean {
	if (mod) return key === "z" || key === "Z"; // undo, redo
	if (key.length === 1) return true; // a character
	return ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End", "Shift"].includes(key);
}

/** The tour's question and what answers it: the first prompt on the page, and
 *  the segments after it up to the next note or prompt. Found by position, so a
 *  question rewritten whole is still the question. */
export function tourExchange(md: string): { question: { from: number; to: number; text: string }; answer: string | null; replyTo: number } | null {
	const { segments } = parseDocument(md);
	const at = segments.findIndex((segment) => segment.kind === "user");
	const prompt = segments[at];
	if (!prompt) return null;
	const rest = segments.slice(at + 1);
	const end = rest.find((segment) => segment.kind === "note" || segment.kind === "user");
	const reply = rest[0]?.kind === "assistant" ? rest[0] : undefined;
	// An emptied question is the blank line under its marker.
	const found = prompt.text ? md.indexOf(prompt.text, prompt.bodyFrom) : -1;
	let from = found >= 0 ? found : Math.min(prompt.bodyFrom + 1, prompt.to);
	let to = from + (found >= 0 ? prompt.text.length : 0);
	// Spaces at either end are the question's too: the text is trimmed, and a
	// caret after a typed space is still in it.
	while (from > prompt.bodyFrom && (md[from - 1] === " " || md[from - 1] === "\t")) from--;
	while (to < prompt.to && (md[to] === " " || md[to] === "\t")) to++;
	return {
		question: { from, to, text: prompt.text },
		answer: reply ? reply.text : null,
		replyTo: end ? end.from : md.length,
	};
}

/** The document with the tour's question set to five and the recorded answer
 *  under it, whatever the reader wrote there and whatever pi said — the change
 *  that does it, or null when the page has no question to rewrite. */
export function recordedExchange(md: string): { from: number; to: number; insert: string } | null {
	const { segments } = parseDocument(md);
	const prompt = segments.find((segment) => segment.kind === "user");
	const exchange = tourExchange(md);
	if (!prompt || !exchange) return null;
	return { from: prompt.bodyFrom, to: exchange.replyTo, insert: `\n${RECORDED_QUESTION}\n\n<!-- pi -->\n\n${RECORDED_ANSWER}\n\n` };
}
