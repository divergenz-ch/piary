// What the app page does with each event the canvas raises (src/canvas/events.ts).
//
// The page answers through one table, typed so that the compiler holds it
// complete: every event is either handled, owed — not carried by the app yet,
// with the issue that ports it — or declined by a decision on record. An event
// the page forgets is a type error rather than a gesture that silently does
// nothing, and an owed event given a handler is one too, so the lists below
// cannot claim a gap that is closed.
//
// `OWED` is a debt with a number on it: `tests/contract/canvas-events.test.ts` holds its
// length to a baseline that only goes down, the same ratchet as
// `scripts/verify-hygiene.ts`. A port moves its event out of `OWED` and lowers
// the baseline in the same commit.

import { CanvasEvent, type CanvasEventDetail, type CanvasEventName } from "../src/canvas/events.ts";

/** Events the app does not carry yet. Each one's port lands with its tests. */
export const OWED = [] as const satisfies readonly CanvasEventName[];

/** Events the app deliberately never answers. */
export const DECLINED = ["doc-draft"] as const satisfies readonly CanvasEventName[];

/** Not carried yet: `owed` names the issue that ports it. */
export type NotCarried = { owed: string };
/** Never carried: `declined` cites the decision. */
export type Declined = { declined: string };

type Handler<K extends CanvasEventName> = (detail: CanvasEventDetail[K]) => void;

export type HostTable = {
	[K in CanvasEventName]: K extends (typeof OWED)[number]
		? NotCarried
		: K extends (typeof DECLINED)[number]
			? Declined
			: Handler<K>;
};

/** The slice of the table one module answers (ADR 0024). */
export type HostFragment<K extends CanvasEventName> = Pick<HostTable, K>;

/** The fragments' types, joined: complete only if together they answer every event. */
type Joined<F extends readonly unknown[]> = F extends readonly [infer Head, ...infer Rest] ? Head & Joined<Rest> : unknown;

/**
 * Joins the modules' fragments into the page's table.
 *
 * The result's type is every fragment's at once, so handing it to
 * `answerCanvas` is a type error unless together they answer every event —
 * the completeness a single table had. Object spread would let a second
 * fragment silently replace a first's handler, so an event answered twice is
 * refused here, when the page boots.
 */
export function composeHost<const F extends readonly Partial<HostTable>[]>(...fragments: F): Joined<F> {
	const seen = new Set<string>();
	for (const fragment of fragments) {
		for (const name of Object.keys(fragment)) {
			if (seen.has(name)) throw new Error(`"${name}" is answered by two fragments of the app's event table`);
			seen.add(name);
		}
	}
	return Object.assign({}, ...fragments);
}

/** The events the app does not answer: owed, with the issue that ports each,
 *  or declined, with the decision. */
export const notCarried: HostFragment<(typeof OWED)[number] | (typeof DECLINED)[number]> = {
	"doc-draft": { declined: "ADR 0018: the native store keeps no draft" },
};

/**
 * Subscribes the page to every event its table has a handler for. Owed and
 * declined events get no listener and no UI: a gap is closed by porting the
 * feature, not by announcing it.
 *
 * The listener sits on the element itself, which also catches `doc-stop` — the
 * one event the canvas dispatches bubbling but not composed.
 */
export function answerCanvas(chat: HTMLElement, table: HostTable): void {
	for (const name of Object.values(CanvasEvent)) {
		const entry = table[name];
		if (typeof entry !== "function") continue;
		// `name` is the whole union here, so the compiler cannot pair this entry
		// with its own detail type; `HostTable` already did, per key.
		const handle = entry as (detail: unknown) => void;
		chat.addEventListener(name, (event) => handle((event as CustomEvent).detail));
	}
}
