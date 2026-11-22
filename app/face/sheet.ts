// What reading a face sends, said before the camera is first used (ADR 0057).
//
// A dialog in the document, as sign-in is (`app/login.ts`): what is read, that
// no picture leaves the window, what is sent and to whom, and how long it is
// kept. Nothing asks for the camera until the user has agreed here, once.

import type { DocumentChat } from "../../src/components/DocumentChat.ts";
import { cancelQuestion } from "../ask.ts";

/** A block as a message may carry it (`docs/face-format.md`). */
const EXAMPLE = '[face]\ndeleted "this is the second time": brows lowered severe + lips pressed marked 8.0s\ntyping "like you said": brows lowered marked 2.6s';

/** What the sheet says, a paragraph each; the example goes after `SENT`. */
const READ = "What is read: how your brows, eyes, mouth and head move while you type. Movements, never feelings.";
const KEPT = "The camera's picture never leaves this window and is never stored. The camera is on only while you type, for 20 seconds after your last key, and for a few seconds after an answer appears in front of you; the light beside it says when.";
const SENT = "What is sent: a few plain words at the end of your message, tied to the words you were typing, or to the seconds after the last answer appeared. Most messages carry none: only a marked movement that lasted half a second or longer is passed on. For example:";
const SEEN = "What a message carried is in its block's menu, under face: what was sent. What the camera reads as you type, and what your message would carry, is in this switch's menu beside the model.";
const TO_WHOM = "They go where the message goes: to the provider of the model that answers. They are never written into the document. pi's transcript keeps them with the message until the conversation's history is rewritten.";

/** The sheet that is open, so asking again shows one. */
let open: (() => void) | null = null;

/** Shows the sheet in `chat`'s document. `agree` is called when the user
 *  turns the reading on, and `decline` when they close it any other way. */
export function openFaceSheet(chat: DocumentChat, agree: () => void, decline: () => void): void {
	open?.();
	cancelQuestion();
	const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] => {
		const node = document.createElement(tag);
		if (className) node.className = className;
		node.textContent = text;
		return node;
	};
	const panel = el("div", "doc-ui-request doc-face-sheet", "");
	const close = (): void => {
		open = null;
		chat.setAsk(null);
		// The canvas parks an ask's element rather than dropping it (app/ask.ts).
		panel.remove();
	};
	open = close;

	const yes = el("button", "doc-face-agree", "Turn on");
	yes.type = "button";
	yes.addEventListener("click", () => {
		close();
		agree();
	});
	const no = el("button", "doc-ui-request-cancel", "Not now");
	no.type = "button";
	const refuse = (): void => {
		close();
		decline();
	};
	no.addEventListener("click", refuse);
	const row = el("div", "doc-ui-request-row", "");
	row.append(yes, no);

	panel.append(el("div", "doc-ui-request-title", "Read my face while I type"), el("p", "", READ), el("p", "", KEPT), el("p", "", SENT), el("pre", "", EXAMPLE), el("p", "", TO_WHOM), el("p", "", SEEN), row);
	panel.addEventListener("keydown", (event) => {
		if (event.key === "Escape") refuse();
	});
	chat.setAsk(panel);
}
