// chat-index — a Framework7 list-index adapted to conversations: a slim
// vertical rail of shapes grouped by block — one head tick per block, its
// tool calls / subagents nested smaller beneath it. The shape at
// the reader's scroll position turns dark without changing form. Click or drag
// scrubs through the history (`index-select` fires per entry, like F7's live
// scroll); hover shows a label bubble. Running entries pulse.
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { blocksFrom, type DocSegment, parseDocument } from "../document/format.ts";
import { blockMode, viewIsMode } from "../document/modes.ts";

export interface ChatIndexEntry {
	key: string;
	/** Bubble text: block name (heads), first line of the turn, or the tool name. */
	label: string;
	kind: "user" | "assistant" | "tool" | "agent";
	/** Host-defined scroll target (document offset in the pi doc format). */
	pos: number;
	/** Tool/agent entries: running pulses, error shows destructive. Heads roll up their members'. */
	status?: "running" | "done" | "error";
	/** Key of the block's head entry; the head carries its own key. */
	blockKey: string;
	/** Head sits on a branch point (sibling branches exist) — rail fork glyph. */
	forked?: boolean;
	/** Head of a block that ran in a mode (`plan`, `agent`) — mode catalog's badge. */
	badge?: string;
}

/**
 * Derive index entries from a pi document, grouped by block: one head entry
 * per block (labeled with its heading-derived name) followed by its
 * assistant/tool members. A call without a result is running; an error result
 * marks it error; heads roll up their members' status.
 *
 * `declaredBadges` (blockKey → badge) is what the blocks *declared* — read
 * from the transcript's mode-state entries when the doc aligns cleanly
 * (step 13). Blocks it doesn't cover still badge from the marks a mode left
 * in the document (a sub-agent block's subsession view is its declaration;
 * hand-written docs and unaligned states have nothing else) — blockMode
 * matches only the catalog's own marks, never arbitrary tool names.
 */
export function indexFromDocument(md: string, declaredBadges?: ReadonlyMap<string, string> | null): ChatIndexEntry[] {
	return indexFromSegments(parseDocument(md).segments, declaredBadges);
}

/**
 * The same, for a caller that has already parsed — which the editor always has:
 * `docField` parses once per transaction and every decoration reads that one
 * result. The rail used to re-parse the whole document for itself, on top of
 * the parse the buffer had just done, once per streamed chunk.
 */
export function indexFromSegments(
	segments: readonly DocSegment[],
	declaredBadges?: ReadonlyMap<string, string> | null,
): ChatIndexEntry[] {
	const errorById = new Map<string, boolean>();
	for (const seg of segments) if (seg.kind === "toolResult" && seg.id) errorById.set(seg.id, seg.isError === true);

	const entries: ChatIndexEntry[] = [];
	for (const block of blocksFrom(segments)) {
		const head = segments[block.opensAt];
		const blockKey = `user:${head.from}`;
		const members: ChatIndexEntry[] = [];
		let running = false;
		let error = false;
		for (const i of block.members) {
			const seg = segments[i];
			if (seg.kind === "assistant" && seg.text) {
				const label = seg.text.split("\n", 1)[0].slice(0, 60);
				members.push({ key: `assistant:${seg.from}`, label, kind: "assistant", pos: seg.from, blockKey });
			} else if (seg.kind === "toolCall") {
				const done = seg.id ? errorById.get(seg.id) : undefined;
				const status = done === undefined ? "running" : done ? "error" : "done";
				running ||= status === "running";
				error ||= status === "error";
				members.push({ key: `tool:${seg.from}`, label: seg.name ?? "tool", kind: "tool", pos: seg.from, status, blockKey });
			} else if (seg.kind === "view" && viewIsMode(seg.name)) {
				// A mode's own view (the sub-agent block's subsession link) is the
				// agent in the rail — the catalog says so, no tool-name sniffing.
				members.push({ key: `view:${seg.from}`, label: seg.name ?? "view", kind: "agent", pos: seg.from, blockKey });
			}
		}
		if (!head.text && !members.length) continue; // trailing empty draft
		const status = running ? "running" : error ? "error" : undefined;
		const badge = declaredBadges?.get(blockKey) ?? blockMode(segments, block)?.badge;
		entries.push({ key: blockKey, label: block.name, kind: "user", pos: head.from, status, blockKey, badge }, ...roll(members));
	}
	return entries;
}

/** Mirror the document's activity strip: three or more machine steps in a row
 *  are one tick in the rail too (same threshold as DocumentChat's run fold) —
 *  the rail must not out-count the strip it indexes. Assistant prose breaks a
 *  run, exactly as it breaks the strip. */
function roll(members: ChatIndexEntry[]): ChatIndexEntry[] {
	const out: ChatIndexEntry[] = [];
	for (let i = 0; i < members.length; ) {
		let j = i;
		while (j < members.length && members[j].kind !== "assistant") j++;
		const run = members.slice(i, j);
		if (run.length >= 3)
			out.push({
				...run[0],
				label: `${run.length} steps`,
				status: run.some((e) => e.status === "running")
					? "running"
					: run.some((e) => e.status === "error")
						? "error"
						: "done",
			});
		else out.push(...run);
		if (j < members.length) out.push(members[j]); // the assistant that broke the run
		i = j + 1;
	}
	return out;
}

@customElement("chat-index")
export class ChatIndex extends LitElement {
	@property({ type: Array }) entries: ChatIndexEntry[] = [];
	/** Current document scroll position, from 0 (top) to 1 (bottom). */
	@property({ type: Number }) progress = 0;
	/** Document offset at the viewport's reading anchor. */
	@property({ type: Number }) documentPosition?: number;
	/** Key of the caret's block — its whole cluster highlights ("you are here"). */
	@property({ attribute: false }) currentBlockKey: string | null = null;
	@state() private active = -1;
	/** ⌥-drag reorder in flight: the grabbed block + the insertion slot. */
	@state() private reorder: { key: string; slot: number } | null = null;
	#dragging = false;

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.style.display = "block";
	}

	#select(idx: number) {
		const entry = this.entries[idx];
		if (!entry) return;
		this.active = idx;
		this.dispatchEvent(new CustomEvent("index-select", { detail: { entry }, bubbles: true, composed: true }));
	}

	/** Items share one flex height, so a linear map over the rail is exact. */
	#indexAt(e: PointerEvent): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const i = Math.floor(((e.clientY - rect.top) / rect.height) * this.entries.length);
		return Math.max(0, Math.min(this.entries.length - 1, i));
	}

	/** Insertion boundaries between blocks: each head's entry index, plus the end. */
	#blockBounds(): number[] {
		const heads = this.entries.flatMap((en, i) => (en.key === en.blockKey ? [i] : []));
		return [...heads, this.entries.length];
	}

	/** Nearest block boundary to the pointer — the drop slot. */
	#slotAt(e: PointerEvent): number {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const p = ((e.clientY - rect.top) / rect.height) * this.entries.length;
		const bounds = this.#blockBounds();
		let best = 0;
		for (let i = 1; i < bounds.length; i++) if (Math.abs(bounds[i] - p) < Math.abs(bounds[best] - p)) best = i;
		return best;
	}

	#onPointerDown = (e: PointerEvent) => {
		if (!this.entries.length) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		if (e.altKey) {
			// ⌥-drag moves the grabbed entry's whole block; plain drag scrubs.
			const entry = this.entries[this.#indexAt(e)];
			if (entry) this.reorder = { key: entry.blockKey, slot: this.#slotAt(e) };
			return;
		}
		this.#dragging = true;
		this.#select(this.#indexAt(e));
	};

	#onPointerMove = (e: PointerEvent) => {
		if (this.reorder) {
			this.reorder = { ...this.reorder, slot: this.#slotAt(e) };
			return;
		}
		if (!this.#dragging) return;
		const i = this.#indexAt(e);
		if (i !== this.active) this.#select(i);
	};

	#onPointerUp = () => {
		if (this.reorder) {
			const bound = this.#blockBounds()[this.reorder.slot];
			const beforeKey = bound < this.entries.length ? this.entries[bound].blockKey : null;
			if (beforeKey !== this.reorder.key)
				this.dispatchEvent(
					new CustomEvent("block-move", {
						detail: { blockKey: this.reorder.key, beforeKey },
						bubbles: true,
						composed: true,
					}),
				);
			this.reorder = null;
		}
		this.#dragging = false;
		this.active = -1;
	};

	override render() {
		const active = this.entries[this.active];
		const progress = Math.max(0, Math.min(1, this.progress));
		let current = Math.min(this.entries.length - 1, Math.floor(progress * this.entries.length));
		if (this.documentPosition !== undefined && this.entries.length) {
			current = 0;
			for (let i = 1; i < this.entries.length && this.entries[i].pos <= this.documentPosition; i++) current = i;
		}
		return html`
			<div
				class="chat-index-rail"
				title="drag scrubs · ⌥-drag moves a block"
				@pointerdown=${this.#onPointerDown}
				@pointermove=${this.#onPointerMove}
				@pointerup=${this.#onPointerUp}
				@pointercancel=${this.#onPointerUp}
			>
				${this.entries.map(
					(en, i) => html`
						<button
							class="chat-index-item kind-${en.kind} ${en.status ?? ""} ${en.key === en.blockKey ? "" : "member"} ${en.forked ? "forked" : ""} ${en.badge ? `badge-${en.badge}` : ""} ${en.blockKey === this.currentBlockKey ? "current-block" : ""} ${i === current ? "current" : ""} ${i === this.active ? "active" : ""} ${en.blockKey === this.reorder?.key ? "reordering" : ""}"
							title=${en.label}
							@click=${(e: MouseEvent) => {
								// Pointer taps already selected via pointerdown — a second
								// select here would double-fire. detail 0 = keyboard activation.
								if (e.detail === 0) this.#select(i);
							}}
							@pointerenter=${() => {
								if (!this.#dragging && !this.reorder) this.active = i;
							}}
							@pointerleave=${() => {
								if (!this.#dragging && !this.reorder && this.active === i) this.active = -1;
							}}
						></button>
					`,
				)}
				${this.reorder
					? html`<div
							class="chat-index-drop"
							style="top: ${(this.#blockBounds()[this.reorder.slot] / Math.max(1, this.entries.length)) * 100}%"
						></div>`
					: ""}
			</div>
			${active
				? html`<div class="chat-index-bubble" style="top: ${((this.active + 0.5) / this.entries.length) * 100}%">
						<span class="chat-index-bubble-kind">${active.badge ?? (active.status === "running" ? "running" : active.kind)}</span
						>${active.label}
					</div>`
				: ""}
		`;
	}
}
