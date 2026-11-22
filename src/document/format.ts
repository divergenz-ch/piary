// The pi document format (v1) — see docs/document-format.md.
// A conversation is one markdown file; machine structure lives in HTML
// comments so any markdown renderer shows a clean document.
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
	AssistantMessage,
	JsonObject,
	JsonValue,
	TextContent,
	ThinkingContent,
	ToolCall,
	ToolResultMessage,
	Usage,
} from "@earendil-works/pi-ai";
import { FACE_UNKEPT, isFaceOnly, isSilent, withoutAppTail } from "./turn-context.ts";

export type DocSegmentKind =
	| "user"
	| "assistant"
	| "thinking"
	| "toolCall"
	| "toolResult"
	| "view"
	| "artifact"
	| "cell"
	| "note"
	| "aside"
	| "file"
	| "block"
	| "opaque";

export interface DocSegment {
	kind: DocSegmentKind;
	/** Segment body with surrounding blank lines trimmed and marker escapes undone. */
	text: string;
	/** toolCall: tool name. view: template name. cell: the cell mode. file: the mime type. */
	name?: string;
	/** toolCall / toolResult: the tool-call id linking call and result. view: the view id. cell: the cell id. file: the attachment id. */
	id?: string;
	/** cell: the artifact group — members render together at the group's first cell (declared structure, derived layout). */
	group?: string;
	isError?: boolean;
	/** Offset of the marker line (== bodyFrom for the markerless leading user segment). */
	from: number;
	/** Offset where the body starts (after the marker line). */
	bodyFrom: number;
	/** Offset where the segment ends (start of next marker line, or doc end). */
	to: number;
}

export interface ParsedDocument {
	/** Frontmatter block including both `---` fences, or null. */
	frontmatter: string | null;
	/** The frontmatter's `pi` value — `v1` when there is no frontmatter or no
	 *  `pi` key, `""` when the key is there with no value (§Frontmatter). */
	version: string;
	/** Offset where the body starts (after frontmatter). */
	bodyFrom: number;
	segments: DocSegment[];
}

// Ids are opaque strings from the provider (may contain `|` etc.) — accept
// anything up to whitespace/`>`.
const MARKER =
	/^<!-- (you|pi|pi:thinking|pi:tool ([^\s#]+) #([^\s>]+)|pi:result #([^\s>]+)( error)?|pi:view ([^\s#]+) #([^\s>]+)|pi:cell ([^\s#]+) #([^\s>]+)( @([^\s>]+))?|pi:artifact @([^\s>]+)|pi:file ([^\s#]+) #([^\s>]+)|pi:note|pi:aside|pi:block|pi:\S[^>]*) -->$/;

function markerKind(m: RegExpMatchArray): Pick<DocSegment, "kind" | "name" | "id" | "isError" | "group"> {
	const head = m[1];
	if (head === "you") return { kind: "user" };
	if (head === "pi") return { kind: "assistant" };
	if (head === "pi:thinking") return { kind: "thinking" };
	if (m[2]) return { kind: "toolCall", name: m[2], id: m[3] };
	if (m[4]) return { kind: "toolResult", id: m[4], isError: m[5] !== undefined };
	if (m[6]) return { kind: "view", name: m[6], id: m[7] };
	if (m[8]) return { kind: "cell", name: m[8], id: m[9], group: m[11] };
	if (m[12]) return { kind: "artifact", name: m[12] };
	// `pi:file` is placed after `pi:artifact` in MARKER on purpose: appending its
	// groups keeps 1–12 where markerKind already reads them. Inserting earlier
	// would renumber every later group and turn artifacts into opaque segments.
	if (m[13]) return { kind: "file", name: m[13], id: m[14] };
	if (head === "pi:note") return { kind: "note" };
	if (head === "pi:aside") return { kind: "aside" };
	if (head === "pi:block") return { kind: "block" };
	return { kind: "opaque" };
}

/** A line opening with `<!--` and one or more spaces: a marker look-alike when
 *  the same line with exactly one space would match MARKER. Lines are split on
 *  `\n` alone, as the parser splits them. */
const LOOK_ALIKE = /^<!--( +)(\S.*)$/s;

/** Rewrite every look-alike line of `text`, by its run of spaces. */
function mapLookAlikes(text: string, spaces: (run: string) => string): string {
	if (!text.includes("<!--")) return text;
	return text
		.split("\n")
		.map((line) => {
			const m = LOOK_ALIKE.exec(line);
			return m && MARKER.test(`<!-- ${m[2]}`) ? `<!--${spaces(m[1])}${m[2]}` : line;
		})
		.join("\n");
}

/** Un-escape marker look-alikes: one space fewer, wherever there are two or more. */
function unescapeBody(text: string): string {
	return mapLookAlikes(text, (run) => (run.length > 1 ? run.slice(1) : run));
}

/**
 * Escape content lines that would parse as markers: one space more after `<!--`.
 *
 * A line already escaped gets another space too, so un-escaping undoes exactly
 * this and a body round-trips through `parseDocument` — trimmed at its edges,
 * exact between them (§Serialization rules). Foreign prose that becomes
 * document content goes through here so it cannot smuggle structure.
 */
export function escapeBody(text: string): string {
	return mapLookAlikes(text, (run) => ` ${run}`);
}

/** The format version this reader understands, and the one it writes. */
export const FORMAT_VERSION = "v1";

/** The `pi` value in a frontmatter block. Absent is v1 rather than unknown: a
 *  plain markdown file is a valid conversation (ADR 0001). */
function versionOf(frontmatter: string | null): string {
	const m = frontmatter === null ? null : /^pi:[ \t]*(.*?)[ \t]*$/m.exec(frontmatter);
	if (!m) return FORMAT_VERSION;
	return /^(["'])(.*)\1$/.exec(m[1])?.[2] ?? m[1];
}

/**
 * Why this document must not be written back, or null when it may be.
 *
 * A version this reader does not know may be rendered but never rewritten
 * (§Frontmatter): writing it back would drop whatever that version added, in a
 * save nobody is told about. The string is meant to be shown.
 */
export function rewriteRefusal(md: string): string | null {
	const { version } = parseDocument(md);
	if (version === FORMAT_VERSION) return null;
	return `this document is \`pi: ${version}\` and this Piary writes only ${FORMAT_VERSION}, so the file was left as it is`;
}

export function parseDocument(md: string): ParsedDocument {
	let bodyFrom = 0;
	let frontmatter: string | null = null;
	if (md.startsWith("---\n") || md === "---") {
		const close = md.indexOf("\n---", 3);
		if (close >= 0) {
			const end = md.indexOf("\n", close + 1);
			bodyFrom = end >= 0 ? end + 1 : md.length;
			frontmatter = md.slice(0, end >= 0 ? end : md.length);
		}
	}

	// Collect marker positions in one line-scan.
	const marks: { at: number; lineEnd: number; head: RegExpMatchArray }[] = [];
	for (let at = bodyFrom; at <= md.length; ) {
		const nl = md.indexOf("\n", at);
		const lineEnd = nl >= 0 ? nl : md.length;
		const m = MARKER.exec(md.slice(at, lineEnd));
		if (m) marks.push({ at, lineEnd, head: m });
		if (nl < 0) break;
		at = nl + 1;
	}

	const segments: DocSegment[] = [];
	// Un-escape before trimming: the edge a trim removes (a trailing `\r`) is part
	// of the line `escapeBody` judged when it decided whether to escape it.
	const push = (kind: Pick<DocSegment, "kind" | "name" | "id" | "isError">, from: number, bodyStart: number, to: number) => {
		segments.push({ ...kind, from, bodyFrom: bodyStart, to, text: unescapeBody(md.slice(bodyStart, to)).trim() });
	};

	const firstMark = marks.length ? marks[0].at : md.length;
	if (md.slice(bodyFrom, firstMark).trim()) push({ kind: "user" }, bodyFrom, bodyFrom, firstMark);

	for (let i = 0; i < marks.length; i++) {
		const { at, lineEnd, head } = marks[i];
		const to = i + 1 < marks.length ? marks[i + 1].at : md.length;
		push(markerKind(head), at, Math.min(lineEnd + 1, md.length), to);
	}
	return { frontmatter, version: versionOf(frontmatter), bodyFrom, segments };
}

/** Segment kinds a person authors: a prompt, prose, an attachment, or a cell.
 *  Not the same question as "opens a block" — `blocksFrom` asks that, and a cell
 *  answers it only at the head of the document (see there). This predicate is
 *  the authored/machine line: what ends an answer's span, and what counts as
 *  page content. */
export const opensBlock = (kind: DocSegmentKind): boolean =>
	kind === "user" || kind === "note" || kind === "file" || kind === "cell" || kind === "artifact";

/**
 * Attachments ride with the prompt they precede.
 *
 * A `pi:file` segment sits between the fold marker and the `<!-- you -->` it
 * belongs to, which puts it exactly where a dozen look-backs used to assume
 * nothing could be: they ask "is the segment before this one a fold marker?" by
 * reading `segments[i - 1]` directly. These three helpers are that question
 * asked past attachments, and every one of those sites now goes through them.
 *
 * A `pi:file` OPENS a block and the prompt written under it joins that block
 * (`blocksFrom`). Handing someone a picture is an intent like any other, and
 * everything else you author here — prose, an artifact — gets a block; an
 * attachment that did not was the one thing on the page you could not point at.
 * These helpers stay because the transcript still folds the other way: see the
 * opener rule in `documentMessages`, which must keep treating the prompt as the
 * opener because the attachment never becomes a message.
 */
export function leadIndex(segs: readonly DocSegment[], i: number): number {
	let j = i - 1;
	while (j >= 0 && segs[j].kind === "file") j--;
	return j;
}

/** Whether segment `i` folds into the block above it. */
export const isFolded = (segs: readonly DocSegment[], i: number): boolean => segs[leadIndex(segs, i)]?.kind === "block";

/** Where segment `i`'s region starts in the text: its own offset, moved back over
 *  the attachments that belong to it and the fold marker in front of those.
 *  Anything that CUTS a prompt out of the document starts here, or it strands the
 *  attachments — which is what a move that carried the prompt and left the image
 *  behind would do. */
export function promptFrom(segs: readonly DocSegment[], i: number): number {
	const lead = leadIndex(segs, i);
	const first = segs[lead]?.kind === "block" ? lead : lead + 1;
	return segs[first]?.from ?? segs[i].from;
}

export interface DocBlock {
	/** Segment index of the opening user segment. */
	opensAt: number;
	/** Indices of every segment in the block, opening segment included. */
	members: number[];
	/** Text of the first `#` heading line of the opening user text, else its first line. */
	name: string;
}

/**
 * Derive blocks: every authored segment opens one, unless the segment
 * immediately before it is a `block` marker — that folds it into the previous
 * block. A `block` marker with no block to fold into opens normally. Segments
 * before the first opener belong to no block.
 *
 * A page can still start with anything: a leading cell opens the first block,
 * so a document composed cells-first reads as blocks in the rail.
 *
 * But a cell *inside* a conversation never opens one. A cell is material — the
 * artifact a turn produced, or one you inserted into the block you were reading
 * — never a new intent, and the rail is a list of intents. Deriving it here
 * rather than guessing at serialization is what keeps it true: `serializeAssistant`
 * cannot tell a tool-only assistant message from a cell you typed, and a fold
 * marker written there would not survive `POST /session/rebuild` (the `folded`
 * set in `serializeMessages` is consulted for user and note messages only).
 */
export function blocksFrom(segments: readonly DocSegment[]): DocBlock[] {
	const blocks: DocBlock[] = [];
	/** Artifact names already declared. A repeat is a continuation, not a
	 *  second artifact (see `artifactsFrom`), so it opens nothing. Without this
	 *  a turn that began with a grouped cell — no prose before it, so no fold
	 *  marker in front — put a nameless block in the rail that was really more
	 *  of the artifact three turns above. The rail is a list of intents, and
	 *  "more of that" is not a new one. */
	const declared = new Set<string>();
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const again = seg.kind === "artifact" && declared.has(seg.name ?? "");
		if (seg.kind === "artifact") declared.add(seg.name ?? "");
		// A cell opens a block only at the head of the document — see above.
		// A prompt written under an attachment joins ITS block instead of opening
		// one: the picture and the question about it are a single intent, and the
		// attachment got there first. A second attachment joins for the same reason
		// — three images and a question is one thing you are asking, not four.
		const foldsIntoAttachment =
			(seg.kind === "user" || seg.kind === "file") && segments[i - 1]?.kind === "file";
		const opens =
			seg.kind === "cell" ? blocks.length === 0 : !again && !foldsIntoAttachment && opensBlock(seg.kind);
		if (opens && (blocks.length === 0 || !isFolded(segments, i))) {
			// A cell's text is its fence; naming the block "```js" helps nobody, so
			// it is named by the first line of its source, the way prose is named
			// by its first line.
			// An attachment is named by the file, not by its body: the body is a
			// markdown link, and "![shot.png](/attachments/shot-ab12.png)" in the rail
			// tells you nothing you wanted to know.
			const body = seg.kind === "cell" ? stripFence(seg.text) : seg.text;
			const heading = body.split("\n").find((l) => /^#{1,6} /.test(l));
			const name =
				seg.kind === "file"
					? (fileRefOf(seg)?.name ?? seg.name ?? "attachment")
					: (heading ? heading.replace(/^#{1,6} /, "") : body.split("\n", 1)[0]).trim();
			blocks.push({ opensAt: i, members: [], name });
		}
		blocks[blocks.length - 1]?.members.push(i);
	}
	return blocks;
}

/**
 * Move a whole block before another (`beforeKey` = a block's `user:{from}`
 * key; null = end of history). Pure text surgery — returns the new document,
 * or null when the move is impossible or a no-op. The trailing empty reply
 * slot (pending prompt) never travels with a moved block and never ends up
 * above one.
 */
/** The block key the rail and the block menu address a block by. */
export const blockKeyOf = (segs: readonly DocSegment[], block: DocBlock): string => `user:${segs[block.opensAt].from}`;

/**
 * Where a block stops, for anyone about to cut it out of the document.
 *
 * The answer is not simply its last member: the trailing reply slot — the empty
 * prompt the page always ends in — belongs to the PAGE, not to whichever block
 * happens to hold it, and a fold marker in front of that slot belongs to it in
 * turn. Both are backed over here so a move never carries the slot away with it
 * and a delete never takes it down with the block.
 *
 * Shared by `moveBlockText` and `deleteBlockText` so the two cannot disagree
 * about where a block ends — they used to be one function's worth of this, and
 * only one of them had it.
 */
export function blockEndIndex(segs: readonly DocSegment[], block: DocBlock): number {
	const lastSeg = segs[segs.length - 1];
	let at = block.members.length - 1;
	let endIdx = block.members[at];
	if (segs[endIdx] === lastSeg && lastSeg.kind === "user" && !lastSeg.text) {
		// Back over the slot and the fold marker in front of it: both belong to the
		// PAGE's trailing prompt, not to this block's tail, so a move or a delete
		// must stop above them.
		//
		// Attachments are NOT backed over. They used to be, while they were material
		// riding on the trailing slot; now one opens a block of its own, so a file
		// above the slot is this block's head or its member and the block has to
		// reach it — backing over it ended a two-image block at the first image.
		at -= 1;
		if (segs[block.members[at]]?.kind === "block") at -= 1;
		endIdx = block.members[at] ?? block.opensAt;
	}
	return endIdx;
}

/**
 * Remove a block's conversation — prompt, reply, thinking, tool traffic — and
 * leave its cells standing where they were.
 *
 * The document is the history, so this is the same kind of edit as typing over
 * a prompt: destructive by design, undoable in the buffer, and the next send
 * rewrites the transcript from what is left.
 *
 * But an artifact is not history. It is the thing the turn MADE, it outlives
 * the sentence that asked for it, and it has a delete of its own on its own
 * frame — so taking it as collateral gave the rail's delete two meanings and
 * only one warning. The cells stay, with the `pi:artifact` markers that name
 * them; whatever is left of the artifact opens a block of its own, unless its
 * name is declared in an earlier turn, in which case the frame is up there
 * already and its members simply gather to it.
 *
 * The exception is a block that IS an artifact (or a bare cell) — one moved out
 * of its turn, or written cells-first. There the rail entry names the artifact,
 * not a conversation, and deleting it means what it says.
 *
 * Returns null when there is nothing to take: an unknown key, or a block that
 * is only the page's empty trailing slot.
 */
export function deleteBlockText(md: string, key: string): string | null {
	const segs = parseDocument(md).segments;
	const block = blocksFrom(segs).find((b) => blockKeyOf(segs, b) === key);
	if (!block) return null;
	// The page's own empty trailing slot is not a block anyone can delete —
	// it is where you type next, and taking it would only make
	// `trailingPromptRepair` put it straight back. Tested on the opener rather
	// than on the span's text, because the span includes the marker line and so
	// is never blank.
	const opener = segs[block.opensAt];
	if (opener === segs[segs.length - 1] && !opener.text) return null;
	const endIdx = blockEndIndex(segs, block);
	// `members[0]` rather than the opener: attachments carried into this block by
	// `blocksFrom` sit in front of the prompt they belong to, and a delete that
	// started at the opener would leave them behind pointing at nothing.
	const from = segs[block.members[0] ?? block.opensAt].from;
	let to = segs[endIdx].to;
	// A fold marker directly after the block folded the slot below into THIS
	// block. With the block gone it would fold that slot into whichever block
	// precedes it instead — silently changing a block nobody touched — so it
	// goes too, and the slot opens a block of its own.
	if (segs[endIdx + 1]?.kind === "block") to = segs[endIdx + 1].to;
	// What the delete keeps: every cell of the block and the artifact markers
	// naming them, in document order. Their `pi:result` markers go with the rest
	// of the tool traffic — a cell's result is synthesized on rebuild anyway (see
	// `documentMessages`), so nothing is left owing an answer.
	const isArtifact = opener.kind === "artifact" || opener.kind === "cell";
	const kept = isArtifact
		? ""
		: block.members
				.filter((i) => i <= endIdx && (segs[i].kind === "artifact" || segs[i].kind === "cell"))
				.map((i) => md.slice(segs[i].from, segs[i].to).replace(/\s+$/, ""))
				.filter(Boolean)
				.join("\n\n");
	const head = md.slice(0, from).replace(/\s*$/, "");
	const tail = md.slice(to).replace(/^\s*/, "");
	const parts = [head, kept, tail].filter(Boolean);
	const next = !parts.length ? "" : tail ? parts.join("\n\n") : `${parts.join("\n\n")}\n\n`;
	// Deleting the last block empties the body, and `trailingPromptRepair`
	// declines a wholly blank document on purpose ("not this rule's business").
	// A markerless page is still a valid one — the format reads it as a single
	// pending message — but it loses the YOU label and the ghost hint that say
	// what typing will do. A page emptied of blocks is a new page, so give it
	// what a new page opens with, frontmatter included.
	const body = parseDocument(next);
	if (!next.slice(body.bodyFrom).trim())
		return `${body.frontmatter ? `${body.frontmatter}\n\n` : ""}${YOU_MARKER}\n\n`;
	return next === md ? null : next;
}

/**
 * Collapsed block heads, found again after the text was rearranged.
 *
 * A fold is a head's offset, and positional mapping cannot follow text that
 * moved: a block dragged elsewhere, or one that shifted because another did.
 * So each fold is matched by what its head says — the segment's kind and its
 * text in `before`, looked up in `next` in document order, each segment used at
 * most once so two heads that say the same thing keep their own folds. A fold
 * whose head is gone is dropped.
 */
export function rekeyFolds(before: string, folds: readonly number[], next: string): number[] {
	const old = parseDocument(before).segments;
	const fresh = parseDocument(next).segments;
	const used = new Set<number>();
	return folds.flatMap((at) => {
		const head = old.find((seg) => seg.from === at);
		if (!head) return [];
		const i = fresh.findIndex((seg, j) => !used.has(j) && seg.kind === head.kind && seg.text === head.text);
		if (i < 0) return [];
		used.add(i);
		return [fresh[i]!.from];
	});
}

export function moveBlockText(md: string, srcKey: string, beforeKey: string | null): string | null {
	const segs = parseDocument(md).segments;
	const blocks = blocksFrom(segs);
	const byKey = (key: string) => blocks.find((b) => blockKeyOf(segs, b) === key);
	const src = byKey(srcKey);
	const dest = beforeKey ? byKey(beforeKey) : null;
	if (!src || src === dest || (beforeKey && !dest)) return null;
	if (dest && blocks.indexOf(dest) === blocks.indexOf(src) + 1) return null; // already immediately before target
	// The moved range never swallows the trailing reply slot (empty tail).
	const lastSeg = segs[segs.length - 1];
	const tailPending = lastSeg?.kind === "user" && !lastSeg.text && lastSeg.bodyFrom > lastSeg.from;
	const endIdx = blockEndIndex(segs, src);
	const head = segs[src.opensAt];
	// The page's own empty trailing slot is not a block anyone can move, as it is
	// not one anyone can delete: above another block it would leave that block's
	// neighbour ending in an empty prompt.
	if (head === lastSeg && !head.text) return null;
	const srcFrom = segs[src.members[0] ?? src.opensAt].from; // attachments travel with their prompt
	const srcTo = segs[endIdx].to;
	let chunk = md.slice(srcFrom, srcTo).replace(/\s+$/, "");
	if (!chunk) return null;
	// A markerless leading block needs its marker to survive the move…
	if (head.bodyFrom === head.from) chunk = `${YOU_MARKER}\n\n${chunk}`;
	chunk += "\n\n";
	let insertAt: number;
	if (dest) {
		const dh = segs[dest.opensAt];
		insertAt = dh.from;
		// …and a markerless destination head needs one, or its text would merge
		// into the moved block's last segment.
		if (dh.bodyFrom === dh.from) chunk += `${YOU_MARKER}\n\n`;
	} else if (tailPending) {
		// End of history, but before the trailing reply slot — fold marker and any
		// attachments staged on it included, since all of that belongs to the slot.
		insertAt = promptFrom(segs, segs.length - 1);
	} else {
		insertAt = md.length;
	}
	if (insertAt >= srcTo) insertAt -= srcTo - srcFrom;
	const removed = md.slice(0, srcFrom) + md.slice(srcTo);
	let before = removed.slice(0, insertAt);
	if (before.trim() && !/\n\n$/.test(before)) before = `${before.replace(/\s*$/, "")}\n\n`;
	const next = before + chunk + removed.slice(insertAt);
	return next === md ? null : next;
}

/** A snippet's opening line: a quoted selection the user took for follow-up.
 *  GitHub-alert syntax — an ordinary blockquote in every other renderer. */
export const SNIPPET_MARK = "> [!snippet]";

/**
 * The artifact scope line: which artifact a prompt is about. Written by the
 * host when you send from a block that owns one, so the agent edits the
 * artifact you are looking at instead of building a second one beside it.
 *
 * Content, not grammar — the agent reads it as part of the prompt, the parser
 * sees ordinary user text, and every other renderer shows a bracketed line.
 *
 * **One line, unquoted, deliberately.** It shares its shape with the
 * `[cell values]` prefix for a reason found the hard way: a `> `-quoted
 * multi-line prefix comes back from the transcript split at 40 characters (the
 * message arrives as several content parts, and `textOf` rejoins them with a
 * blank line), which turned the chip into prose and lost the ids. A single
 * unquoted line survives that round trip, as `[cell values]` has all along.
 */
export const ARTIFACT_MARK = "[artifact]";

/** The prompt-time snapshot of every cell's named exports, so the agent can see
 *  what the user set (sliders, checkboxes) without asking. One unquoted line, for
 *  the same round-trip reason as `ARTIFACT_MARK`. */
export const VALUES_MARK = "[cell values]";

/** Mark line → its kind, its label, and where in the line that label starts, or
 *  null for a line that is not a mark. A snippet is a quoted selection; an
 *  artifact scope and a cell-values snapshot are each one unquoted line the host
 *  wrote into the prompt. `labelAt` is what lets an expanded run replace the
 *  bracket alone and leave the payload readable — see `SnippetRun.labelFrom`. */
function markOf(line: string): { kind: SnippetKind; label: string; labelAt: number } | null {
	const trimmed = line.trimEnd();
	// The whole line IS the mark: a snippet carries its text in the lines below.
	if (trimmed === SNIPPET_MARK) return { kind: "snippet", label: "", labelAt: trimmed.length };
	const a = /^\[artifact\] (.+)$/.exec(trimmed);
	if (a) return { kind: "artifact", label: a[1].trim(), labelAt: ARTIFACT_MARK.length + 1 };
	const v = /^\[cell values\] (.+)$/.exec(trimmed);
	return v ? { kind: "values", label: v[1].trim(), labelAt: VALUES_MARK.length + 1 } : null;
}

/** Is this line one of the two machine-written prompt prefixes? The blank line
 *  the format writes after one is serialization, not the writer's paragraph, so
 *  a renderer may spend it — which is what lets two prefixes sit together and
 *  read as one strip instead of two events a body-height apart. */
export function isPromptPrefix(line: string): boolean {
	const mark = markOf(line);
	return mark !== null && mark.kind !== "snippet";
}

/** `snippet` is quoted and multi-line; the other two are one machine-written
 *  line inside the prompt, collapsed to a chip so a kilobyte of JSON does not
 *  read as something the user typed. */
export type SnippetKind = "snippet" | "artifact" | "values";

/** Selection → snippet block. Quoting is also the escape: a `> `-prefixed
 *  line can no longer match the line-anchored marker or fence scanners, so a
 *  quoted transcript never smuggles structure back into the document. */
export function snippetQuote(text: string): string {
	const body = text.trim().split("\n");
	return [SNIPPET_MARK, ...body.map((l) => (l.trim() ? `> ${l}` : ">"))].join("\n");
}

/** A snippet run inside a user segment — the chip renders over [from, to). */
export interface SnippetRun {
	/** Offset of the `> [!snippet]` line. */
	from: number;
	/** End of the run's last quoted line. */
	to: number;
	/** End of the mark line. */
	markTo: number;
	/** Where the payload after the bracket starts — `[cell values] ` and
	 *  `[artifact] ` are furniture, the rest is the line's content. An expanded
	 *  run replaces up to here and no further, so expanding a one-line mark
	 *  reveals what it holds instead of swallowing it whole. Equals `markTo` for
	 *  a snippet, whose whole line is the mark. */
	labelFrom: number;
	/** First non-empty quoted line, un-prefixed, truncated for the chip. */
	preview: string;
	/** Quoted lines, mark line excluded. */
	lines: number;
	/** What the mark declared. `artifact` runs are scope, not quotation. */
	kind: SnippetKind;
	/** Text after the bracket on the mark line — an artifact's name. */
	label: string;
}

const PREVIEW_MAX = 60;

/** Snippet runs in the document's user segments (prompts only — a quoted
 *  mark inside a reply is the agent's prose, not the user's snippet). */
export function snippetRuns(md: string, segments: readonly DocSegment[]): SnippetRun[] {
	const runs: SnippetRun[] = [];
	for (const seg of segments) {
		if (seg.kind !== "user") continue;
		for (let at = seg.bodyFrom; at < seg.to; ) {
			const nl = md.indexOf("\n", at);
			const lineEnd = nl >= 0 && nl < seg.to ? nl : Math.min(seg.to, md.length);
			const mark = markOf(md.slice(at, lineEnd));
			if (!mark) {
				if (lineEnd >= seg.to || nl < 0) break;
				at = lineEnd + 1;
				continue;
			}
			const from = at;
			const markTo = lineEnd;
			let to = lineEnd;
			let lines = 0;
			let preview = "";
			// A machine-written prefix is the whole run: one line, nothing under it.
			if (mark.kind !== "snippet") {
				runs.push({ from, to, markTo, labelFrom: from + mark.labelAt, preview, lines, kind: mark.kind, label: mark.label });
				if (to >= seg.to || to >= md.length) break;
				at = to + 1;
				continue;
			}
			for (let pos = lineEnd + 1; pos < seg.to; ) {
				const end = md.indexOf("\n", pos);
				const stop = end >= 0 && end < seg.to ? end : Math.min(seg.to, md.length);
				const line = md.slice(pos, stop);
				if (!line.startsWith(">")) break;
				to = stop;
				lines++;
				const text = line.replace(/^>\s?/, "").trim();
				if (!preview && text) preview = text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX)}…` : text;
				if (end < 0 || stop >= seg.to) break;
				pos = stop + 1;
			}
			runs.push({ from, to, markTo, labelFrom: markTo, preview, lines, kind: mark.kind, label: mark.label });
			if (to >= seg.to || to >= md.length) break;
			at = to + 1;
		}
	}
	return runs;
}

/** Trailing user segment = the pending (unsent) message. Null if absent or empty. */
export function pendingUserText(md: string): string | null {
	const { segments } = parseDocument(md);
	const last = segments[segments.length - 1];
	return last?.kind === "user" && last.text ? last.text : null;
}

/** Mirror a prompt-time machine prefix (e.g. `[cell values] {…}`) into the
 *  trailing user segment, in front of its text — the transcript stores the
 *  prefixed prompt, so the document must carry the same text or the next
 *  alignment reads the pair as divergence. Unchanged when there is no
 *  non-empty trailing user segment. */
export function prefixPendingUser(md: string, line: string): string {
	const tail = parseDocument(md).segments.at(-1);
	if (tail?.kind !== "user" || !tail.text) return md;
	const at = tail.bodyFrom + md.slice(tail.bodyFrom).search(/\S/);
	return `${md.slice(0, at)}${line}\n\n${md.slice(at)}`;
}

/** `text` with `lines`, each a prompt prefix, in front of it. A prefix of the
 *  same kind already at its head is replaced rather than repeated, so a prompt
 *  run twice carries one snapshot of the cell values, the newer. Prefixes of
 *  other kinds stay, after the new ones. */
export function withPromptPrefixes(text: string, lines: readonly string[]): string {
	if (!lines.length) return text;
	const kinds = new Set(lines.map((line) => markOf(line)?.kind));
	const body = text.split("\n");
	const kept: string[] = [];
	let i = 0;
	for (; i < body.length; i++) {
		if (!body[i].trim()) continue;
		if (!isPromptPrefix(body[i])) break;
		if (!kinds.has(markOf(body[i])?.kind)) kept.push(body[i]);
	}
	return [...lines, ...kept, body.slice(i).join("\n")].join("\n\n");
}

/** Write `lines` into the prompt `seg` as its prefixes (`withPromptPrefixes`),
 *  in front of its text. The transcript stores the prefixed prompt, so the
 *  document must carry the same text or the next history compare reads an
 *  edit. Unchanged for an empty prompt. */
export function prefixPrompt(md: string, seg: DocSegment, lines: readonly string[]): string {
	const raw = md.slice(seg.bodyFrom, seg.to);
	const start = raw.search(/\S/);
	if (!lines.length || start < 0) return md;
	const from = seg.bodyFrom + start;
	const to = seg.bodyFrom + raw.trimEnd().length;
	return md.slice(0, from) + withPromptPrefixes(md.slice(from, to), lines) + md.slice(to);
}

/** How many backticks a fence around `content` needs: three, unless the content
 *  holds a longer run of its own. Exported because anything that REWRITES a
 *  fence in place has to ask the same question — splicing source containing a
 *  ``` line into a three-tick fence closes it early, and the cell that used to
 *  be there stops parsing. */
export function fenceTicks(content: string): number {
	const runs = content.match(/`+/g);
	return Math.max(3, ...(runs?.map((r) => r.length + 1) ?? [0]));
}

export function fence(content: string, lang = ""): string {
	const ticks = "`".repeat(fenceTicks(content));
	return `${ticks}${lang}\n${content}\n${ticks}`;
}

const textOf = (content: string | readonly { type: string; text?: string }[]): string =>
	typeof content === "string"
		? content
		: content
				.filter((c) => c.type === "text")
				.map((c) => c.text ?? "")
				.join("\n\n");

export const YOU_MARKER = "<!-- you -->";

/** Seeded into the machine's region at send time — both the editor and the
 *  host's run-state mirror do anchor arithmetic over this exact string. */
export const PI_PLACEHOLDER = "<!-- pi -->\n\n";

/** Placed immediately before a `<!-- you -->` to fold it into the previous block. */
export const BLOCK_MARKER = "<!-- pi:block -->";

/** The tool whose call IS its artifact: a `cell` call serializes as a `pi:cell`
 *  block and its result is not written at all (see `serializeToolResult`). */
export const CELL_TOOL = "cell";

/** Segments that can sit between an artifact's cells without ending the block —
 *  the traffic a streaming turn interleaves. Mirrored in `cells.ts` as
 *  `IN_ARTIFACT`; kept here so the format layer imports nothing from above it. */
const ARTIFACT_TRANSPARENT = new Set<DocSegmentKind>(["block", "toolResult", "opaque"]);
/** What a cell's synthesized result says. The real tool returns this, or this
 *  plus a note about a declaration-only cell — advice for the turn that wrote
 *  it, which has long since acted on it by the time anything reads a document
 *  back. The transcript needs the block to exist; it does not need the note. */
const CELL_OK = "ok";
/** What a call the document does not answer is told. Mirrors the repair
 *  `healDanglingToolCalls` makes server-side: the call is worth keeping — it
 *  says what the agent did — but it cannot be replayed unanswered. */
const UNANSWERED = "Tool call interrupted — no result was recorded. Ask again if you still need it.";

/** A markdown cell: page material, not a turn. It is stored in the session as
 *  a `custom` message, so it rides the branch in document order and reaches
 *  the model through pi-agent-core's `convertToLlm` — written once, never
 *  re-attached per turn. */
export const NOTE_MARKER = "<!-- pi:note -->";
export const NOTE_TYPE = "note";
const NOTE_OPEN = "<page-note>";
const NOTE_CLOSE = "</page-note>";
const NOTE_WRAP = new RegExp(`^${NOTE_OPEN}\\n([\\s\\S]*)\\n${NOTE_CLOSE}$`);

/** Label the prose as page material, so the model reads it as something that
 *  is on the page rather than an instruction addressed to it. */
export function wrapNote(text: string): string {
	return `${NOTE_OPEN}\n${text}\n${NOTE_CLOSE}`;
}

/** Inverse of `wrapNote`. A hand-written transcript may carry no wrapper — the
 *  content is then the prose verbatim, which is the honest reading. */
export function unwrapNote(content: string | readonly { type: string; text?: string }[]): string {
	const raw = textOf(content);
	return NOTE_WRAP.exec(raw)?.[1] ?? raw;
}

/** What the agent said without being asked, after a message that was only a face block
 *  (`document-format.md` §An unasked reply). */
export const ASIDE_MARKER = "<!-- pi:aside -->";

/** An unasked reply → `<!-- pi:aside -->` segment; "" when the agent chose silence, or said
 *  nothing: a silent reply is never on the page. */
export function serializeAside(content: string | readonly { type: string; text?: string }[]): string {
	const text = textOf(content).trim();
	return isSilent(text) ? "" : `${ASIDE_MARKER}\n\n${escapeBody(text)}`;
}

/** One note's content → `<!-- pi:note -->` segment ("" when empty). */
export function serializeNote(content: string | readonly { type: string; text?: string }[]): string {
	const text = unwrapNote(content).trim();
	return text ? `${NOTE_MARKER}\n\n${escapeBody(text)}` : "";
}

/**
 * An attachment: a file the user handed to the agent.
 *
 * The body is plain markdown on purpose — an image link for something the model
 * can see, an ordinary link for everything else. It renders as a thumbnail in
 * the document (`markdown-live`'s image widget, no new code), as a picture in iA
 * Writer or GitHub, and as a path the agent can `read` when the model cannot see
 * it. A JSON payload fence would have satisfied the parser and nothing else.
 *
 * The bytes live beside the document, in `attachments/`. The document holds the
 * reference; the server resolves it at send and at rebuild.
 */
export interface FileRef {
	id: string;
	/** Mime type as sniffed from the bytes, not as the browser claimed. */
	mime: string;
	/** Site-relative URL under `/attachments/`. */
	url: string;
	/** Original filename, for the link text. */
	name: string;
}

/** Whether a mime/id pair can be written into a marker without breaking the
 *  grammar. `serializeCell` asks the same question of its mode and id. */
export const fileMarkerSafe = (mime: string, id: string): boolean => !/[\s#>]/.test(mime) && !/[\s>]/.test(id);

/** One attachment → a `<!-- pi:file -->` segment ("" when it cannot be written). */
export function serializeFile(ref: FileRef): string {
	if (!fileMarkerSafe(ref.mime, ref.id)) return "";
	const label = escapeBody(ref.name).replace(/[\[\]]/g, "");
	const bang = ref.mime.startsWith("image/") ? "!" : "";
	return `<!-- pi:file ${ref.mime} #${ref.id} -->\n\n${bang}[${label}](${ref.url})`;
}

/** Read an attachment segment back into a `FileRef`. Null when the body is not
 *  the link `serializeFile` writes — a hand-edited segment is not wreckage, it
 *  just carries no resolvable file. */
export function fileRefOf(seg: DocSegment): FileRef | null {
	if (seg.kind !== "file" || !seg.id || !seg.name) return null;
	const m = /^!?\[([^\]]*)\]\(([^)\s]+)\)/.exec(seg.text.trim());
	return m ? { id: seg.id, mime: seg.name, url: m[2], name: m[1] || seg.id } : null;
}

/** The line that names a non-image attachment to the agent, appended to its
 *  prompt's message (§Attachments, §Message reconstruction): the agent opens
 *  the file itself, so it is told what and where. `path` is the host's. */
export function attachmentNote(name: string, mime: string, path: string): string {
	return `[attached: ${name} (${mime}) at ${path}]`;
}

/** A view: marker + pretty-printed JSON payload fence. */
export function serializeView(name: string, id: string, data: unknown): string {
	return `<!-- pi:view ${name} #${id} -->\n\n${fence(JSON.stringify(data, null, 2), "json")}`;
}

/**
 * A fresh cell's document id, from the tool-call id that produced it.
 *
 * The call id is 40-odd characters, and redefining a cell means reproducing it
 * exactly — the agent's most common way to fail at editing its own artifact.
 * The tail is deterministic (a streaming partial re-serializes to the same
 * marker) and short enough to retype. A collision inside one document would
 * read as a redefinition, which is why this takes 6 characters and not 2.
 */
export function shortCellId(toolCallId: string): string {
	const safe = toolCallId.replace(/[^\w-]/g, "");
	return safe.length > 6 ? safe.slice(-6) : safe || toolCallId;
}

/** A cell (integration plan, phase 3): marker + source fence. The fence lang
 *  is the mode, so plain markdown renderers still highlight the source. An
 *  optional artifact group (`@name`) gathers member outputs at the group's
 *  first cell — see docs/document-format.md. */
export function serializeCell(mode: string, id: string, source: string, group?: string): string {
	return `<!-- pi:cell ${mode} #${id}${group ? ` @${group}` : ""} -->\n\n${fence(source, mode)}`;
}

/**
 * An artifact: a block whose members are the cells written under it.
 *
 * It used to be derived — cells grouped by a `@group` token or by sitting next
 * to each other, rendered at an anchor computed from whichever turn last touched
 * one of them. That made "move it" mean "gather eleven scattered fences and lay
 * them somewhere", and where it landed was still a derivation's opinion rather
 * than where you dropped it. A marker gives it a position of its own, so moving
 * it is moving a block and nothing computes anything.
 */
export function serializeArtifact(name: string): string {
	return `<!-- pi:artifact @${name} -->`;
}

/**
 * One assistant message → markers + content, in content order. Also used for
 * streaming partials: serialize the partial, splice over the previous render.
 *
 * `modeOf` answers the mode a cell written before this message has. A `cell`
 * call that redefines one without naming a mode keeps it; one message cannot
 * know what came before it, so whoever holds the document says.
 */
export function serializeAssistant(msg: AssistantMessage, modeOf?: (id: string) => string | undefined): string {
	const parts: string[] = [];
	/** The mode of each cell this message has written so far. */
	const modes = new Map<string, string>();
	/** Groups this message has already opened a block for. The marker is written
	 *  once, by the first cell that names the group; the rest fall inside it. */
	const opened = new Set<string>();
	for (const c of msg.content) {
		if (c.type === "thinking" && c.thinking.trim()) parts.push(`<!-- pi:thinking -->\n\n${escapeBody(c.thinking.trim())}`);
		else if (c.type === "text" && c.text.trim()) parts.push(`<!-- pi -->\n\n${escapeBody(c.text.trim())}`);
		else if (c.type === "toolCall") {
			// The `view` tool's call IS a view: serialize it as its pi:view block
			// (template arg = view name, call id = view id) instead of pi:tool.
			// Until the streaming arguments carry both fields, the generic marker
			// keeps the partial honest.
			const v = c.name === "view" ? (c.arguments as { template?: unknown; data?: unknown } | undefined) : undefined;
			// Likewise the `cell` tool's call IS a cell (integration plan, phase 4):
			// its pi:cell block, addressed by the explicit id argument (redefinition)
			// or the call id (a fresh cell). Mode and id must stay marker-safe
			// tokens — anything else falls back to the honest pi:tool fence.
			const token = /^[^\s#>]+$/;
			const cc =
				c.name === "cell"
					? (c.arguments as { source?: unknown; mode?: unknown; id?: unknown; group?: unknown } | undefined)
					: undefined;
			const cellOk =
				cc &&
				typeof cc.source === "string" &&
				(cc.mode === undefined || (typeof cc.mode === "string" && token.test(cc.mode))) &&
				(cc.id === undefined || (typeof cc.id === "string" && token.test(cc.id))) &&
				(cc.group === undefined || (typeof cc.group === "string" && token.test(cc.group)));
			// A cell that is not this message's first part is one the agent wrote
			// after saying something: it belongs to the answer, so it is folded in.
			// A cell that IS the only part stands alone — that is what a cell you
			// inserted round-trips as — and opens its own block.
			const group = cellOk ? (cc.group as string | undefined) : undefined;
			// The artifact's marker opens the block, so the fold marker belongs in
			// front of IT — and a cell already inside one needs neither. A cell that
			// is not this message's first part is one the agent wrote after saying
			// something: it belongs to the answer, so it is folded in.
			const inside = group !== undefined && opened.has(group);
			const fold = cellOk && parts.length && !inside ? `${BLOCK_MARKER}\n\n` : "";
			let head = "";
			if (group !== undefined && !inside) {
				opened.add(group);
				head = `${serializeArtifact(group)}\n\n`;
			}
			// Only a cell asks for its mode: `modeOf` may cost a parse of the
			// document, and a partial is serialized on every chunk.
			let cell = "";
			if (cellOk) {
				const id = (cc.id as string | undefined) ?? shortCellId(c.id);
				const mode = (cc.mode as string | undefined) ?? modes.get(id) ?? modeOf?.(id) ?? "js";
				modes.set(id, mode);
				// No `@group` on the fence: the block it sits in says which
				// artifact it belongs to, and two places saying the same thing
				// is two places that can disagree.
				cell = serializeCell(mode, id, cc.source as string);
			}
			parts.push(
				v && typeof v.template === "string" && v.data !== undefined
					? serializeView(v.template, c.id, v.data)
					: cellOk
						? fold + head + cell
						: `<!-- pi:tool ${c.name} #${c.id} -->\n\n${fence(JSON.stringify(c.arguments, null, 2), "json")}`,
			);
		}
	}
	return parts.join("\n\n");
}

/**
 * One tool result → its `pi:result` segment. A `cell` result writes nothing.
 *
 * The call IS the cell: its result is always `ok` (plus, sometimes, a note the
 * source already implies), and it has never been visible — `isAck` hides every
 * `pi:result` whose id is not a `pi:tool` id, which is exactly these. Writing it
 * cost more than it paid, because the two markers disagreed about the id: a cell
 * is addressed by `shortCellId(call.id)` (or the agent's own `id` when it
 * redefines), while the result carried the raw `toolu_…`. `documentMessages`
 * then read a `tool_use` and a `tool_result` that no longer paired, and the next
 * turn after any rebuild died on
 * `unexpected tool_use_id found in tool_result blocks`.
 *
 * Making the two agree needs a map, and the streaming path serializes the
 * assistant message and the result in separate events with neither in hand.
 * Not writing the second marker needs nothing: `documentMessages` synthesizes
 * the result from the id it just emitted, so the pair is correct by
 * construction rather than by agreement. `toolName` is on every cell result,
 * so this function decides alone and all three call sites keep working.
 */
export function serializeToolResult(msg: ToolResultMessage): string {
	if (msg.toolName === CELL_TOOL) return "";
	const out = textOf(msg.content).trim() || "(no output)";
	return `<!-- pi:result #${msg.toolCallId}${msg.isError ? " error" : ""} -->\n\n${fence(escapeBody(out))}`;
}

/** One user message's content → `<!-- you -->` segment ("" when empty). */
export function serializeUser(content: string | readonly { type: string; text?: string }[]): string {
	// A message the user wrote no word of is no prompt, whatever stands in it.
	if (isFaceOnly(textOf(content))) return "";
	const text = withoutAppTail(textOf(content).trim());
	return text ? `${YOU_MARKER}\n\n${escapeBody(text)}` : "";
}

/** The mode each cell in `md` is written in, by id; a cell written more than
 *  once has its last. */
export function cellModes(md: string): Map<string, string> {
	const modes = new Map<string, string>();
	if (!md.includes("<!-- pi:cell ")) return modes;
	for (const seg of parseDocument(md).segments) if (seg.kind === "cell" && seg.id && seg.name) modes.set(seg.id, seg.name);
	return modes;
}

/** Whether an assistant message is words and nothing else: no call, which an unasked reply
 *  is not meant to make and an aside has no place for. */
const plainText = (msg: AssistantMessage): boolean => msg.content.every((part) => part.type === "text" || part.type === "thinking");

/** A transcript → document body (no frontmatter). Trailing `<!-- you -->` invites
 *  the next message. A user message in `folded` (by identity) is preceded by the
 *  fold marker — it continues the previous block instead of opening one (step 14).
 *  A note message is the same story in the other authored kind. */
export function serializeMessages(messages: readonly AgentMessage[], folded?: ReadonlySet<AgentMessage>): string {
	const parts: string[] = [];
	/** The mode of each cell written so far, for a later redefinition that names none. */
	const modes = new Map<string, string>();
	/** The message before this one was only a face block: what answers it was not asked for. */
	let unasked = false;
	for (const msg of messages as readonly (AgentMessage & { role: string })[]) {
		const answersFace = unasked;
		unasked = false;
		if (msg.role === "user") {
			const content = (msg as { content: string | { type: string; text?: string }[] }).content;
			unasked = isFaceOnly(textOf(content));
			const s = serializeUser(content);
			if (s) parts.push(folded?.has(msg) ? `${BLOCK_MARKER}\n\n${s}` : s);
		} else if (msg.role === "assistant" && answersFace && plainText(msg as unknown as AssistantMessage)) {
			const s = serializeAside((msg as unknown as AssistantMessage).content as { type: string; text?: string }[]);
			if (s) parts.push(s);
		} else if (msg.role === "assistant") {
			const s = serializeAssistant(msg as unknown as AssistantMessage, (id) => modes.get(id));
			if (s) parts.push(s);
			for (const [id, mode] of cellModes(s)) modes.set(id, mode);
		} else if (msg.role === "toolResult") {
			// `if (s)` like its three siblings: a cell's result serializes to "".
			const s = serializeToolResult(msg as unknown as ToolResultMessage);
			if (s) parts.push(s);
		} else if (msg.role === "custom" && (msg as { customType?: string }).customType === NOTE_TYPE) {
			const s = serializeNote((msg as { content: string | { type: string; text?: string }[] }).content);
			if (s) parts.push(folded?.has(msg) ? `${BLOCK_MARKER}\n\n${s}` : s);
		}
	}
	// The leading user turn needs no marker — bare text before the first marker is user text.
	let body = parts.join("\n\n");
	if (body.startsWith(`${YOU_MARKER}\n\n`)) body = body.slice(YOU_MARKER.length + 2);
	return body ? `${body}\n\n${YOU_MARKER}\n\n` : "";
}

/**
 * A document with nothing in it yet: frontmatter and an open prompt slot.
 *
 * The slot is not decoration. Without it a fresh page is a bare region that
 * says nothing about what typing into it will do, the first keystroke opens a
 * block and drops the caret a block-gap, and `repairTrailingPrompt` later
 * appends the slot at the worst possible moment — when a deletion empties the
 * page again. Starting with the slot makes all three go away.
 */
export function emptyDocument(sid: string): string {
	return `${frontmatterFor(sid)}${YOU_MARKER}\n\n`;
}

/** A conversation's name in the conversation list: the document's first line
 *  of its own — past the frontmatter, blank lines and markers — without heading
 *  marks, cut to 80. A rename writes that line (a heading), so the list reads
 *  the name from the text any editor shows. "" for a document with none yet. */
export function documentLabel(md: string): string {
	for (const line of md.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed === "---" || /^(pi|session|sid|created):/.test(trimmed) || trimmed.startsWith("<!--")) continue;
		return trimmed.replace(/^#{1,6}\s+/, "").slice(0, 80);
	}
	return "";
}

/** The edit that renames a conversation to `name` (one line, trimmed): its
 *  first line of its own (`documentLabel`'s) becomes `name`, keeping a
 *  heading's level, or a `# name` heading goes over it; an empty conversation
 *  gets the heading in its open prompt. `null` when there is nothing to do. */
export function renameDocument(md: string, name: string): { from: number; to: number; insert: string } | null {
	const title = name.replace(/\s+/g, " ").trim();
	if (!title || title === documentLabel(md)) return null;
	let at = 0;
	for (const line of md.split("\n")) {
		const trimmed = line.trim();
		const skip = !trimmed || trimmed === "---" || /^(pi|session|sid|created):/.test(trimmed) || trimmed.startsWith("<!--");
		if (!skip) {
			const heading = /^(\s*#{1,6}\s+)/.exec(line);
			return heading
				? { from: at + heading[1]!.length, to: at + line.length, insert: title }
				: { from: at, to: at, insert: `# ${title}\n\n` };
		}
		at += line.length + 1;
	}
	return { from: md.length, to: md.length, insert: `# ${title}\n\n` };
}

export function frontmatterFor(sid: string): string {
	return `---\npi: ${FORMAT_VERSION}\nsession: ${sid}\n---\n\n`;
}

/**
 * The same document, bound to a different session.
 *
 * Only the frontmatter's `session` key moves; the body is returned byte for
 * byte, which is what makes a copy a copy — every offset in it (a fold, a cell
 * id, an attachment path) still means what it meant. `parseDocument` reports the
 * frontmatter without its trailing newline, so slicing the source at its length
 * resumes exactly where the block ended.
 *
 * A hand-written file with no frontmatter gets one, the shape `emptyDocument`
 * writes — the same repair `syncDocument` already makes when it derives a
 * document from a session that has no `.md` yet.
 */
export function rebindDocument(md: string, sid: string): string {
	const { frontmatter } = parseDocument(md);
	if (frontmatter === null) return frontmatterFor(sid) + md;
	const rebound = /^session:/m.test(frontmatter)
		? frontmatter.replace(/^session:.*$/m, `session: ${sid}`)
		: frontmatter.replace(/\n---$/, `\nsession: ${sid}\n---`);
	return rebound + md.slice(frontmatter.length);
}

/** Content of a fenced block, fence lines removed. Payload segments (tool
 *  arguments, tool output, cell source) are always exactly one fence. */
export function stripFence(text: string): string {
	const m = /^(`{3,})[^\n]*\n([\s\S]*?)\n\1$/.exec(text);
	return m ? m[2] : text;
}

const zeroUsage = (): Usage => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/** Provider metadata the document does not carry. The caller restores real
 *  values by zipping against the session's existing entries (rebuild path);
 *  a message with no counterpart there keeps these. */
const assistantMeta = () => ({ api: "", provider: "", model: "", usage: zeroUsage(), stopReason: "stop" as const, timestamp: 0 });

/**
 * Document body → transcript messages: the inverse of `serializeMessages`.
 * The buffer is the history, so this is what a rebuild writes to the session.
 *
 * - Decoration (`block`, `opaque`) carries no message and is skipped.
 * - A `note` segment is a `custom` message: page material that lives in the
 *   session but was never a turn.
 * - A run of assistant-side segments (`pi`, `pi:thinking`, `pi:tool`,
 *   `pi:view`, `pi:cell`) is ONE assistant message, as the serializer emits
 *   them; a user or tool-result segment closes the run.
 * - `pi:result` restores its `toolName` from the `pi:tool` sharing its id —
 *   the marker itself only carries the id.
 * - The trailing empty `<!-- you -->` (the pending prompt slot) is not a
 *   message and is dropped.
 *
 * Never throws: this parses text a human can edit. Unparseable tool
 * arguments degrade to `{}` so the call still pairs with its result.
 */
export function messagesFrom(md: string): AgentMessage[] {
	return documentMessages(md).messages;
}

/**
 * `messagesFrom` plus block structure: the indices of messages that OPEN a
 * block. This is the `pi:block` marker's inverse — the marker folds a prompt
 * into the block above, so a user message opens one unless a block segment
 * sits immediately before it (`blocksFrom`'s rule, expressed against
 * messages). A rebuild writes these back as `block-new` entries, which is how
 * structure survives a document rebuilt from the transcript alone.
 */
export function documentMessages(md: string): { messages: AgentMessage[]; openers: Set<number>; attachments: Map<number, FileRef[]> } {
	const { segments } = parseDocument(md);
	const openers = new Set<number>();
	/** Attachments by the index of the message they belong to. Bytes are NOT read
	 *  here: this module runs in the browser. It reports the references and the
	 *  server — which can reach the disk — turns them into image content, at send
	 *  and at rebuild alike, so the two cannot disagree about what was attached. */
	const attachments = new Map<number, FileRef[]>();
	/** Refs walked since the last message, owed to the next user message. */
	let pendingRefs: FileRef[] = [];
	const toolNames = new Map<string, string>();
	/** Which ids the document actually answers. A call with no answer cannot be
	 *  replayed: `tool_use` without `tool_result` is what the provider rejects. */
	const answered = new Set<string>();
	/** Ids a `pi:tool` call holds. A view sharing one is that call's live panel
	 *  (a running command's output), page material rather than a call of its own. */
	const callIds = new Set<string>();
	for (const s of segments) if (s.id && s.kind === "toolCall") callIds.add(s.id);
	for (const s of segments) {
		if (!s.id) continue;
		if (s.kind === "toolResult") answered.add(s.id);
		else if (s.kind === "toolCall") toolNames.set(s.id, s.name ?? "");
		else if (s.kind === "view" && !callIds.has(s.id)) toolNames.set(s.id, "view");
		else if (s.kind === "cell") toolNames.set(s.id, CELL_TOOL);
	}
	// JSON.parse yields `any`; the payload came from the document, so it is JSON by
	// construction and the narrow return type is what pi-ai's JsonValue guard needs.
	const parseJson = (text: string): JsonValue | undefined => {
		try {
			return JSON.parse(stripFence(text)) as JsonValue;
		} catch {
			return undefined;
		}
	};
	// Tool arguments are always an object; a view's payload is any JSON value.
	const parseArgs = (text: string): JsonObject => {
		const v = parseJson(text);
		return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : {};
	};

	const messages: AgentMessage[] = [];
	let run: (TextContent | ThinkingContent | ToolCall)[] = [];
	/** Calls emitted into the message being accumulated that the document does
	 *  not answer, in order — their results are owed the moment it closes. */
	const owed: { id: string; name: string; text: string }[] = [];
	const flush = () => {
		if (!run.length) return;
		messages.push({ role: "assistant", content: run, ...assistantMeta() } as unknown as AgentMessage);
		run = [];
	};
	/**
	 * Answers for the calls the document does not answer itself.
	 *
	 * A `tool_use` with no `tool_result` is rejected by the provider, so a
	 * document that produces one cannot be sent — and every send after an edit
	 * above the prompt rebuilds the transcript from the document. Two ways a call
	 * ends up unanswered, and both are answered here rather than dropped:
	 *
	 *  - **A cell.** Its result is never written (see `serializeToolResult`): the
	 *    call IS the cell and `ok` says nothing. Synthesizing it from the id just
	 *    emitted for the call is the whole fix — there is no second marker left to
	 *    disagree about the id, which is what used to brick the session.
	 *  - **Anything else** whose `pi:result` was interrupted, hand-deleted, or
	 *    edited away. The call still says what the agent did, so it is kept and
	 *    told the truth about its answer — the same repair `healDanglingToolCalls`
	 *    makes server-side for a transcript a dead process left open.
	 *
	 * Drained after `flush`, never before a real result: the same message may also
	 * hold a call whose answer IS in the document, and those keep their document
	 * order. Hence a separate function rather than a tail on `flush` — the
	 * `toolResult` branch flushes and must not drain.
	 */
	const drainOwed = () => {
		for (const { id, name, text } of owed)
			messages.push({
				role: "toolResult",
				toolCallId: id,
				toolName: name,
				content: [{ type: "text", text }],
				isError: false,
				timestamp: 0,
			} as unknown as AgentMessage);
		owed.length = 0;
	};

	/** The artifact block the walk is inside, if any — a cell's `group` argument
	 *  comes from its container now, not from a token on its own marker. */
	let inArtifact: string | undefined;
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		if (seg.kind === "artifact") inArtifact = seg.name;
		else if (seg.kind !== "cell" && !ARTIFACT_TRANSPARENT.has(seg.kind)) inArtifact = undefined;
		// The message that owed these results has closed and the document's own
		// results for it have all been read, because the next segment is not one.
		// Owed answers go here — before anything starts the next message, which is
		// what "a tool_result matches a tool_use in the PREVIOUS message" means.
		// The post-`flush` drains below cover the other half: a message still being
		// accumulated when its block ends.
		if (owed.length && !run.length && seg.kind !== "toolResult") drainOwed();
		switch (seg.kind) {
			case "block":
			case "opaque":
				break;
			// Structure, not a turn: the marker says which cells belong together,
			// and `serializeAssistant` writes it back from their `group` argument.
			case "artifact":
				break;
			case "user": {
				flush();
				drainOwed();
				if (!seg.text) break; // the trailing pending prompt is not a message
				if (!openers.size || !isFolded(segments, i)) openers.add(messages.length);
				if (pendingRefs.length) attachments.set(messages.length, pendingRefs);
				pendingRefs = [];
				messages.push({ role: "user", content: [{ type: "text", text: seg.text }], timestamp: 0 } as unknown as AgentMessage);
				break;
			}
			case "file": {
				// Not a message of its own: an attachment belongs to the prompt under
				// it, and the reference is claimed by the next user segment. The bytes
				// stay on disk — only the server reads them.
				const ref = fileRefOf(seg);
				if (ref) pendingRefs.push(ref);
				break;
			}
			case "aside": {
				// Two messages: the face-only one that was answered, which the
				// document never held, and the answer. What the face did is gone,
				// and the message that stands for it says so.
				flush();
				drainOwed();
				if (!seg.text) break;
				messages.push({ role: "user", content: [{ type: "text", text: FACE_UNKEPT }], timestamp: 0 } as unknown as AgentMessage);
				messages.push({ role: "assistant", content: [{ type: "text", text: seg.text }], ...assistantMeta() } as unknown as AgentMessage);
				break;
			}
			case "note": {
				// Page material, not a turn: a `custom` message sits in the session on
				// the branch and converts to user content for the model, so it is
				// written once and never re-attached per prompt.
				flush();
				drainOwed();
				if (!seg.text) break;
				if (!openers.size || !isFolded(segments, i)) openers.add(messages.length);
				messages.push({
					role: "custom",
					customType: NOTE_TYPE,
					content: wrapNote(seg.text),
					display: true,
					timestamp: 0,
				} as unknown as AgentMessage);
				break;
			}
			case "toolResult":
				flush();
				// A result naming no call in this document is not a message — it is
				// wreckage: a call deleted by hand, or (before cells stopped writing
				// their results) a `pi:result` carrying the raw `toolu_…` beside a
				// `pi:cell` addressed by its short id. Replaying it produces exactly
				// the dangling `tool_result` the provider rejects, so drop it. This
				// is the rule `isAck` already renders by.
				if (!toolNames.has(seg.id ?? "")) break;
				messages.push({
					role: "toolResult",
					toolCallId: seg.id ?? "",
					toolName: toolNames.get(seg.id ?? "") ?? "",
					content: [{ type: "text", text: stripFence(seg.text) }],
					isError: Boolean(seg.isError),
					timestamp: 0,
				} as unknown as AgentMessage);
				break;
			case "assistant":
				if (seg.text) run.push({ type: "text", text: seg.text });
				break;
			case "thinking":
				// The signature is not in the document (never serialized) — a rebuilt
				// thinking part is unsigned. See docs/document-format.md.
				if (seg.text) run.push({ type: "thinking", thinking: seg.text });
				break;
			case "toolCall":
				run.push({ type: "toolCall", id: seg.id ?? "", name: seg.name ?? "", arguments: parseArgs(seg.text) });
				if (!answered.has(seg.id ?? "")) owed.push({ id: seg.id ?? "", name: seg.name ?? "", text: UNANSWERED });
				break;
			case "view":
				// A view the agent CALLED is answered in the document, and its answer
				// is worth keeping — usually `ok`, sometimes "the data does not fit
				// that template". A view with no answer was written by the host, not
				// called by anyone: the `cell-state` store, a subsession card, a view
				// the user lifted out of a tool result. Replaying one of those invents
				// a tool call the agent never made, and an unanswerable one at that.
				// It is page material; the document renders it and the transcript does
				// not carry it.
				// So is a view sharing a `pi:tool` call's id: that call's live panel, whose
				// answer is the call's own and is replayed with it.
				if (!answered.has(seg.id ?? "") || callIds.has(seg.id ?? "")) break;
				run.push({
					type: "toolCall",
					id: seg.id ?? "",
					name: "view",
					arguments: { template: seg.name ?? "", data: parseJson(seg.text) ?? null },
				});
				break;
			case "cell":
				// The inverse of the serializer's fold: a cell that opens a block becomes
				// its own assistant message, so it re-serializes as a first part and opens
				// again. A folded one stays in the run and comes back behind its marker.
				// Without this the round trip drifts — a cell you inserted under an answer
				// would rejoin that answer the next time the document was rebuilt.
				//
				// A cell INSIDE an artifact never splits: the block's cells were written
				// by one message and re-serialize as one, with the marker in front.
				if (inArtifact === undefined && !isFolded(segments, i)) {
					flush();
					drainOwed();
				}
				run.push({
					type: "toolCall",
					id: seg.id ?? "",
					name: CELL_TOOL,
					// `id` and `group` are replayed, not just the source: that is what
					// tells the agent it REDEFINED cell #x in group @y rather than
					// adding another one — the invariant behind "reply to the artifact
					// and it changes, it does not multiply".
					arguments: {
						source: stripFence(seg.text),
						mode: seg.name ?? "js",
						id: seg.id ?? "",
						// From the block it sits in. A `@group` still on the fence is a
						// document written before the marker existed, and it still works.
						...((seg.group ?? inArtifact) ? { group: seg.group ?? inArtifact } : {}),
					},
				});
				// Only when the document does not answer it already: a document written
				// before cells stopped storing their results still carries them, and two
				// answers to one call is the same rejection as none.
				if (!answered.has(seg.id ?? "")) owed.push({ id: seg.id ?? "", name: CELL_TOOL, text: CELL_OK });
				break;
		}
	}
	flush();
	drainOwed();
	return { messages, openers, attachments };
}
