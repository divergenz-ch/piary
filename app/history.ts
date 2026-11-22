// Makes pi's history the document's before a prompt goes (ADR 0002, ADR 0021).
//
// The document is the history: an answer edited, a block deleted, a prompt run
// again — whatever the page now says above the prompt is what pi must have
// heard. So before each send the transcript is read over the wire, rendered as
// a document, and compared with the document above the prompt — by what each
// would tell pi, not by its bytes. Equal, nothing happens. Different, the transcript is rewritten from the document
// (`rebuildEntries`), written whole by Rust at the path pi names, and pi is
// started again on it — and put back on the model it ran (`keepModel`).

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";
import { piRebuild, piSend, piStart, type PiReply } from "../src/bridge.ts";
import { activeBranch, serializeBranch } from "../src/document/branch.ts";
import { documentMessages, frontmatterFor, serializeUser } from "../src/document/format.ts";
import { historyOf } from "../src/document/run.ts";
import { type RebuildOptions, rebuildEntries } from "../src/document/transcript.ts";
import { withoutAppTail } from "../src/document/turn-context.ts";
import { imagesFor, limitsFor, notesFor, withNotes } from "./attachments.ts";
import { type ModelPick, pickOf } from "./picks.ts";

/** What a sync found: the history already matched, or it was rewritten. */
export type HistorySync = "unchanged" | "rebuilt";

/**
 * What a history tells pi: its messages, and the images each user message
 * carries.
 *
 * Compared instead of the text, because the same conversation has more than
 * one spelling. The transcript renders a leading prompt bare where the page
 * writes its marker; the page may carry frontmatter the transcript has no
 * counterpart for; the gap before the next prompt is layout. None of those is
 * something said, and a text compare reads each as an edit — restarting pi on
 * every send.
 *
 * Block structure is left out for the same reason. A rebuild writes it into
 * the transcript, but a plain send after one adds a prompt that opens a block
 * with no record of it there — so a compare that counted openers would rebuild
 * on every send after the first rebuild. The model never hears block
 * structure; the document is where it lives.
 *
 * Images are compared by their bytes. The transcript holds what pi was handed,
 * and the page hands pi images it has already brought within the model's
 * limits, which pi passes through unchanged (`imageProfile`) — so the
 * document's images, normalized the same way, are the transcript's byte for
 * byte, and a swapped, added or removed image is an edit. An image the store
 * can no longer read is skipped on both sides alike. A non-image attachment is
 * its `[attached: …]` line, in the message text on both sides.
 */
export type Told = { messages: string; images: readonly (readonly ImageContent[])[] };

function sameImages(a: readonly ImageContent[], b: readonly ImageContent[]): boolean {
	return a.length === b.length && a.every((image, i) => image.mimeType === b[i]!.mimeType && image.data === b[i]!.data);
}

/** Whether two histories tell pi the same thing (see `Told`): a rebuild's
 *  trigger, so a false "different" restarts pi on every send. */
export function toldTheSame(a: Told, b: Told): boolean {
	return a.messages === b.messages && a.images.length === b.images.length && a.images.every((images, i) => sameImages(images, b.images[i]!));
}

/** A document's history as pi is told it: each user message's text carries its
 *  non-image attachments' lines, as the send wrote them (§Attachments), and
 *  `images` holds each user message's images, by message index. */
async function documentHistory(sid: string, history: string) {
	const doc = documentMessages(history);
	// The transcript side reads through `serializeUser`, which drops what a send
	// added at the end: trailing `[now: …]` lines and a face block. So does this
	// side, or a prompt whose own last lines look like either would differ on
	// every send and rebuild every time (ADR 0028, ADR 0055).
	// In place, so a rebuild writes the text the next compare reads.
	for (const message of doc.messages) {
		if (message.role !== "user") continue;
		message.content = typeof message.content === "string"
			? withoutAppTail(message.content)
			: message.content.map((part, i) => (i === 0 && part.type === "text" ? { ...part, text: withoutAppTail(part.text) } : part));
	}
	const images = new Map<number, ImageContent[]>();
	const limits = await limitsFor(sid, [...doc.attachments.values()].flat());
	for (const [index, refs] of doc.attachments) {
		const message = doc.messages[index];
		if (message?.role !== "user") continue;
		images.set(index, await imagesFor(refs, limits));
		const notes = await notesFor(refs);
		if (!notes.length) continue;
		message.content = typeof message.content === "string"
			? withNotes(message.content, notes)
			: message.content.map((part, i) => (i === 0 && part.type === "text" ? { ...part, text: withNotes(part.text, notes) } : part));
	}
	const told: Told = {
		messages: JSON.stringify(doc.messages),
		// A message the user wrote no word of holds no image and is not counted
		// on the transcript's side either (`heldImages`).
		images: doc.messages.flatMap((message, index) => (message.role === "user" && serializeUser(message.content) ? [images.get(index) ?? []] : [])),
	};
	return { doc, images, told };
}

/** The image parts each user message the transcript renders carries, in
 *  order. A user message with no text renders as nothing (`serializeUser`), so
 *  it is not counted either. */
function heldImages(branch: ReturnType<typeof activeBranch>): ImageContent[][] {
	const held: ImageContent[][] = [];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		const message = entry.message as AgentMessage;
		if (message.role !== "user" || !serializeUser(message.content)) continue;
		held.push(typeof message.content === "string" ? [] : message.content.filter((part): part is ImageContent => part.type === "image"));
	}
	return held;
}

/** Asks pi one thing and answers its data, or throws its refusal. */
async function ask(sid: string, type: string): Promise<Record<string, unknown>> {
	const reply: PiReply = await piSend(sid, { type });
	if (reply?.success !== true || !reply.data) throw new Error(reply?.error ?? `pi did not answer ${type}`);
	return reply.data;
}

/** What pi holds for `sid`: its entries, the leaf, and the branch the leaf
 *  ends — read over the wire (ADR 0021). pi is running when this is called. */
async function heldBranch(sid: string) {
	const transcript = await ask(sid, "get_entries");
	const entries = (transcript["entries"] ?? []) as Parameters<typeof activeBranch>[0];
	const leafId = (transcript["leafId"] ?? null) as string | null;
	return { entries, leafId, branch: activeBranch(entries, leafId) };
}

/** The document a session's transcript renders, for a session pi knows that
 *  has no document of its own; `null` when pi holds nothing for it. */
export async function transcriptDocument(sid: string): Promise<string | null> {
	await piStart(sid);
	const { branch } = await heldBranch(sid);
	return branch.length ? frontmatterFor(sid) + serializeBranch(branch) : null;
}

const named = (pick: ModelPick | null) => (pick ? `${pick.provider}/${pick.modelId}` : "no model");

/**
 * Puts a pi restarted on a rewritten transcript back on `ran`, the model and
 * effort it ran before.
 *
 * pi restores a session's model from the last thing on its branch that names
 * one: a `model_change`, or a reply, which names the model that answered it. A
 * rewritten transcript ends on a reply the document kept, so pi comes back on
 * that reply's model, and a model picked since would be lost with the restart.
 * Asked rather than written into the transcript, because what pi does with an
 * entry order is pi's rule to change (ADR 0002) and its answer is not.
 *
 * Throws when pi will not go back: a prompt must not go to a model the user
 * did not pick without a word.
 */
async function keepModel(sid: string, ran: ModelPick | null): Promise<void> {
	if (!ran) return;
	const now = pickOf(await ask(sid, "get_state"));
	if (now?.provider === ran.provider && now.modelId === ran.modelId) return;
	const reply = await piSend(sid, { type: "set_model", provider: ran.provider, modelId: ran.modelId });
	if (reply?.success === false) throw new Error(`pi restarted on ${named(now)} and would not go back to ${named(ran)}: ${reply.error ?? "pi refused it"}`);
	// A model change puts pi on its settings' default effort.
	if (ran.thinking) await piSend(sid, { type: "set_thinking_level", level: ran.thinking });
}

/**
 * Makes pi's transcript hold `history` — the document up to the prompt about to
 * be sent — and leaves pi running on it. `stopping` is called just before a
 * rewrite stops pi, so a caller watching for pi's exit knows that one is
 * expected.
 */
export async function syncHistory(
	sid: string,
	history: string,
	stopping: () => void = () => {},
	options: RebuildOptions = {},
): Promise<HistorySync> {
	await piStart(sid);
	const { entries, leafId, branch } = await heldBranch(sid);
	const held: Told = {
		messages: JSON.stringify(documentMessages(historyOf(serializeBranch(branch))).messages),
		images: heldImages(branch),
	};
	const { doc, images, told } = await documentHistory(sid, history);
	if (toldTheSame(told, held)) return "unchanged";

	const state = await ask(sid, "get_state");
	// A rewrite stops pi, and a pi still answering — a child's run another
	// window is writing — would lose that answer with it. Refused instead; pi
	// takes no prompt while it streams either.
	if (state["isStreaming"] === true) throw new Error("pi is still answering in this session; send again once it has finished");
	const sessionFile = state["sessionFile"];
	if (typeof sessionFile !== "string") throw new Error("pi did not say where this session's transcript is");
	// The document holds paths and the transcript bytes, so a rebuild reads each
	// user message's images back into its content — or every image vanishes the
	// first time a prompt above it is edited.
	for (const [index, found] of images) {
		const message = doc.messages[index];
		if (message?.role !== "user" || !found.length) continue;
		const existing = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
		message.content = [...existing, ...found];
	}
	const rebuilt = rebuildEntries(
		entries,
		leafId,
		doc,
		{
			now: () => new Date().toISOString(),
			// Eight hex characters: pi's own entry-id shape.
			newId: () => crypto.randomUUID().slice(0, 8),
		},
		options,
	);
	stopping();
	await piRebuild(sid, sessionFile, rebuilt);
	await piStart(sid);
	await keepModel(sid, pickOf(state));
	return "rebuilt";
}
