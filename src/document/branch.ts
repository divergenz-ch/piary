// The transcript → document projection — pure, no UI.
// The buffer is the history and a send rewrites the session from it, so there
// is nothing to reconcile: this only reads the active branch and renders it.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { NOTE_TYPE, serializeMessages } from "./format.ts";

/** Messages that can open a block — the authored kinds, prompt and prose.
 *  `opensBlock` in format.ts is the same rule stated over doc segments. */
const authored = (msg: unknown): boolean => {
	const m = msg as { role?: string; customType?: string };
	return m.role === "user" || (m.role === "custom" && m.customType === NOTE_TYPE);
};

/** Walk `parentId` up from `leafId` and reverse — the active branch, root-first. */
export function activeBranch(entries: readonly SessionEntry[], leafId: string | null | undefined): SessionEntry[] {
	const byId = new Map(entries.map((e) => [e.id, e]));
	const branch: SessionEntry[] = [];
	for (let e = leafId ? byId.get(leafId) : undefined; e; e = e.parentId ? byId.get(e.parentId) : undefined) branch.push(e);
	return branch.reverse();
}

/**
 * Authored entries that OPEN a block on this branch (step 14). The transcript
 * records openings as `block-new` custom entries; fold is the unmarked
 * default. An authored entry opens iff a block-new sits between it and the
 * previous message entry (non-message entries in between are climbed
 * through), or the branch carries no block-new before it (legacy prefix —
 * pre-step-14 turns keep one block per send), or it is the first one.
 *
 * "Authored" is prompt *or* prose: a block can start with anything, so a note
 * entry opens one exactly as a user entry does.
 */
export function blockOpeners(branch: readonly SessionEntry[]): Set<string> {
	const openers = new Set<string>();
	let pending = false; // a block-new since the previous message entry
	let sawBlockNew = false;
	let sawAuthored = false;
	for (const e of branch) {
		if (e.type === "custom" && e.customType === "block-new") {
			pending = true;
			sawBlockNew = true;
			continue;
		}
		if (e.type !== "message") continue;
		if (authored(e.message)) {
			if (pending || !sawBlockNew || !sawAuthored) openers.add(e.id);
			sawAuthored = true;
		}
		pending = false;
	}
	return openers;
}

/** The active branch → document body: messages serialized with fold markers
 *  derived from the branch's block-new entries. Every path that re-renders a
 *  document from the session must come through here, not bare `get_messages` —
 *  fold structure lives in the transcript (step 14). */
export function serializeBranch(branch: readonly SessionEntry[]): string {
	const openers = blockOpeners(branch);
	const messages: AgentMessage[] = [];
	const folded = new Set<AgentMessage>();
	for (const e of branch) {
		if (e.type !== "message") continue;
		const msg = e.message as AgentMessage;
		messages.push(msg);
		if (authored(msg) && !openers.has(e.id)) folded.add(msg);
	}
	return serializeMessages(messages, folded);
}
