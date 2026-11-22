// The pi extension's two copies of document-layer facts, held to the originals.
//
// `pi-extension/cell.ts` is a separate package typechecked inside pi's image, so
// it cannot import `src/document/*` and keeps its own `CELL_MODES` and
// `shortCellId` — each commented "the two must agree". If the modes drift, the
// tool refuses a mode the document runs, or offers one it does not; if the id
// drifts, the agent is told `ok — cell #abc` for a cell the document wrote as
// `#xyz`, and every failure report names a cell it cannot find. The extension
// cannot be imported here (its `typebox` resolves only inside pi's image), so
// this reads its source: the modes as data, the id function by behaviour.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CELL_MODES } from "../../dist/document/cells.js";
import { shortCellId } from "../../dist/document/format.js";

const extension = readFileSync(new URL("../../pi-extension/cell.ts", import.meta.url), "utf8");

test("the cell tool offers exactly the modes the document runs", () => {
	const copy = /const CELL_MODES = \[([^\]]*)\] as const;/.exec(extension);
	assert.ok(copy, "pi-extension/cell.ts no longer declares CELL_MODES as a literal list");
	const modes = [...copy[1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
	assert.deepEqual(modes, [...CELL_MODES], "pi-extension/cell.ts CELL_MODES has drifted from src/document/cells.ts");
});

test("the id the agent is told is the id the document writes", () => {
	const body = /function shortCellId\(toolCallId: string\): string \{([\s\S]*?)\n\}/.exec(extension);
	assert.ok(body, "pi-extension/cell.ts no longer declares shortCellId(toolCallId: string): string");
	const copy = new Function("toolCallId", body[1]!) as (toolCallId: string) => string;
	for (const id of ["toolu_01ABCdef234567", "call_abc", "a.b-c/d_e!f", "x", "", "!!!", "toolu-ab_cd-ef_gh"]) {
		assert.equal(copy(id), shortCellId(id), `for ${JSON.stringify(id)}, the extension says #${copy(id)} and the document #${shortCellId(id)}`);
	}
});

test("the cell tool asks under the title the page answers", async () => {
	const { VERDICT_REQUEST } = await import("../../app/cell-verdicts.ts");
	const copy = /const VERDICT_REQUEST = "([^"]+)";/.exec(extension);
	assert.ok(copy, "pi-extension/cell.ts no longer declares VERDICT_REQUEST as a literal");
	assert.equal(copy[1], VERDICT_REQUEST, "pi-extension/cell.ts and app/cell-verdicts.ts ask and answer different questions");
});

test("the canvas_edit tool asks under the title the page answers", async () => {
	const { EDIT_REQUEST } = await import("../../app/canvas-edits.ts");
	const source = readFileSync(new URL("../../pi-extension/canvas-edit.ts", import.meta.url), "utf8");
	const copy = /const EDIT_REQUEST = "([^"]+)";/.exec(source);
	assert.ok(copy, "pi-extension/canvas-edit.ts no longer declares EDIT_REQUEST as a literal");
	assert.equal(copy[1], EDIT_REQUEST, "pi-extension/canvas-edit.ts and app/canvas-edits.ts ask and answer different questions");
});

test("the login command asks and reports under the titles the page reads", async () => {
	const { LOGIN_NOTE, LOGIN_REQUEST } = await import("../../app/login-flow.ts");
	const source = readFileSync(new URL("../../pi-extension/login.ts", import.meta.url), "utf8");
	assert.equal(/const LOGIN_REQUEST = "([^"]+)";/.exec(source)?.[1], LOGIN_REQUEST, "pi-extension/login.ts and app/login-flow.ts disagree on the dialog title");
	assert.equal(/const LOGIN_NOTE = "([^"]+)";/.exec(source)?.[1], LOGIN_NOTE, "pi-extension/login.ts and app/login-flow.ts disagree on the notice prefix");
});
