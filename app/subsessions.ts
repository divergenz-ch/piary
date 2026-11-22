// Subsessions: a prompt written as `/subagent <prompt>` runs in a child session
// of its own — its own sid, pi, transcript and document — and the parent holds
// a `pi:view subsession` card for it (`src/document/modes.ts`, the card in
// `src/components/views/subsession.ts`). The parent document is the list of
// its children; there is no other register.
//
// The child's run is written by this window, through the store, whether or not
// a window shows the child (`app/background.ts`). It lives as long as this
// window does, or a window showing it (ADR 0019).
//
// What each child has used is read from its pi (`get_session_stats`) when its
// card's status is restored and whenever its run settles, and the parent's
// totals add it (`app/usage.ts`).

import type { Usage } from "@earendil-works/pi-ai";
import { docsRead, docsWrite, onPiEvent, openDocument, piSend, piStart } from "../src/bridge.ts";
import { setSubsessionStatus, subsessionStatus } from "../src/components/views/subsession.ts";
import { frontmatterFor, parseDocument, serializeView, YOU_MARKER } from "../src/document/format.ts";
import { childSessionInvocation } from "../src/document/modes.ts";
import { subsessionInsert } from "../src/document/run.ts";
import { followRun } from "./background.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";
import { newSid } from "./ids.ts";
import { stamped } from "./now.ts";
import { type StatsTotals, statsTotals, sumTotals } from "./usage-pure.ts";

export interface Subsessions {
	/** Takes a send that is a `/subagent` invocation, answering whether it did. */
	divert(text: string): boolean;
	/** Starts `prompt` in a child session; `draft` stays the parent's tail. */
	startSubsession(prompt: string, draft: string): Promise<void>;
	/** A card's open and stop. */
	handlers(): HostFragment<"subsession-open" | "subsession-stop">;
	/** The children's real status, for a parent just opened on `md`: a child
	 *  still running is followed again, one that is not shows done. Given the
	 *  text rather than reading the canvas, which has not rendered it yet. */
	refreshChildren(md: string): Promise<void>;
	/** What the children the document holds have used, summed; `null` until
	 *  one of them has said. */
	childTotals(): Usage | null;
	/** Hears each change to `childTotals`. */
	onChildUsage(listener: () => void): void;
}

/** Takes its fields rather than the built `AppContext`: the send is built from
 *  it, and `AppContext.sendPrompt` comes from the send. */
export function createSubsessions({ chat, carry }: Pick<AppContext, "chat"> & { carry?: (child: string) => Promise<void> }): Subsessions {
	/** Each child's totals, as its pi last reported them. */
	const used = new Map<string, Usage>();
	const usageListeners: (() => void)[] = [];
	/** The children this window has met, whose runs settling it listens for. */
	const known = new Set<string>();

	const readUsage = async (child: string): Promise<void> => {
		const reply = await piSend(child, { type: "get_session_stats" }).catch(() => null);
		const stats = reply?.success === true ? (reply.data as StatsTotals | undefined) : undefined;
		if (!stats?.tokens) return;
		used.set(child, statsTotals(stats));
		for (const listener of usageListeners) listener();
	};

	void onPiEvent((from, event) => {
		if (event["type"] === "agent_settled" && known.has(from)) void readUsage(from);
	});

	const startSubsession = async (prompt: string, draft: string): Promise<void> => {
		const child = newSid();
		known.add(child);
		const view = serializeView("subsession", child, { sid: child, title: prompt.split("\n", 1)[0]!.slice(0, 80), prompt });
		chat.edit((md, parsed) => {
			const edit = subsessionInsert(md, parsed.segments, view, draft);
			return { changes: { from: edit.from, to: edit.to, insert: edit.insert }, caret: edit.caret };
		});
		setSubsessionStatus(child, "running");
		try {
			// The child's document starts as a file, its prompt in it, so its run
			// opens under that prompt and opening the card always finds it.
			const first = `${frontmatterFor(child)}${YOU_MARKER}\n\n${prompt}\n\n`;
			await docsWrite(child, first);
			await piStart(child);
			// On the parent's model and effort, before the child's first word.
			await carry?.(child);
			await followRun(child, first, { echoPending: true });
			const reply = await piSend(child, { type: "prompt", message: stamped(prompt) });
			if (reply?.success === false) setSubsessionStatus(child, "error");
		} catch {
			setSubsessionStatus(child, "error");
		}
	};

	/** The children a document holds: every subsession card names one. */
	const children = (md: string): string[] =>
		parseDocument(md)
			.segments.filter((seg) => seg.kind === "view" && seg.name === "subsession" && seg.id)
			.map((seg) => seg.id!);

	const refreshChild = async (child: string): Promise<void> => {
		known.add(child);
		try {
			await piStart(child);
			const state = await piSend(child, { type: "get_state" });
			void readUsage(child);
			if (state?.data?.["isStreaming"] === true) {
				setSubsessionStatus(child, "running");
				// Picked up where the run stands: what it saved so far, without the
				// empty prompt slot a save leaves below a run.
				const stored = (await docsRead(child)) ?? "";
				await followRun(child, stored.replace(new RegExp(`${YOU_MARKER}\\s*$`), ""), { echoPending: false });
			} else if (subsessionStatus(child) === "idle") setSubsessionStatus(child, "done");
		} catch {
			// A child pi that cannot start keeps its card idle: nothing ran.
		}
	};

	return {
		handlers: () => ({
			"subsession-open": ({ sid }) => void openDocument(sid).catch(() => {}),
			// No guard: stopping a child that is not running is a no-op for pi.
			"subsession-stop": ({ sid }) => void piSend(sid, { type: "abort" }).catch(() => {}),
		}),
		// In parallel: each child is a pi to start, and the parent's cards should
		// not wait on them end to end.
		refreshChildren: async (md) => {
			await Promise.all(children(md).map(refreshChild));
		},
		divert: (text) => {
			const invocation = childSessionInvocation(text);
			if (!invocation) return false;
			// An invocation with nothing after it is not a send to anyone.
			if (invocation.prompt) void startSubsession(invocation.prompt, invocation.draft);
			return true;
		},
		startSubsession,
		childTotals: () => {
			const counted = children(chat.getDocument()).flatMap((child) => used.get(child) ?? []);
			return counted.length ? counted.reduce(sumTotals) : null;
		},
		onChildUsage: (listener) => void usageListeners.push(listener),
	};
}
