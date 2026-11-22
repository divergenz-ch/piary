// The conversation list, down the left of the window: every conversation in
// this workspace, most recently changed first, named by its own first line
// (`documentLabel`), with a dot on one pi is answering. The component is
// `src/components/SessionList.ts`; this module feeds it, and answers each
// row's `⋯`: open in a new window, rename, duplicate, export, delete.

import "../src/components/SessionList.ts";
import {
	cellStateRead,
	cellStateWrite,
	deleteConversation,
	docsEntries,
	docsRead,
	docsWrite,
	onDocChanged,
	onPiEvent,
	openDocument,
	openTransfer,
	piRunning,
	piSend,
	piStart,
} from "../src/bridge.ts";
import type { ChannelSession, SessionList } from "../src/components/SessionList.ts";
import { documentLabel, emptyDocument, rebindDocument, renameDocument } from "../src/document/format.ts";
import { iconDOM } from "../src/utils/icons.ts";
import { PanelLeft } from "lucide";
import type { AppContext } from "./context.ts";
import { storedFolds, storeFolds } from "./folds.ts";
import { newSid } from "./ids.ts";
import { openMenu } from "./menu.ts";
import type { ModelPicker } from "./picks.ts";
import { SWITCH_EVENT } from "./switching.ts";
import "./conversations.css";

/** How long the list waits after a document changes before it reads the
 *  store again: a typed heading is one read, not one per keystroke's save. */
const REFRESH_DEBOUNCE_MS = 300;

export interface Conversations {
	/** The list element, for the features that answer its rows. */
	readonly list: SessionList;
	/** Reads the store again: the rows, their labels, their order. */
	refresh(): Promise<void>;
}

/** Below this width the list would squeeze the conversation, so it starts
 *  hidden and opens over the text rather than beside it. */
const NARROW = "(max-width: 760px)";

/** Where the list's shown-or-hidden choice is kept: a convenience of this
 *  window's own, so the browser's storage rather than the store. */
const SHOWN_KEY = "piary-conversations-shown";

function storedShown(): boolean | null {
	try {
		const value = localStorage.getItem(SHOWN_KEY);
		return value === null ? null : value === "true";
	} catch {
		return null;
	}
}

function storeShown(shown: boolean): void {
	try {
		localStorage.setItem(SHOWN_KEY, String(shown));
	} catch {} // a storage that refuses costs the remembered choice, not the list
}

/**
 * The list's column and its show/hide button. On a wide window the column sits
 * beside the conversation and the choice is remembered; on a narrow one it
 * starts hidden, opens over the text with a surface of its own, and closes
 * again on its own when the window narrows or widens past the line.
 */
function mountColumn(list: HTMLElement): void {
	const column = document.createElement("aside");
	column.className = "conversations";
	column.append(list);
	document.body.prepend(column);

	const button = document.createElement("button");
	button.type = "button";
	button.className = "conversations-toggle";
	button.append(iconDOM(PanelLeft, "sm"));
	document.body.append(button);

	const narrow = matchMedia(NARROW);
	let openOverText = false;
	const paint = () => {
		const shown = narrow.matches ? openOverText : (storedShown() ?? true);
		document.body.classList.toggle("conversations-shown", shown);
		document.body.classList.toggle("conversations-narrow", narrow.matches);
		button.setAttribute("aria-expanded", String(shown));
		button.setAttribute("aria-label", shown ? "Hide the conversation list" : "Show the conversation list");
		button.title = button.getAttribute("aria-label")!;
	};
	button.addEventListener("click", () => {
		if (narrow.matches) openOverText = !openOverText;
		else storeShown(!(storedShown() ?? true));
		paint();
	});
	narrow.addEventListener("change", () => {
		openOverText = false;
		paint();
	});
	paint();
}

/** Asks this window to show `id` (`app/switching.ts`); `discard` leaves this
 *  one unsaved, because it no longer exists. */
const switchTo = (id: string, discard = false): void => {
	document.dispatchEvent(new CustomEvent(SWITCH_EVENT, { detail: { id, discard } }));
};

/** Mounts the list and keeps it current: rows from the store, running dots
 *  from pi's events. A row's click shows its conversation in this window, and
 *  + a new one. */
export function mountConversations({ chat, sid, notify }: Pick<AppContext, "chat" | "sid" | "notify">, model?: Pick<ModelPicker, "stageFor">): Conversations {
	const list = document.createElement("session-list") as SessionList;
	list.actionsMenu = true;
	list.currentSid = sid;
	mountColumn(list);

	const running = new Set<string>();
	const paintRunning = () => (list.streamingSids = [...running]);

	const refresh = async (): Promise<void> => {
		const entries = (await docsEntries().catch(() => null)) ?? [];
		const rows: ChannelSession[] = await Promise.all(
			entries.map(async (entry) => ({
				sid: entry.id,
				n: 0,
				mtime: entry.modifiedMs,
				label: documentLabel((await docsRead(entry.id).catch(() => null)) ?? ""),
				channel: "web" as const,
			})),
		);
		list.sessions = rows;
		// A window that just booted has heard no events yet, so each live pi is
		// asked whether it is answering. A pi not running is not asked: nothing
		// is started to fill a list.
		await Promise.all(
			rows.map(async (row) => {
				if (running.has(row.sid) || !(await piRunning(row.sid).catch(() => false))) return;
				const state = await piSend(row.sid, { type: "get_state" }).catch(() => null);
				if (state?.data?.["isStreaming"] === true) running.add(row.sid);
			}),
		);
		paintRunning();
	};

	let pending: ReturnType<typeof setTimeout> | undefined;
	const soon = () => {
		clearTimeout(pending);
		pending = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
	};

	list.addEventListener("session-select", (event) => switchTo((event as CustomEvent<{ sid: string }>).detail.sid));
	// Written before the switch, so the window boots on a file rather than
	// asking a pi that has never heard of it for a transcript.
	list.addEventListener("session-new", () => {
		const id = newSid();
		model?.stageFor(id);
		void docsWrite(id, emptyDocument(id)).then(() => switchTo(id), () => switchTo(id));
	});

	/** A conversation's text as it stands: this window's buffer for its own. */
	const textOf = async (id: string): Promise<string> => (id === sid ? chat.getDocument() : ((await docsRead(id)) ?? ""));
	const failed = (what: string) => (error: unknown) => notify(`Could not ${what}: ${error instanceof Error ? error.message : String(error)}`);

	/** A rename writes the conversation's first heading (`renameDocument`): an
	 *  ordinary edit in this window's buffer, undoable, or a write through the
	 *  store for another. pi is told the name too, when it is running. */
	const rename = async (id: string, name: string): Promise<void> => {
		if (id === sid) {
			chat.edit((md) => {
				const edit = renameDocument(md, name);
				return edit ? { changes: edit } : null;
			});
		} else {
			const md = await textOf(id);
			const edit = renameDocument(md, name);
			if (edit) await docsWrite(id, md.slice(0, edit.from) + edit.insert + md.slice(edit.to));
		}
		if (await piRunning(id).catch(() => false)) await piSend(id, { type: "set_session_name", name: name.trim() }).catch(() => null);
		soon();
	};

	/** A copy, shown in this window: the document bound to its own session, its
	 *  widget state, and its folds — whose offsets hold, the text being the
	 *  same. pi's transcript is not copied: the copy's first send rebuilds its
	 *  history from the document (ADR 0002). */
	const duplicate = async (id: string): Promise<void> => {
		const copy = newSid();
		// A copy of this window's conversation runs what it runs; of another, pi's default.
		if (id === sid) model?.stageFor(copy);
		await docsWrite(copy, rebindDocument(await textOf(id), copy));
		const state = await cellStateRead(id).catch(() => undefined);
		if (state !== undefined) await cellStateWrite(copy, state).catch(() => {});
		storeFolds(copy, storedFolds(id));
		switchTo(copy);
	};

	/** Deleted whole: its pi is started first so it can say where its transcript
	 *  is (`delete_conversation`). This window, when it showed it, moves to the
	 *  next conversation, or a new one. */
	const remove = async (id: string): Promise<void> => {
		await piStart(id).catch(() => {});
		await deleteConversation(id);
		storeFolds(id, []);
		if (id !== sid) return soon();
		const next = list.sessions.find((row) => row.sid !== id)?.sid;
		if (next) return switchTo(next, true);
		const fresh = newSid();
		model?.stageFor(fresh);
		await docsWrite(fresh, emptyDocument(fresh));
		switchTo(fresh, true);
	};

	/** The second step of a delete, in place of `confirm()`, which a webview
	 *  would freeze on. */
	const confirmDelete = (id: string, x: number, y: number) => {
		const label = list.sessions.find((row) => row.sid === id)?.label || "untitled";
		openMenu(x, y, [
			{ section: `Delete “${label}”?` },
			{ label: "delete, with its history", destructive: true, run: () => void remove(id).catch(failed("delete it")) },
			{ label: "cancel", run: () => {} },
		]);
	};

	list.addEventListener("session-menu", (event) => {
		const { sid: id, x, y } = (event as CustomEvent<{ sid: string; x: number; y: number }>).detail;
		const here = id === sid;
		openMenu(x, y, [
			{
				label: "open in new window",
				disabled: here,
				title: here ? "This window shows it" : undefined,
				run: () => void openDocument(id).catch(failed("open it")),
			},
			{ label: "rename", run: () => list.startRename(id) },
			{
				label: "duplicate",
				disabled: running.has(id),
				title: running.has(id) ? "Wait for the answer to finish" : undefined,
				run: () => void duplicate(id).catch(failed("duplicate it")),
			},
			// The Export window, on this conversation alone (ADR 0049).
			{ label: "export…", run: () => void openTransfer("export", id).catch(failed("export it")) },
			{ label: "delete…", destructive: true, run: () => confirmDelete(id, x, y) },
		]);
	});
	list.addEventListener("session-rename", (event) => {
		const { sid: id, label } = (event as CustomEvent<{ sid: string; label: string }>).detail;
		void rename(id, label).catch(failed("rename it"));
	});

	void onDocChanged(soon);
	void onPiEvent((eventSid, event) => {
		if (event["type"] === "agent_settled" || event["type"] === "error") running.delete(eventSid);
		else if (!running.has(eventSid)) running.add(eventSid);
		else return;
		paintRunning();
	});
	void refresh();
	return { list, refresh };
}
