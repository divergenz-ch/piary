// A window switches among conversations in place (the conversation list): the
// one it shows is saved, and the window's page boots again on the other
// (`?id=`, `app/boot.ts`). One editor per file still holds: a conversation
// another window shows is focused there instead (`show_document`).
//
// A switch away from a running answer does not stop it. Its run is handed to
// the background follower (`app/background.ts`), which goes on writing it
// through the store, and the follow is carried across the page's reload in
// the window's session storage until pi settles it.

import { piSend, showDocument, windowShows } from "../src/bridge.ts";
import { PI_PLACEHOLDER } from "../src/document/format.ts";
import type { Mirror } from "../src/document/mirror.ts";
import { followRun } from "./background.ts";
import type { AppContext } from "./context.ts";
import type { DocumentSync } from "./document-sync.ts";

/** Where this window keeps the runs it follows across a reload. */
const FOLLOWED = "piary-followed-runs";

type Followed = Record<string, Mirror>;

function followed(): Followed {
	try {
		return JSON.parse(sessionStorage.getItem(FOLLOWED) ?? "{}") as Followed;
	} catch {
		return {};
	}
}

function remember(sid: string, mirror: Mirror | null): void {
	const runs = followed();
	if (mirror) runs[sid] = mirror;
	else delete runs[sid];
	try {
		sessionStorage.setItem(FOLLOWED, JSON.stringify(runs));
	} catch {
		// A full store costs the follow after the next switch, not this one.
	}
}

/** Follows `sid`'s run from `mirror`, remembered until pi settles it. */
function follow(sid: string, mirror: Mirror): void {
	remember(sid, mirror);
	void followRun(sid, mirror, { echoPending: false, progress: (now) => remember(sid, now) });
}

/**
 * Once per page: tells Rust which document this window shows, and goes on
 * following the runs a switch handed over before the reload — those pi still
 * streams. A run that ended meanwhile wrote its last save already.
 */
export async function resumeFollowing(sid: string): Promise<void> {
	await windowShows(sid).catch(() => {});
	await Promise.all(
		Object.entries(followed()).map(async ([run, mirror]) => {
			const state = await piSend(run, { type: "get_state" }).catch(() => null);
			if (state?.data?.["isStreaming"] === true) follow(run, mirror);
			else remember(run, null);
		}),
	);
}

/**
 * Shows `id` in this window: focused where another window shows it, else this
 * one's document is saved — a running answer handed to the background — and
 * the page boots on `id`.
 */
export function createSwitching({ chat, sid, turn }: Pick<AppContext, "chat" | "sid" | "turn">, sync: Pick<DocumentSync, "save">) {
	/** Saves this conversation on the way out; a running answer is handed to
	 *  the background with the message being streamed dropped, since pi's next
	 *  update carries it whole, as every update does. */
	const leave = async (): Promise<void> => {
		if (!turn.running) return sync.save(chat.getDocument());
		const parts = chat.detachStream();
		const mirror = { head: parts.head, current: parts.current ? PI_PLACEHOLDER : "", tail: parts.tail };
		await sync.save(mirror.head + mirror.current + mirror.tail);
		remember(sid, mirror);
	};

	return async function switchTo(id: string, discard = false): Promise<void> {
		if (id === sid) return;
		if (await showDocument(id).catch(() => false)) return;
		// A conversation that is gone (deleted) is left unsaved: a save would
		// write it back.
		if (!discard) await leave();
		location.replace(new URL(`index.html?id=${encodeURIComponent(id)}`, location.href));
	};
}

/** The event a request to switch arrives as, `{ id, discard? }`: the
 *  conversation list's rows raise it, and so does anything else that wants this
 *  window to show another conversation. `discard` leaves without saving, for a
 *  conversation that no longer exists. */
export const SWITCH_EVENT = "piary-switch";

/** Once per page: resumes the runs this window follows, and switches on each
 *  `SWITCH_EVENT`. */
export async function setupSwitching(ctx: Pick<AppContext, "chat" | "sid" | "turn">, sync: Pick<DocumentSync, "save">): Promise<void> {
	const switchTo = createSwitching(ctx, sync);
	document.addEventListener(SWITCH_EVENT, (event) => {
		const { id, discard } = (event as CustomEvent<{ id: string; discard?: boolean }>).detail;
		void switchTo(id, discard === true);
	});
	await resumeFollowing(ctx.sid);
}
