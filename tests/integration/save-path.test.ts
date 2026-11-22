// The canvas's half of the save path — run `pnpm build` first.
//
// ADR 0018 §2: a debounced save must not be starvable by a non-user writer. The
// canvas raises `doc-change` once the document has been still for a debounce,
// and a streaming turn is never still: every chunk is a transaction. So the
// property that must hold is a DEADLINE — a save deferred past a bound happens
// anyway, mid-stream — and the shape that must not come back is the one where a
// whole turn reaches the file only once the stream stops, or never, if the app
// goes away first.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, onVirtualClock, settle, unmount } from "../helpers/editor.ts";
import { emptyDocument } from "../../dist/document/format.js";
import type { AssistantMessage } from "@earendil-works/pi-ai";

// On the virtual clock (helpers/editor.ts), `Date` included — which is what the
// save deadline reads — so the stream below takes seconds of virtual time and
// none of real time.
onVirtualClock();

const BASE = emptyDocument("x");

/** A mid-stream partial: content is the only field the canvas reads. */
const assistant = (text: string): AssistantMessage => ({
	role: "assistant",
	content: [{ type: "text", text }],
	api: "",
	provider: "",
	model: "",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop",
	timestamp: 0,
});

/** Faster than the 500 ms save debounce, which is the whole condition: a chunk
 *  this often re-arms the debounce before it can ever come due. */
const CHUNK_EVERY_MS = 100;
/** Long enough to cover several debounce windows and the deadline with room to
 *  spare, so the assertion is about a save happening at all, not about timing. */
const STREAM_FOR_MS = 3_000;

test("a turn streaming faster than the debounce is still saved while it streams", async () => {
	const { el } = await mount(`${BASE}what now\n`);
	const saved: string[] = [];
	el.addEventListener("doc-change", (event) => saved.push((event as CustomEvent<{ value: string }>).detail.value));
	el.streaming = true;
	el.beginTurn();
	await settle();

	let answer = "";
	for (let elapsed = 0; elapsed < STREAM_FOR_MS; elapsed += CHUNK_EVERY_MS) {
		answer += "word ";
		el.applyAssistantPartial(assistant(answer));
		await settle(CHUNK_EVERY_MS);
	}
	// Read BEFORE the turn ends: ending it is a pause, and a pause lets the
	// debounce through — which is exactly what a stream never gives it.
	const midStream = [...saved];
	el.streaming = false;
	el.endTurn();
	unmount(el);

	assert.ok(midStream.length > 0, "no save reached the host while the answer streamed");
	assert.ok(
		midStream.some((value) => value.includes("word word")),
		"a mid-stream save carries the answer so far, not only the prompt",
	);
});

test("typing that pauses still saves once per pause, not once per keystroke", async () => {
	// The control: the deadline bounds how long a save may wait, it does not
	// turn the debounce into a timer that fires on its own. A short burst of
	// typing followed by a pause is one save.
	const { el, view } = await mount(`${BASE}what now\n`);
	const saved: string[] = [];
	el.addEventListener("doc-change", (event) => saved.push((event as CustomEvent<{ value: string }>).detail.value));
	for (const ch of "abc") {
		view.dispatch({ changes: { from: view.state.doc.length, insert: ch }, userEvent: "input.type" });
		await settle(30);
	}
	await settle(900);
	unmount(el);
	assert.equal(saved.length, 1, "a pause after a burst of typing is one save");
	assert.ok(saved[0]!.includes("abc"), "the save carries the typing");
});
