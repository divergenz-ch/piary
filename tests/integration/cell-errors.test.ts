// What a cell that failed shows on the page: which cell it is, and the name
// its author gave it. The real <document-chat> under jsdom, the real engine.
// `pnpm build` first, then `node --test tests/integration/cell-errors.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { mount, settle, unmount } from "../helpers/editor.ts";
import { emptyDocument } from "../../dist/document/format.js";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

/** Long enough for the engine to load and run a cell. */
const BOUND_MS = 5_000;

type CellCall = { id: string; source: string; mode?: string; group?: string };

/** A turn writes `cells` as tool calls and finalizes the message. */
async function written(cells: CellCall[]): Promise<DocumentChat> {
	const { el } = await mount(emptyDocument("x"));
	el.streaming = true;
	await settle();
	el.beginTurn();
	const message: AssistantMessage = {
		role: "assistant",
		content: cells.map((cell) => ({ type: "toolCall" as const, id: `toolu_${cell.id}`, name: "cell", arguments: cell })),
		api: "",
		provider: "",
		model: "",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "toolUse",
		timestamp: 0,
	};
	el.applyAssistantPartial(message);
	el.finalizeAssistant(message);
	return el;
}

/** The cell's element once it has a verdict, laid out. */
async function settledCell(el: DocumentChat, id: string, verdict: string): Promise<HTMLElement> {
	assert.equal((await el.cellVerdict(id, BOUND_MS)).verdict, verdict, `#${id}`);
	await settle();
	const cell = el.cellEls.get(id);
	assert.ok(cell, `#${id} is on the page`);
	await cell.updateComplete;
	return cell;
}

test("a viewof cell that failed is named as its author named it", async () => {
	const el = await written([{ id: "pick", mode: "ojs", source: 'viewof quarter = ({}).select(["Q3"])' }]);
	const cell = await settledCell(el, "pick", "failed");
	const shown = cell.querySelector(".cell-output")?.textContent ?? "";
	assert.match(shown, /select is not a function/, "the error is on the page");
	assert.match(shown, /viewof quarter\b/, "under the name the source gives it");
	assert.ok(!shown.includes("viewof$"), `the transpiler's name for it is not shown: ${shown}`);
	unmount(el);
});

test("in an artifact of several cells, a failed one says which cell it is", async () => {
	const el = await written([
		{ id: "rows", group: "qc", source: "const rows = [1, 2]" },
		{ id: "chart", group: "qc", source: "({}).arc(rows)" },
		{ id: "table", group: "qc", source: "const = rows;" },
		{ id: "count", group: "qc", source: "rows.length" },
	]);
	const named = (cell: HTMLElement) => cell.querySelector(".cell-failed")?.textContent?.trim() ?? null;
	assert.equal(named(await settledCell(el, "chart", "failed")), "cell #chart", "a cell that threw");
	assert.equal(named(await settledCell(el, "table", "failed")), "cell #table", "a cell that does not compile");
	assert.equal(named(await settledCell(el, "count", "ok")), null, "a cell that ran says nothing");
	assert.equal(named(await settledCell(el, "rows", "ok")), null);
	unmount(el);
});

test("a cell alone in its artifact needs no name on its error", async () => {
	const el = await written([{ id: "solo", source: "({}).arc([1])" }]);
	const cell = await settledCell(el, "solo", "failed");
	assert.equal(cell.querySelector(".cell-failed"), null);
	unmount(el);
});
