// What a canvas edit shows of itself (ADR 0067): the changed text is lit, then
// fades; one that landed out of view waits behind a link that goes to it; and
// none of it is document text. The real <document-chat> under jsdom, which has
// no layout: a scroller with no height has nothing out of view, so the in-view
// tests run as they are, and the out-of-view ones give the scroller a rectangle
// the edit is outside of. Real scrolling is the page spec's to show
// (`e2e/flows.spec.ts`). `pnpm build` first, then
// `node --test tests/integration/edit-highlight.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { EditorView } from "@codemirror/view";
import { mount, onVirtualClock, settle, unmount } from "../helpers/editor.ts";
import { EDIT_LIT_MS, sightOf } from "../../dist/components/edit-highlight.js";

onVirtualClock();

const PAGE = "<!-- you -->\n\n# Teh plan\n\nShip on Friday.\n\n<!-- pi -->\n\nFriday works.\n\n<!-- you -->\n\n";

const lit = (el: HTMLElement) => [...el.querySelectorAll(".doc-edit-lit")].map((mark) => mark.textContent).join("");
const litLines = (el: HTMLElement) => [...el.querySelectorAll(".cm-line.doc-edit-lit-line")].map((line) => line.textContent ?? "");
const jump = (el: HTMLElement, side: "above" | "below") => {
	const link = el.querySelector<HTMLElement>(`.doc-edit-jump-${side}`);
	assert.ok(link, `the ${side} link exists`);
	return link;
};

/** Gives the scroller a window onto the document that starts `top` pixels down
 *  it, so what is drawn above that is out of view. */
function scrolledTo(view: EditorView, top: number): void {
	const rect = { top, bottom: top + 100, left: 0, right: 600, width: 600, height: 100, x: 0, y: top };
	view.scrollDOM.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect });
}

test("where a line is, against what the scroller shows", () => {
	assert.equal(sightOf(10, 30, 0, 100), "in");
	assert.equal(sightOf(-40, -20, 0, 100), "above");
	assert.equal(sightOf(120, 140, 0, 100), "below");
	assert.equal(sightOf(-10, 12, 0, 100), "in", "a line half in view is in view");
	assert.equal(sightOf(0, 20, 0, 0), "in", "a scroller with no height hides nothing");
});

test("an edit in view is lit on the changed text, then fades, and the document holds only the edit", async () => {
	const { el } = await mount(PAGE);
	assert.deepEqual(el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" }), { ok: true });
	await settle(50);
	assert.match(lit(el), /The plan/);
	assert.equal(jump(el, "above").hidden, true, "nothing to go to");
	assert.equal(el.getDocument(), PAGE.replace("Teh", "The"));
	await settle(EDIT_LIT_MS + 50);
	assert.equal(lit(el), "");
	assert.equal(el.getDocument(), PAGE.replace("Teh", "The"));
	unmount(el);
});

test("an edit that only removes text lights the line it was taken from", async () => {
	const { el } = await mount(PAGE);
	assert.deepEqual(el.applyCanvasEdit({ oldText: "Ship on Friday.", newText: "Ship." }), { ok: true });
	await settle(50);
	assert.deepEqual(litLines(el), [], "new text is lit as text, not as a line");
	assert.deepEqual(el.applyCanvasEdit({ oldText: " works", newText: "" }), { ok: true });
	await settle(50);
	assert.deepEqual(litLines(el), ["Friday."]);
	await settle(EDIT_LIT_MS + 50);
	assert.deepEqual(litLines(el), []);
	unmount(el);
});

test("an edit that removes a block lights the line the block stood above (ADR 0065)", async () => {
	const { el } = await mount(PAGE.replace(/\n\n$/, "\n\nand then?\n"));
	assert.deepEqual(el.applyCanvasEdit({ oldText: "Friday works.", newText: "" }), { ok: true });
	await settle(50);
	assert.doesNotMatch(el.getDocument(), /<!-- pi -->/);
	assert.equal(lit(el), "", "glue between blocks is not text to light");
	assert.equal(litLines(el).length, 1);
	unmount(el);
});

test("a refused edit lights nothing", async () => {
	const { el } = await mount(PAGE);
	assert.equal(el.applyCanvasEdit({ oldText: "# Tah plan", newText: "# The plan" }).ok, false);
	await settle(50);
	assert.equal(lit(el), "");
	assert.equal(jump(el, "above").hidden, true);
	unmount(el);
});

test("an edit out of view waits behind a link, and one click goes to it and lights it", async () => {
	const { el, view } = await mount(PAGE);
	scrolledTo(view, 5000);
	assert.deepEqual(el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" }), { ok: true });
	await settle(50);
	assert.equal(lit(el), "", "nothing is lit where nobody is looking");
	const link = jump(el, "above");
	assert.equal(link.hidden, false);
	assert.equal(link.textContent, "changed above ↑");
	assert.equal(jump(el, "below").hidden, true);
	assert.equal(el.getDocument(), PAGE.replace("Teh", "The"), "the link is no document text");
	// It waits: the fade's time passing does not spend it.
	await settle(EDIT_LIT_MS + 50);
	assert.equal(link.hidden, false);
	const caret = view.state.selection.main.head;
	link.click();
	await settle(50);
	assert.match(lit(el), /The plan/);
	assert.equal(link.hidden, true);
	assert.equal(view.state.selection.main.head, caret, "the caret says which prompt is meant, and stays");
	await settle(EDIT_LIT_MS + 50);
	assert.equal(lit(el), "");
	unmount(el);
});

test("two edits out of view are counted, and scrolling to them is seeing them", async () => {
	const { el, view } = await mount(PAGE);
	scrolledTo(view, 5000);
	el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" });
	el.applyCanvasEdit({ oldText: "Friday works.", newText: "Friday is fine." });
	await settle(50);
	assert.equal(jump(el, "above").textContent, "2 changes above ↑");
	scrolledTo(view, 0);
	view.scrollDOM.dispatchEvent(new Event("scroll"));
	await settle(50);
	assert.equal(jump(el, "above").hidden, true);
	assert.match(lit(el), /The plan/);
	assert.match(lit(el), /Friday is fine\./);
	unmount(el);
});

test("an edit the user took back is not offered, and the next turn starts with none", async () => {
	const { el, view } = await mount(PAGE);
	scrolledTo(view, 5000);
	el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" });
	await settle(50);
	assert.equal(jump(el, "above").hidden, false);
	const { undo } = await import("@codemirror/commands");
	undo(view);
	await settle(50);
	assert.equal(el.getDocument(), PAGE);
	assert.equal(jump(el, "above").hidden, true);

	el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" });
	await settle(50);
	assert.equal(jump(el, "above").hidden, false);
	el.beginTurn();
	await settle(50);
	assert.equal(jump(el, "above").hidden, true, "a link is about the run that made the edit");
	unmount(el);
});

test("another document opened in the window is shown none of this one's changes", async () => {
	const { el, view } = await mount(PAGE);
	scrolledTo(view, 5000);
	el.applyCanvasEdit({ oldText: " works", newText: "" });
	el.applyCanvasEdit({ oldText: "# Teh plan", newText: "# The plan" });
	await settle(50);
	assert.equal(jump(el, "above").hidden, false);
	scrolledTo(view, 0);
	el.setDocument("<!-- you -->\n\nAnother conversation.\n\n<!-- you -->\n\n");
	await settle(50);
	for (const side of ["above", "below"] as const) assert.equal(jump(el, side).hidden, true, side);
	assert.equal(lit(el), "");
	assert.deepEqual(litLines(el), []);
	unmount(el);
});
