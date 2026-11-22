// A question the page asks inside the document, under the block it is about.
//
// Mounted in the buffer through `chat.setAsk`, which also scrolls it to the
// reader. A native `prompt()` would freeze the page, and a popover would put the
// question somewhere other than the thing it asks about. Built with the canvas's
// `.doc-ui-request` classes, so the stylesheet draws it.

import type { DocumentChat } from "../src/components/DocumentChat.ts";

/** How many frames to keep trying to focus the field. The widget mounts during
 *  the editor's measure pass, a frame or two after `setAsk`, and `focus()` on a
 *  detached element does nothing. */
const FOCUS_FRAMES = 10;

/** The question that is open, so asking another cancels it. */
let pending: (() => void) | null = null;

/**
 * Asks a one-line question inside the document. Resolves to the answer, or to
 * null when it is cancelled — by Escape, the cancel button, or another question
 * replacing it.
 */
export function askInput(
	chat: DocumentChat,
	question: { title: string; placeholder?: string; prefill?: string },
): Promise<string | null> {
	pending?.();
	return new Promise((resolve) => {
		const host = document.createElement("div");
		host.className = "doc-ui-request";

		const title = document.createElement("div");
		title.className = "doc-ui-request-title";
		title.textContent = question.title;

		const field = document.createElement("input");
		field.className = "doc-ui-request-input";
		field.type = "text";
		field.placeholder = question.placeholder ?? "";
		field.value = question.prefill ?? "";

		const send = document.createElement("button");
		send.type = "button";
		send.textContent = "send";
		const cancel = document.createElement("button");
		cancel.type = "button";
		cancel.className = "doc-ui-request-cancel";
		cancel.textContent = "cancel";

		const row = document.createElement("div");
		row.className = "doc-ui-request-row";
		row.append(field, send, cancel);
		host.append(title, row);

		const finish = (answer: string | null) => {
			pending = null;
			chat.setAsk(null);
			// The canvas parks a question's element rather than dropping it, so a
			// half-typed answer survives scrolling out of view. Answered, it goes.
			host.remove();
			resolve(answer);
		};
		pending = () => finish(null);

		field.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			event.preventDefault();
			finish(field.value);
		});
		send.addEventListener("click", () => finish(field.value));
		cancel.addEventListener("click", () => finish(null));
		host.addEventListener("keydown", (event) => {
			if (event.key === "Escape") finish(null);
		});

		chat.setAsk(host);
		const focus = (frames: number) => {
			if (field.isConnected) field.focus();
			else if (frames > 0) requestAnimationFrame(() => focus(frames - 1));
		};
		requestAnimationFrame(() => focus(FOCUS_FRAMES));
	});
}

/** Cancels the open question, if there is one, for another ask that takes its
 *  slot: the canvas holds one (`chat.setAsk`), and a question replaced without
 *  this would never answer. */
export function cancelQuestion(): void {
	pending?.();
}
