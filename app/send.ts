// Sending a prompt, and the session it goes to.

import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";

export interface Send {
	/** Opens the session once, however many sends race to be first. */
	start(): Promise<void>;
	/** Hands a prompt to pi, its answer opening at `at`. While a turn runs it
	 *  steers that turn instead, or queues a follow-up when `followUp` is set. */
	sendPrompt(text: string, at: number, followUp?: boolean): void;
	/** The canvas's send and stop gestures. */
	handlers(): HostFragment<"doc-send" | "doc-stop">;
}

/** `divert` is asked first about every send, and takes the ones that go
 *  somewhere other than this window's turn — a `/subagent` invocation. */
export function createSend({ turn, notify, divert }: Pick<AppContext, "turn" | "notify"> & { divert?: (text: string) => boolean }): Send {
	let opening: Promise<void> | null = null;

	const start = (): Promise<void> => {
		opening ??= turn.open().catch((error: unknown) => {
			opening = null;
			notify(String(error));
			throw error;
		});
		return opening;
	};

	const sendPrompt = (text: string, at: number, followUp = false): void => {
		if (divert?.(text)) return;
		void start().then(() => turn.send(text, at, followUp));
	};

	return {
		start,
		sendPrompt,
		handlers: () => ({
			// The caret's prompt is what a send means (ADR 0005). The canvas resolves
			// the position and reports it; this hands it to pi. ⇧⌘⏎ marks a
			// follow-up, which only a running turn reads.
			"doc-send": ({ text, at, followUp }) => sendPrompt(text, at, followUp),
			// Escape, while a turn runs. The canvas only raises this when it believes
			// one is streaming, which is why `Turn` keeps `chat.streaming` in step
			// with its own state rather than leaving the gesture unreachable.
			"doc-stop": () => void turn.stop(),
		}),
	};
}
