// The lock on a cell the run is working on (ADR 0054, `notebook-cells.md`
// §Policy): the rendered artifact takes no interaction while its chip is
// `working` and the turn runs, whatever the host says of the wash. The real
// <document-chat> under jsdom, which knows the `inert` attribute and none of
// its behaviour: what a locked artifact refuses is the page spec's to show
// (`e2e/flows.spec.ts`). `pnpm build` first, then
// `node --test tests/integration/cell-lock.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, settle, unmount } from "../helpers/editor.ts";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";
import type { PiArtifact } from "../../dist/components/ArtifactBlock.js";
import { cellsFrom } from "../../dist/document/cells.js";
import { parseDocument } from "../../dist/document/format.js";

const cell = (id: string, source: string) => ["<!-- pi -->", "", `<!-- pi:cell js #${id} -->`, "", "```js", source, "```", ""];
/** Two answers, a cell in each: two artifacts. */
const PAGE = ["<!-- you -->", "", "make a chart", "", ...cell("bx", "1 + 1"), "<!-- pi -->", "", "Done.", "", "<!-- you -->", "", "and another", "", ...cell("by", "2 + 2"), "<!-- you -->", "", ""].join("\n");

/** Everything of an artifact but its chip. */
const PARTS = [".artifact-output", ".artifact-source-head"];

const artifactOf = (el: DocumentChat, id: string) => {
	const frame = [...el.querySelectorAll<PiArtifact>("pi-artifact")].find((a) => a.members.some((m) => m.id === id));
	assert.ok(frame, `an artifact holding #${id}`);
	return frame;
};
const locked = (frame: HTMLElement) => {
	const states = PARTS.map((part) => frame.querySelector(part)!.hasAttribute("inert"));
	assert.equal(new Set(states).size, 1, "every part is locked, or none");
	return states[0]!;
};

/** Long enough for the engine to load and both artifacts to be drawn. */
const DRAWN_MS = 300;

/** A mounted page whose turn is running. */
async function running() {
	const { el, view } = await mount(PAGE);
	await settle(DRAWN_MS);
	el.streaming = true;
	await settle();
	return { el, view, bx: artifactOf(el, "bx"), by: artifactOf(el, "by") };
}

test("the artifact a run is working on is locked, its chip is not, and no other tone locks", async () => {
	const { el, bx, by } = await running();
	assert.equal(locked(bx), false, "a run that has touched no cell locks nothing");
	el.showCellActivity({ id: "bx", tone: "working", text: "writing" });
	await settle();
	assert.equal(locked(bx), true);
	assert.equal(locked(by), false, "the lock is that cell's artifact's alone");
	const chip = bx.querySelector(".artifact-activity");
	assert.ok(chip, "the chip is there");
	assert.equal(chip.closest("[inert]"), null, "and stays readable");
	for (const tone of ["done", "warning", "error"] as const) {
		el.showCellActivity({ id: "bx", tone, text: "ran" });
		await settle();
		assert.equal(locked(bx), false, tone);
	}
	el.showCellActivity({ id: "bx", tone: "working", text: "fixing (2/3)" });
	await settle();
	assert.equal(locked(bx), true, "a second attempt locks it again");
	el.showCellActivity(null);
	await settle();
	assert.equal(locked(bx), false, "no chip, no lock");
	unmount(el);
});

test("the lock does not wait on the wash: with the pulse off the artifact is still locked", async () => {
	const { el, bx } = await running();
	el.showCellActivity({ id: "bx", tone: "working", text: "writing", pulse: false });
	await settle();
	assert.equal(locked(bx), true);
	assert.equal(bx.querySelector(".artifact")!.hasAttribute("data-pulse"), false, "and nothing washes over it");
	el.showCellActivity({ id: "bx", tone: "working", text: "writing", pulse: true });
	await settle();
	assert.equal(locked(bx), true);
	assert.equal(bx.querySelector(".artifact")!.hasAttribute("data-pulse"), true);
	unmount(el);
});

test("a run that moves on to a cell in another artifact unlocks the one it left", async () => {
	const { el, bx, by } = await running();
	el.showCellActivity({ id: "bx", tone: "working", text: "ran" });
	await settle();
	el.showCellActivity({ id: "by", tone: "working", text: "writing" });
	await settle();
	assert.equal(locked(bx), false);
	assert.equal(locked(by), true);
	unmount(el);
});

test("no lock outlives the turn: one whose chip was never taken back opens when the turn ends", async () => {
	const { el, bx } = await running();
	el.showCellActivity({ id: "bx", tone: "working", text: "writing" });
	await settle();
	assert.equal(locked(bx), true);
	el.streaming = false;
	await settle();
	assert.equal(locked(bx), false);
	unmount(el);
});

test("the source pane of a locked artifact is locked with it, and the document's own text is not", async () => {
	const { el, view, bx } = await running();
	bx.querySelector<HTMLElement>(".doc-role-menu")!.click();
	await settle(100);
	assert.ok(bx.querySelector(".artifact-code"), "the source is open");
	el.showCellActivity({ id: "bx", tone: "working", text: "writing" });
	await settle();
	assert.equal(locked(bx), true);
	assert.equal(bx.querySelector(".artifact-code")!.hasAttribute("inert"), true);
	assert.equal(view.contentDOM.closest("[inert]"), null, "the editor over the markdown is outside the lock");
	const before = el.getDocument();
	view.dispatch({ changes: { from: before.indexOf("make a chart"), insert: "please " } });
	assert.ok(el.getDocument().includes("please make a chart"), "and the prose above takes an edit");
	unmount(el);
});

test("focus held inside an artifact goes to the document when the lock takes it, so Escape still reaches the run", async () => {
	const { el, view, bx } = await running();
	const button = bx.querySelector<HTMLButtonElement>(".artifact-change")!;
	button.disabled = false;
	button.focus();
	assert.equal(document.activeElement, button);
	el.showCellActivity({ id: "bx", tone: "working", text: "writing" });
	await settle();
	assert.equal(view.hasFocus, true);
	unmount(el);
});

test("a lock that lands on a source pane being typed in hands its focus to the document too, and the buffer outlasts it: Apply writes it once the run is over", async () => {
	const { el, view, bx } = await running();
	bx.querySelector<HTMLElement>(".doc-role-menu")!.click();
	await settle(100);
	bx.querySelector<HTMLElement>(".artifact-edit")!.click();
	await settle(40);
	const pane = bx.members.find((m) => m.id === "bx")!.editor!.view;
	pane.focus();
	pane.dispatch({ changes: { from: pane.state.doc.length, insert: " + 40" } });
	await settle(40);
	assert.ok(bx.dirty.has("bx"), "the buffer is dirty");
	const before = el.getDocument();

	el.showCellActivity({ id: "bx", tone: "working", text: "writing" });
	await settle();
	assert.equal(locked(bx), true);
	assert.equal(view.hasFocus, true, "the document has the focus, so Escape reaches the run");
	assert.equal(el.getDocument(), before);

	el.showCellActivity({ id: "bx", tone: "done", text: "ran" });
	el.streaming = false;
	await settle(40);
	assert.equal(locked(bx), false);
	assert.equal(bx.editing, true, "still in edit mode");
	assert.equal(pane.state.doc.toString(), "1 + 1 + 40", "with what was typed");
	bx.querySelector<HTMLElement>(".artifact-apply")!.click();
	await settle(500);
	const md = el.getDocument();
	assert.equal(cellsFrom(md, parseDocument(md).segments).findLast((c) => c.id === "bx")?.source, "1 + 1 + 40");
	unmount(el);
});
