// What the app page hands its feature modules (ADR 0024).
//
// Built once in app/main.ts. A module takes a `Pick` of it naming only what it
// uses, so its dependencies are visible in its signature, and no module reaches
// back into the entry.

import type { DocumentChat } from "../src/components/DocumentChat.ts";
import type { Turn } from "./turn.ts";

export interface AppContext {
	chat: DocumentChat;
	/** The session this window's document belongs to. */
	sid: string;
	turn: Turn;
	/** Says something on the status line (ADR 0011). */
	notify(message: string): void;
	/** A turn is being written into the page: no surgery on it. */
	busy(): boolean;
	/** The send ⌘⏎ makes, its answer opening at `at`. A menu's "run" is the
	 *  same send. Mid-turn it steers, or queues a follow-up (`followUp`). */
	sendPrompt(text: string, at: number, followUp?: boolean): void;
}
