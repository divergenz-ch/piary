// The source toggle (L2): what the button that flips a view or an artifact to
// its text says, and where the way back is — run `pnpm build` first.
//
// Each assertion was a user who thought they had deleted their work:
// a bare `⟨⟩` took a chart away and left raw fences with no word about getting
// it back, and on a terminal it left two empty fence lines, because a terminal
// keeps nothing in the document to show.
import assert from "node:assert/strict";
import test from "node:test";
import { registerLiveView } from "../../dist/document/live-views.js";
import { mount, onVirtualClock, settle, unmount } from "../helpers/editor.ts";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

onVirtualClock();

const VIEWED = '<!-- you -->\n\nlist them\n\n<!-- pi:view properties #t1 -->\n\n```json\n{\n  "rows": 3\n}\n```\n\n<!-- you -->\n\nnext';

const WITH_ARTIFACT = [
	"<!-- you -->", "", "draw me something", "",
	"<!-- pi -->", "", "here it is", "",
	"<!-- pi:artifact @demo -->", "",
	"<!-- pi:cell js #aa -->", "", "```js", "const n = 1", "```", "",
	"<!-- pi -->", "", "that is the answer", "",
	"<!-- you -->", "", "",
].join("\n");

registerLiveView("gone-probe", () => {
	const el = document.createElement("div");
	el.className = "gone-probe-panel";
	return { el, write() {}, settle() {}, dispose() {} };
});

const lines = (el: DocumentChat) => [...el.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "");
const toggles = (el: DocumentChat) => [...el.querySelectorAll<HTMLButtonElement>("button.doc-view-toggle")];

test("a view's toggle says what it shows, and its source says how to get the view back", async () => {
	const { el } = await mount(VIEWED);
	const [toggle] = toggles(el);
	assert.match(toggle.textContent ?? "", /source/, "the button names what a click shows");
	assert.match(toggle.title, /nothing is deleted/i, "and its tooltip says the view is not lost");
	toggle.click();
	await settle();
	assert.ok(lines(el).some((line) => line.includes('"rows"')), "the source is on the page");
	const [back] = toggles(el);
	assert.equal(back.textContent, "← Show result", "the way back is in words");
	assert.ok(back.classList.contains("doc-view-back"), "and stands out from the label it sits on");
	back.click();
	await settle();
	assert.equal(lines(el).some((line) => line.includes('"rows"')), false, "one click and the view is back");
	unmount(el);
});

test("an artifact's toggle says markdown, and every cell it lays bare offers the result back", async () => {
	const { el } = await mount(WITH_ARTIFACT);
	await settle(600); // the cell sync is debounced, and loads the engine
	const toggle = el.querySelector<HTMLButtonElement>("pi-artifact button.doc-view-toggle")!;
	assert.match(toggle.textContent ?? "", /markdown/, "not `source`: that is what the label beside it opens");
	assert.match(toggle.title, /nothing is deleted/i);
	toggle.click();
	await settle(80);
	assert.ok(lines(el).includes("const n = 1"), "the cells are plain fences");
	// In the flow: the frame's own element is parked, not gone, and keeps its button.
	const backs = toggles(el).filter((b) => b.closest(".cm-line"));
	assert.ok(backs.length > 0 && backs.every((b) => b.textContent === "← Show result"));
	backs.at(-1)!.click();
	await settle(80);
	assert.equal(lines(el).includes("const n = 1"), false, "and the frame is back");
	unmount(el);
});

test("an artifact laid bare names itself on its marker line, with the way back", async () => {
	const { el } = await mount(WITH_ARTIFACT);
	await settle(600);
	el.querySelector<HTMLButtonElement>("pi-artifact button.doc-view-toggle")!.click();
	await settle(80);
	const heads = [...el.querySelectorAll(".cm-line .doc-role")].map((head) => head.textContent ?? "");
	const marker = heads.find((text) => text.startsWith("artifact @demo"));
	assert.ok(marker, `the marker line reads as the artifact it opens, not a stray dot: ${JSON.stringify(heads)}`);
	assert.match(marker, /← Show result/, "and is the first place the way back stands");
	assert.equal(heads.some((text) => text.startsWith("·")), false, "no bare dot is left in the run");
	unmount(el);
});

test("a superseded definition laid bare offers the result back too", async () => {
	// The run of fences is often taller than the window, so any label may be the
	// only one in sight.
	const redefined = WITH_ARTIFACT.replace(
		"<!-- pi -->\n\nthat is the answer",
		"<!-- pi:artifact @demo -->\n\n<!-- pi:cell js #aa -->\n\n```js\nconst n = 2\n```\n\n<!-- pi -->\n\nthat is the answer",
	);
	const { el } = await mount(redefined);
	await settle(600);
	el.querySelector<HTMLButtonElement>("pi-artifact button.doc-view-toggle")!.click();
	await settle(80);
	assert.ok(lines(el).includes("const n = 1") && lines(el).includes("const n = 2"), "both definitions are on the page");
	const cellBacks = [...el.querySelectorAll(".cm-line .doc-role")].filter((head) => /^cell/.test(head.textContent ?? "") && /← Show result/.test(head.textContent ?? ""));
	assert.equal(cellBacks.length, 2, "and each carries the way back");
	unmount(el);
});

const LIVE = "<!-- you -->\n\nrun it\n\n<!-- pi:view gone-probe #g1 -->\n\n```\n```\n\n<!-- you -->\n\n";

test("a live view has no source toggle: its fence is empty, so there is nothing to show", async () => {
	const { el, view } = await mount(LIVE);
	el.openLiveView("gone-probe", "g1");
	await settle();
	assert.ok(el.querySelector(".gone-probe-panel"), "the panel is drawn");
	assert.equal(toggles(el).length, 0, "with no toggle on it");
	view.dispatch({ selection: { anchor: LIVE.indexOf("pi:view gone-probe") } });
	assert.equal(el.toggleSourceAtCaret(), false, "and the menu's Show Source leaves it alone");
	await settle();
	assert.ok(el.querySelector(".gone-probe-panel")?.isConnected, "the panel stays");
	unmount(el);
});

test("a live view with nothing behind it says one ran here, instead of two empty fences", async () => {
	const { el } = await mount(LIVE);
	const note = el.querySelector(".doc-view-gone");
	assert.ok(note, "the note stands where the panel was");
	assert.match(note.textContent ?? "", /ran here/);
	assert.match(note.textContent ?? "", /not kept, for security/);
	assert.equal(lines(el).some((line) => line.startsWith("```")), false, "no bare fence is left on the page");
	assert.ok(el.getDocument().includes("<!-- pi:view gone-probe #g1 -->"), "and the document's text is untouched");
	unmount(el);
});

test("when the command's output is a step of the document, the note points at it", async () => {
	const doc = `<!-- you -->\n\nrun it\n\n<!-- pi:tool bash #c1 -->\n\n\`\`\`json\n{"command":"ls"}\n\`\`\`\n\n<!-- pi:view gone-probe #c1 -->\n\n\`\`\`\n\`\`\`\n\n<!-- pi:result #c1 -->\n\n\`\`\`\na.txt\n\`\`\`\n\n<!-- you -->\n\n`;
	const { el } = await mount(doc);
	assert.match(el.querySelector(".doc-view-gone")?.textContent ?? "", /output step below/);
	const { el: alone } = await mount(LIVE);
	assert.doesNotMatch(alone.querySelector(".doc-view-gone")?.textContent ?? "", /output step below/, "and says no such thing when there is none");
	unmount(el);
	unmount(alone);
});
