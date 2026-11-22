// The window's document and the store's file, kept in step both ways (ADR 0018).
//
// The file is the truth (ADR 0001): every edit is written back, and an edit
// another program makes to the file is taken into the open window. What makes
// that safe is one small state cluster — the versions this window has handed
// the store, the text the buffer and the file last agreed on, and whether the
// file holds a version this build must not write over — which is why both
// directions live here together.

import { docsRead, docsWrite, onDocChanged } from "../src/bridge.ts";
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import { rewriteRefusal } from "../src/document/format.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { StatusLine } from "./status.ts";
import type { Turn } from "./turn.ts";

/** Said when an outside edit is not taken in, because the window's own text
 *  is newer than anything saved. */
const KEPT_OVER_OUTSIDE_EDIT =
	"The file changed outside Piary while this window had unsaved text, so this window's copy was kept and its next save replaces that edit.";

export interface DocumentSyncDeps {
	sid: string;
	chat: DocumentChat;
	turn: Pick<Turn, "running">;
	status: Pick<StatusLine, "notify" | "notSaved" | "saved">;
	/** What the store held when the window opened, or null when it held nothing. */
	stored: string | null;
	/** What the window opened on. */
	initial: string;
}

export class DocumentSync {
	readonly #deps: DocumentSyncDeps;

	// What this window has handed the store and not yet seen replaced, oldest
	// first: every write still in flight, behind the last one that finished — and
	// a version an outside edit brought in. A version of the file in here is one
	// this window already holds, so the watcher reporting it is not news.
	readonly #known: Array<{ content: string }>;

	// The text the buffer and the file last agreed on: the last write asked for,
	// or the outside edit last reconciled in. A buffer that differs from it holds
	// keystrokes no save has taken yet.
	#agreed: string;

	// Why the file on disk must not be written over, when an outside edit left a
	// version this build does not know and the buffer did not take it in.
	#diskRefusal: string | null = null;

	#reconciling = Promise.resolve();

	/** Whoever hears about each change after it is handed to the store. */
	readonly #changed: Array<(value: string) => void> = [];

	constructor(deps: DocumentSyncDeps) {
		this.#deps = deps;
		this.#known = deps.stored === null ? [] : [{ content: deps.stored }];
		this.#agreed = deps.initial;
	}

	// The file is the truth (ADR 0001), so an edit nobody stored is a lie the page
	// tells until it is reloaded. The canvas debounces this already — it fires
	// `doc-change` once the typing stops, or by its deadline while a turn streams —
	// so there is no second debounce here.
	//
	// A failed write is surfaced rather than swallowed (ADR 0011): losing work
	// quietly is worse than saying so. So is a write refused: a document in a
	// format version this build does not know is shown but never written back
	// (document-format.md §Frontmatter), and the same line says why — whether the
	// unknown version is in the buffer or in the file it would replace.
	save(value: string): Promise<void> {
		const { sid, status } = this.#deps;
		const refusal = rewriteRefusal(value) ?? this.#diskRefusal;
		if (refusal) {
			status.notSaved(refusal);
			return Promise.resolve();
		}
		this.#agreed = value;
		const write = { content: value };
		this.#known.push(write);
		return docsWrite(sid, value).then(
			// Written in order (src/bridge.ts), so every write before this one has
			// landed and been replaced on disk.
			() => {
				this.#known.splice(0, this.#known.indexOf(write));
				status.saved();
			},
			(error: unknown) => {
				this.#known.splice(this.#known.indexOf(write), 1);
				status.notSaved(String(error));
			},
		);
	}

	/** The canvas's save request. */
	handlers(): HostFragment<"doc-change"> {
		return {
			"doc-change": ({ value }) => {
				void this.save(value);
				for (const listener of this.#changed) listener(value);
			},
		};
	}

	/** Hears every change the canvas reports, after it is handed to the store.
	 *  The way a feature follows the document: `doc-change` has one answer, and
	 *  this is it (ADR 0024). */
	onChange(listener: (value: string) => void): void {
		this.#changed.push(listener);
	}

	// Another program changed this conversation's file — an editor, a `git
	// checkout` (ADR 0001). The edit is reconciled into the buffer in place (ADR
	// 0018 §3): `reconcileDocument`, not `setDocument`, because the text is the
	// same document — its cells and live views are its own and must live, and the
	// caret stays where the writer left it.
	//
	// Two reports are not taken in. The store renames each save onto the
	// document's own name, so the watcher reports every write this window makes;
	// a file holding a version in `known` is that echo, and applying it would take
	// back whatever was typed since the save. And when the buffer holds text no
	// save has taken yet, or a turn is writing into it, the window keeps its copy:
	// the keystrokes and the answer exist nowhere else, while the outside edit is
	// still in whatever made it. The next save then replaces the edit on disk, and
	// the user is told so — unless the file is in a version this build must not
	// rewrite, in which case nothing is written over it (§Frontmatter).
	watch(): void {
		void onDocChanged((id) => {
			if (id !== this.#deps.sid) return;
			// One at a time, so a burst of reports is read and judged in order.
			this.#reconciling = this.#reconciling.then(() => this.#reconcileFromDisk());
		});
	}

	async #reconcileFromDisk(): Promise<void> {
		const { sid, chat, turn, status } = this.#deps;
		// A file that is gone, or cannot be read, leaves the buffer as it is: the
		// next save writes it back.
		const md = await docsRead(sid).catch(() => null);
		if (md === null || this.#known.some((version) => version.content === md)) return;
		if (turn.running || chat.streaming || chat.getDocument() !== this.#agreed) {
			this.#diskRefusal = rewriteRefusal(md);
			if (this.#diskRefusal) status.notSaved(this.#diskRefusal);
			else status.notify(KEPT_OVER_OUTSIDE_EDIT);
			return;
		}
		this.#diskRefusal = null;
		this.#agreed = md;
		this.#known.push({ content: md });
		chat.reconcileDocument(md);
	}
}
