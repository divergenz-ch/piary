// The block rail: `<chat-index>`, a tick per block and its steps, down the right
// edge of the window.
//
// It answers two canvas events — where the reading line is (`scroll-progress`,
// the dark tick) and which block the caret is in (`caret-block`, the glow) —
// and is rebuilt whenever the document changes: on every save the canvas asks
// for, and on every chunk a turn writes, which no save reports while it runs.

import "../src/components/ChatIndex.ts";
import { type ChatIndex, indexFromSegments } from "../src/components/ChatIndex.ts";
import { RailEvent, type RailEventDetail, type RailEventName } from "../src/canvas/events.ts";
import { moveBlockText, parseDocument, rekeyFolds } from "../src/document/format.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";
import type { DocumentSync } from "./document-sync.ts";
import { storeFolds } from "./folds.ts";
import "./rail.css";
import type { Turn } from "./turn.ts";

export interface Rail {
	/** Rebuilds the rail on the next frame; call whenever the document may have changed. */
	refresh(): void;
	/** The canvas events the rail answers. */
	handlers(): HostFragment<"caret-block" | "scroll-progress">;
}

/** Mounts the block rail beside the canvas and keeps it current. */
export function mountRail(
	{ chat, sid, busy }: Pick<AppContext, "chat" | "sid" | "busy">,
	feeds: { sync: Pick<DocumentSync, "onChange">; turn: Pick<Turn, "onChanged"> },
): Rail {
	const rail = document.createElement("chat-index") as ChatIndex;
	// Beside `#app` rather than inside the canvas: it is fixed to the window,
	// and the canvas's own scrolling must not carry it.
	document.body.append(rail);

	// A fixed overlay: without this, a wheel over the rail scrolls nothing.
	rail.addEventListener("wheel", (event) => chat.scrollDocBy(event.deltaY), { passive: true });

	let pending = false;
	const rebuild = () => {
		pending = false;
		// The editor has already parsed this text for its own decorations; taking
		// its parse is the difference between a scan per chunk and none.
		const held = chat.parsed();
		const segments = (held?.parsed ?? parseDocument(chat.getDocument())).segments;
		// No declared badges: they come from the transcript's mode state, which
		// the app does not carry. Blocks still badge from the marks a mode left in
		// the document.
		rail.entries = indexFromSegments(segments, null);
		// The buffer's head badges follow the rail's.
		chat.setBlockBadges(
			rail.entries.filter((entry) => entry.key === entry.blockKey && entry.badge).map((entry) => ({ from: entry.pos, badge: entry.badge! })),
		);
	};
	const refresh = () => {
		// Once per frame however many changes arrive in it: a turn writes per chunk.
		if (pending) return;
		pending = true;
		requestAnimationFrame(rebuild);
	};

	/**
	 * Moves a whole block before `beforeKey` (null: the end). An undoable splice,
	 * so the artifacts in the moved block keep running. Not while a turn writes
	 * into the page.
	 */
	const moveBlock = (blockKey: string, beforeKey: string | null) => {
		if (busy()) return;
		const before = chat.getDocument();
		const next = moveBlockText(before, blockKey, beforeKey);
		if (next === null) return;
		// Found again by what each head says: positional mapping cannot follow
		// text that moved.
		const folds = rekeyFolds(before, chat.blockFolds(), next);
		chat.replaceDocument(next);
		// After the splice, not before: the editor maps its folds through the
		// change, and that mapping cannot follow a block that moved.
		chat.setBlockFolds(folds);
		storeFolds(sid, folds);
		refresh();
	};

	// The rail's own events, every one answered (src/canvas/events.ts).
	const answers: { [K in RailEventName]: (detail: RailEventDetail[K]) => void } = {
		// Scrolling is reading, not editing: no turn blocks it.
		"index-select": ({ entry }) => chat.scrollToOffset(entry.pos),
		"block-move": ({ blockKey, beforeKey }) => moveBlock(blockKey, beforeKey),
	};
	for (const name of Object.values(RailEvent)) {
		// `name` is the whole union here; the table pairs each with its detail.
		const answer = answers[name] as (detail: unknown) => void;
		rail.addEventListener(name, (event) => answer((event as CustomEvent).detail));
	}

	feeds.sync.onChange(refresh);
	feeds.turn.onChanged(refresh);
	void chat.updateComplete.then(refresh);

	return {
		refresh,
		handlers: () => ({
			"caret-block": ({ key }) => {
				rail.currentBlockKey = key;
			},
			"scroll-progress": ({ progress, position }) => {
				rail.progress = progress;
				rail.documentPosition = position;
			},
		}),
	};
}
