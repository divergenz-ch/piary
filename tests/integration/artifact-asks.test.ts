// Fix and change…: asking pi about an artifact from its own header, through a
// prompt on the page (ADR 0005, ADR 0031). The real <document-chat> under
// jsdom. `pnpm build` first, then
// `node --test tests/integration/artifact-asks.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, settle, unmount } from "../helpers/editor.ts";
import { parseDocument } from "../../dist/document/format.js";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

/** Long enough for the engine to load and the cell to reject. */
const RUN_MS = 1_500;

const page = (source: string) =>
	[
		"<!-- you -->",
		"",
		"make a chart",
		"",
		"<!-- pi -->",
		"",
		"<!-- pi:cell js #bx -->",
		"",
		"```js",
		source,
		"```",
		"",
		"<!-- pi -->",
		"",
		"Done.",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");

const button = (el: DocumentChat, cls: string) => el.querySelector<HTMLButtonElement>(`pi-artifact .${cls}`);

test("fix sends the failing cell and its error as a prompt under the artifact", async () => {
	const { el } = await mount(page('throw new Error("boom")'));
	await settle(RUN_MS);
	const sent: { text: string; at: number }[] = [];
	el.addEventListener("doc-send", (e) => sent.push((e as CustomEvent<{ text: string; at: number }>).detail));
	const fix = button(el, "artifact-fix");
	assert.ok(fix, "a failing artifact offers fix");
	fix.click();
	await settle();
	assert.equal(sent.length, 1);
	assert.match(sent[0]!.text, /^Fix cell #bx — .*boom/);
	// The prompt is on the page, a user block below the artifact.
	const md = el.getDocument();
	const asked = md.indexOf("Fix cell #bx");
	assert.ok(asked > md.indexOf("<!-- pi:cell js #bx -->"), md);
	const seg = parseDocument(md).segments.find((s) => s.text.startsWith("Fix cell #bx"));
	assert.equal(seg?.kind, "user", md);
	unmount(el);
});

test("a clean artifact offers change but not fix", async () => {
	const { el } = await mount(page("1 + 1"));
	await settle(RUN_MS);
	assert.equal(button(el, "artifact-fix"), null);
	assert.ok(button(el, "artifact-change"));
	unmount(el);
});

test("change opens a prompt under the artifact, scoped to it, and waits for the writer", async () => {
	const { el, view } = await mount(page("1 + 1"));
	await settle(RUN_MS);
	const sent: unknown[] = [];
	el.addEventListener("doc-send", (e) => sent.push(e));
	button(el, "artifact-change")!.click();
	await settle();
	assert.deepEqual(sent, [], "nothing is sent until the writer sends it");
	const md = el.getDocument();
	const caret = view.state.selection.main.head;
	const segments = parseDocument(md).segments;
	const at = segments.find((s) => caret >= s.from && caret <= s.to);
	assert.equal(at?.kind, "user", "the caret is in a prompt");
	assert.match(at!.text, /edit by id/, "scoped to the artifact");
	assert.ok(at!.from > md.indexOf("<!-- pi:cell js #bx -->"), "below the artifact");
	unmount(el);
});

test("while a turn runs, both asks are dead", async () => {
	const { el } = await mount(page('throw new Error("boom")'));
	await settle(RUN_MS);
	el.streaming = true;
	await settle();
	assert.equal(button(el, "artifact-fix")?.disabled, true);
	assert.equal(button(el, "artifact-change")?.disabled, true);
	unmount(el);
});
