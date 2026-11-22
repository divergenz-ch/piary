// The canvas's outbound protocol: every event `<document-chat>` raises for its
// host to act on, and what each one carries.
//
// The canvas does not perform structural edits, open menus or talk to pi
// itself — it reports the gesture and its host does the work. So a host that
// does not listen for an event leaves that gesture dead, silently, with every
// emission test still green. This list is what a host is held to:
// `tests/contract/canvas-events.test.ts` keeps it equal to what the source dispatches,
// and the app page's table must name a disposition for every entry.
//
// No DOM and no runtime imports: the test reads this module straight from
// `src/`, with no build and no jsdom.

import type { ChatIndexEntry } from "../components/ChatIndex.ts";
import type { CaretBlock, CellFailure } from "../components/DocumentChat.ts";
import type { PromptEdit } from "../document/keystrokes.ts";

/** Every event `<document-chat>` raises for its host. */
export const CanvasEvent = {
	DocSend: "doc-send",
	DocStop: "doc-stop",
	DocChange: "doc-change",
	DocDraft: "doc-draft",
	PromptEdit: "prompt-edit",
	DocFiles: "doc-files",
	BlockMenu: "block-menu",
	CellMenu: "cell-menu",
	SegmentMenu: "segment-menu",
	SelectionMenu: "selection-menu",
	CellInsert: "cell-insert",
	CellMove: "cell-move",
	BlockFolds: "block-folds",
	CellStateSave: "cell-state-save",
	CellFailure: "cell-failure",
	CaretBlock: "caret-block",
	ScrollProgress: "scroll-progress",
	LiveViewSend: "live-view-send",
	LiveViewClosed: "live-view-closed",
	SubsessionOpen: "subsession-open",
	SubsessionStop: "subsession-stop",
	AsideDismiss: "aside-dismiss",
} as const;
export type CanvasEventName = (typeof CanvasEvent)[keyof typeof CanvasEvent];

/** A menu's anchor: the offset it is about, and viewport coordinates to open at. */
interface MenuAt {
	from: number;
	x: number;
	y: number;
}

/** What each event carries. The detail is the contract, not the name: a host
 *  that reads the wrong field sends the wrong thing (tests/integration/events.test.ts). */
export interface CanvasEventDetail {
	/** `followUp` queues behind a live turn; `newBlock` is absent on a follow-up. */
	"doc-send": { text: string; followUp: boolean; newBlock?: boolean; at: number };
	"doc-stop": null;
	"doc-change": { value: string };
	"doc-draft": { value: string };
	/** A change to one prompt's body, as it was made: `prompt` counts the
	 *  prompts above it, and each edit's `from` is into the body, after the
	 *  edits before it. It carries the change and no other text. */
	"prompt-edit": { prompt: number; edits: PromptEdit[] };
	/** `pos` is where a drop landed; absent for a paste. */
	"doc-files": { files: File[]; pos?: number };
	"block-menu": MenuAt;
	"cell-menu": MenuAt;
	"segment-menu": MenuAt;
	"selection-menu": { text: string; from: number; to: number; x: number; y: number };
	"cell-insert": { at: number; x: number; y: number };
	/** `beforeFrom` is the cell the moved one lands above; null is the end. */
	"cell-move": { from: number; beforeFrom: number | null };
	"block-folds": { folds: number[] };
	"cell-state-save": { state: unknown };
	"cell-failure": CellFailure;
	"caret-block": CaretBlock;
	"scroll-progress": { progress: number; position: number };
	"live-view-send": { id: string; message: Record<string, unknown> };
	"live-view-closed": { id: string };
	"subsession-open": { sid: string };
	"subsession-stop": { sid: string };
	/** The user said an unasked reply did not help; `from` is where its
	 *  segment begins. */
	"aside-dismiss": { from: number };
}

/** Events that cross elements INSIDE the canvas and are consumed there. They
 *  bubble out of it too, and a host has nothing to do with them. */
export const INTERNAL_EVENTS = ["fold-toggle", "view-toggle", "cell-syntax-error", "pi-cell-writeback"] as const;

// ── The block rail ───────────────────────────────────────────────────────────
// `<chat-index>` is not part of the canvas: a page mounts it beside
// `<document-chat>`. A page that does answers to its events the way it answers
// to the canvas's — every one named here, held to the source by the same test.

/** Every event `<chat-index>` raises for the page that mounts it. */
export const RailEvent = {
	IndexSelect: "index-select",
	BlockMove: "block-move",
} as const;
export type RailEventName = (typeof RailEvent)[keyof typeof RailEvent];

export interface RailEventDetail {
	/** A tick was chosen, by a click, the keyboard or a drag along the rail. */
	"index-select": { entry: ChatIndexEntry };
	/** A block was ⌥-dragged to sit before `beforeKey`; null is the end. */
	"block-move": { blockKey: string; beforeKey: string | null };
}

