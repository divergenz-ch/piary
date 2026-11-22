// What a message carried of the user's face, read back from pi's transcript
// (ADR 0059).
//
// The block is never in the document, and the app keeps no copy of its own:
// the one place it stands is the message pi holds. So a prompt's menu asks pi
// for its entries and shows the block the message ends with. A history that
// was rewritten since holds the document's text and no block, and nothing
// tells that from a message sent with none: the two are said as one.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { activeBranch } from "../../src/document/branch.ts";
import { blocksFrom, documentMessages, parseDocument, serializeUser } from "../../src/document/format.ts";
import { faceBlockOf, withoutAppTail } from "../../src/document/turn-context.ts";
import type { MenuItem } from "../menu.ts";

/** What pi holds for a prompt: the block it was sent with, `none` when its
 *  message carries none, `unknown` when pi does not hold the prompt as the
 *  document has it, or could not be asked. */
export type Sent = { block: string } | "none" | "unknown";

type Entries = Parameters<typeof activeBranch>[0];

const textOf = (content: string | readonly { type: string; text?: string }[]): string =>
	typeof content === "string" ? content : content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");

/** What the transcript `entries` (ending at `leafId`) holds for the prompt that
 *  begins at `from` in `md`. A prompt is found by how many prompts with text
 *  stand above it, which is how a transcript is read as a document; one whose
 *  text pi does not hold, because it was edited since or never sent, is
 *  `unknown`. */
export function sentOf(md: string, from: number, entries: Entries, leafId: string | null): Sent {
	const prompts = parseDocument(md).segments.filter((segment) => segment.kind === "user" && segment.text);
	const ordinal = prompts.findIndex((segment) => segment.from === from);
	// A message the user wrote no word of (what an unasked reply answers) is no prompt on
	// either side.
	const written = documentMessages(md).messages.filter((message) => message.role === "user" && serializeUser(message.content))[ordinal];
	const held = activeBranch(entries, leafId)
		.flatMap((entry) => (entry.type === "message" ? [entry.message as AgentMessage] : []))
		.filter((message) => message.role === "user" && serializeUser(message.content))[ordinal];
	if (ordinal < 0 || written?.role !== "user" || held?.role !== "user") return "unknown";
	const text = textOf(held.content).trim();
	// The message pi holds is what the document says, and after it at most the
	// attachment lines a send adds. Anything else is a prompt edited since.
	const wrote = withoutAppTail(textOf(written.content).trim());
	const took = withoutAppTail(text);
	if (took !== wrote && !took.startsWith(`${wrote}\n[attached: `)) return "unknown";
	const block = faceBlockOf(text);
	return block ? { block } : "none";
}

/** Where the first prompt of the block that opens at `from` in `md` begins;
 *  `null` for a block that holds no prompt with text. */
export function promptIn(md: string, from: number): number | null {
	const { segments } = parseDocument(md);
	const block = blocksFrom(segments).find((b) => segments[b.opensAt]!.from === from);
	const prompt = block?.members.map((i) => segments[i]!).find((segment) => segment.kind === "user" && segment.text);
	return prompt?.from ?? null;
}

/** How the user judged the blocks they looked at, kept in this window's own storage: the
 *  count of how often what was sent was right about them, which is the measure of whether
 *  the reading earns its place. Numbers only, never a block. */
export interface Judged {
	right: number;
	wrong: number;
}

const JUDGED_KEY = "piary.face.judged";

/** The counts kept so far; zeros when none are, or the storage cannot be read. */
export function judged(): Judged {
	try {
		const kept = JSON.parse(localStorage.getItem(JUDGED_KEY) ?? "{}") as Partial<Judged>;
		return { right: Number(kept.right) || 0, wrong: Number(kept.wrong) || 0 };
	} catch {
		return { right: 0, wrong: 0 };
	}
}

/** Counts one more block as right or wrong. A storage that refuses keeps nothing. */
export function judge(verdict: keyof Judged): void {
	const next = judged();
	next[verdict]++;
	try {
		localStorage.setItem(JUDGED_KEY, JSON.stringify(next));
	} catch {
		// Nothing to tell the user: a count is not theirs to act on.
	}
}

/** What a menu says of `sent`: a sentence, and the block word for word, with a way to say
 *  whether it was right when `judge` is given. */
export function sentRows(sent: Sent, judge?: (verdict: keyof Judged) => void): MenuItem[] {
	if (sent === "unknown") return [{ note: "pi's transcript does not hold this prompt as it stands here, so what went with it is not known." }];
	if (sent === "none") return [{ note: "pi's transcript holds no face block for this message: none was sent with it, or the history was rewritten since." }];
	const rows: MenuItem[] = [{ note: "Sent to the agent at the end of this message:" }, { note: sent.block, verbatim: true }];
	if (judge) rows.push({ section: "was it right about you?" }, { label: "It was right", run: () => judge("right") }, { label: "It was not", run: () => judge("wrong") });
	return rows;
}
