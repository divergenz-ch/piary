// Headless editor harness: mounts the real <document-chat> under jsdom so the
// view layer can be tested at all.
//
// Everything except pixel geometry works — CodeMirror constructs, dispatches,
// applies decorations and renders .cm-line elements. `Window` is load-bearing:
// CodeMirror's measure pass reads it off the global and throws without it.
import { afterEach, beforeEach, mock } from "node:test";
import { setImmediate as realImmediate } from "node:timers/promises";
import { JSDOM } from "jsdom";
import type { EditorView } from "@codemirror/view";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

type Globals = Record<string, unknown>;

let booted: JSDOM["window"] | null = null;

/** Install a jsdom document as the global environment (once per process). */
export async function boot(): Promise<JSDOM["window"]> {
	if (booted) return booted;
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		pretendToBeVisual: true,
		url: "http://localhost/",
	});
	const w = dom.window;
	// The copy below is keyed by runtime name, so both sides are read as bags;
	// `w` itself stays jsdom's typed window for the prototype patches.
	const bag = w as unknown as Globals;
	const g = globalThis as unknown as Globals;
	g.window = w;
	for (const key of Object.getOwnPropertyNames(w)) {
		if (key in globalThis) continue;
		try {
			g[key] = bag[key];
		} catch {}
	}
	// Node defines its own Event/CustomEvent/EventTarget, so the loop above skips
	// them — and an event from the wrong realm is rejected by jsdom's
	// dispatchEvent. These must be jsdom's.
	for (const key of ["Window", "Event", "CustomEvent", "EventTarget", "DOMParser", "Blob", "File", "FormData"])
		if (bag[key]) g[key] = bag[key];
	// jsdom has no layout: CodeMirror measures text by asking a Range for its
	// client rects. Zeros are fine — nothing here asserts on pixels.
	const ZERO = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
	const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
	for (const proto of [w.Range.prototype, w.Element.prototype] as Array<Range | Element>) {
		proto.getClientRects ??= noRects;
		proto.getBoundingClientRect ??= function () {
			return { ...ZERO, toJSON: () => ZERO };
		};
	}
	w.Range.prototype.getClientRects = noRects;
	await import("../../dist/components/DocumentChat.js");
	booted = w;
	return w;
}

/** Whether `settle` advances the virtual clock rather than waiting (see `virtualClock`). */
let virtual = false;

/** How far one step of the virtual clock goes before promise continuations run. */
const VIRTUAL_STEP_MS = 5;

/** One frame, as jsdom's `pretendToBeVisual` paces them. */
const FRAME_MS = 1000 / 60;

/**
 * Put the canvas's timers on a virtual clock until the returned function is
 * called: `setTimeout` and `Date` are mocked, and `requestAnimationFrame` is a
 * frame-paced `setTimeout` for the duration. `settle(ms)` then advances the
 * clock by `ms` instead of waiting. Time is the only thing virtualised — the
 * editor, the bridge and pi are still real (ADR 0006).
 *
 * `setInterval` is deliberately left real. jsdom runs its frames on one
 * interval it starts when the first callback is queued and stops when the last
 * is run; a mocked interval discarded with callbacks still queued leaves jsdom
 * believing it is running, and no frame fires again in the process. The shim
 * keeps jsdom's own scheduler out of the virtual clock entirely.
 *
 * Only for a test whose waits are the component's own timers. Real
 * asynchronous work that is not promise-chained — the notebook engine's first
 * load — does not advance with the clock.
 */
export async function virtualClock(): Promise<() => void> {
	const w = (await boot()) as unknown as Globals;
	const g = globalThis as unknown as Globals;
	const frames = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
	mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
	const raf = (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), FRAME_MS) as unknown as number;
	const caf = (handle: number) => clearTimeout(handle);
	g.requestAnimationFrame = w.requestAnimationFrame = raf;
	g.cancelAnimationFrame = w.cancelAnimationFrame = caf;
	virtual = true;
	return () => {
		virtual = false;
		mock.timers.reset();
		g.requestAnimationFrame = w.requestAnimationFrame = frames.raf;
		g.cancelAnimationFrame = w.cancelAnimationFrame = frames.caf;
	};
}

/** Runs every test in the calling file on the virtual clock: one per test,
 *  stopped after it, so a failing test cannot leave the next on a mocked clock. */
export function onVirtualClock(): void {
	let stop: (() => void) | undefined;
	beforeEach(async () => {
		stop = await virtualClock();
	});
	afterEach(() => {
		stop?.();
		stop = undefined;
	});
}

/** Lets promise continuations run, without going through a mocked timer. */
async function flush(): Promise<void> {
	for (let i = 0; i < 4; i++) await realImmediate();
}

/** Let queued microtasks, rAF callbacks and CodeMirror's measure pass settle —
 *  on the virtual clock when one is running, in steps, so a timer that a
 *  continuation arms inside the window still comes due within it. */
export const settle = async (ms = 20): Promise<void> => {
	if (!virtual) {
		await new Promise((r) => setTimeout(r, ms));
		return;
	}
	await flush();
	for (let left = ms; left > 0; left -= VIRTUAL_STEP_MS) {
		mock.timers.tick(Math.min(VIRTUAL_STEP_MS, left));
		await flush();
	}
};

/** Mount a <document-chat> holding `md`. Returns the element and its EditorView
 *  (a declared harness seam, not a reach through TS's erased `private` — ADR 0008). */
export async function mount(md: string): Promise<{ el: DocumentChat; view: EditorView }> {
	await boot();
	const el = document.createElement("document-chat") as DocumentChat;
	document.body.append(el);
	await settle();
	el.setDocument(md);
	await settle();
	if (!el.view) throw new Error("mount: <document-chat> came up without an EditorView");
	return { el, view: el.view };
}

export function unmount(el: DocumentChat): void {
	el.remove();
}
