// The `a2ui` view in the real canvas: a `pi:view a2ui` block renders its A2UI
// surface in place of marker and fence, under an element carrying
// `data-answer-ui`; a payload the catalog refuses shows why, under
// `data-answer-ui-error`; a call the tool refused is a quiet line, not an error
// in the answer; a call still streaming is not judged until its message is
// whole; and a block that leaves the document takes its surface with it.
//
// The surface's components render into their own shadow roots, so what a user
// reads is gathered across them.
import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { emptyDocument } from "../../dist/document/format.js";
import { mount, settle, unmount } from "../helpers/editor.ts";

/** Every text under `root`, shadow roots included, whitespace-collapsed. */
function visibleText(root: Node): string {
	const parts: string[] = [];
	const walk = (node: Node) => {
		if (node.nodeType === node.TEXT_NODE) parts.push(node.textContent ?? "");
		const shadow = (node as Element).shadowRoot;
		if (shadow) walk(shadow);
		for (const child of Array.from(node.childNodes)) walk(child);
	};
	walk(root);
	return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The first element matching `selector` under `root`, shadow roots included. */
function deepQuery(root: Element | ShadowRoot, selector: string): Element | null {
	const here = root.querySelector(selector);
	if (here) return here;
	for (const el of Array.from(root.querySelectorAll("*"))) {
		const found = el.shadowRoot && deepQuery(el.shadowRoot, selector);
		if (found) return found;
	}
	return null;
}

/** Settles until `ready` holds: the renderer loads on first connect, and a
 *  child resolves an update after its parent, markdown a microtask after that. */
async function until(ready: () => boolean, what: string): Promise<void> {
	for (let i = 0; i < 100 && !ready(); i++) await settle(20);
	assert.ok(ready(), `timed out waiting for ${what}`);
}

const block = (data: unknown, id = "toolu_a2") => `<!-- pi:view a2ui #${id} -->\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;

const DOC = (...blocks: string[]) => `<!-- you -->\n\nhow is support doing?\n\n<!-- pi -->\n\nHere it is.\n\n${blocks.join("\n\n")}\n\n<!-- you -->\n\n`;

const KPIS = {
	components: [
		{ id: "root", component: "Card", child: "body" },
		{ id: "body", component: "Column", children: ["title", "open", "note"] },
		{ id: "title", component: "Text", text: "## Support this week" },
		{ id: "open", component: "Text", text: { "@call": "formatString", args: { value: "${/open} tickets open" } } },
		{ id: "note", component: "Text", variant: "caption", text: "Down from 58." },
	],
	dataModel: { open: 42 },
};

test("a valid a2ui block renders its surface in place of the fence, marked as answer UI", async () => {
	const { el } = await mount(DOC(block(KPIS)));
	try {
		const host = () => el.querySelector("[data-answer-ui]");
		await until(() => /Down from 58/.test(visibleText(host() ?? el.ownerDocument.createElement("i"))), "the surface");
		const root = host()!;
		assert.match(root.closest(".doc-view")?.querySelector(".doc-role")?.textContent ?? "", /^a2ui/, "the view's head names its template");
		const text = visibleText(root);
		assert.match(text, /42 tickets open/, "the data model's binding resolved");
		assert.equal(deepQuery(root, "h2")?.textContent, "Support this week", "Text's markdown made the heading");
		assert.ok(deepQuery(root, "a2ui-card"), "the basic catalog's card drew it");
		assert.equal(el.querySelector("[data-answer-ui-error]"), null);
		assert.doesNotMatch(el.textContent ?? "", /"component": "Card"/, "the payload fence is not shown as text");
	} finally {
		unmount(el);
	}
});

test("a payload the catalog refuses shows the reasons where the surface would be, marked as an error", async () => {
	const broken = { components: [{ id: "root", component: "Card", child: "the-body" }, { id: "the-body", component: "Text", text: "x" }] };
	const { el } = await mount(DOC(block(broken)));
	try {
		await until(() => el.querySelector("[data-answer-ui-error]") !== null, "the error");
		const error = el.querySelector("[data-answer-ui-error]")!;
		assert.ok(error.hasAttribute("data-answer-ui"), "the error is cropped with the answer, so it is seen");
		assert.match(error.textContent ?? "", /did not render/);
		assert.match(error.textContent ?? "", /the-body.*UAX #31/s, "it names the component and the rule it broke");
		assert.equal(error.querySelector("a2ui-surface"), null, "no empty surface stands in for the answer");
	} finally {
		unmount(el);
	}
});

test("a component the catalog lacks is an error, not a blank surface", async () => {
	const { el } = await mount(DOC(block({ components: [{ id: "root", component: "Gauge", data: [1, 2] }] })));
	try {
		await until(() => el.querySelector("[data-answer-ui-error]") !== null, "the error");
		assert.match(el.querySelector("[data-answer-ui-error]")?.textContent ?? "", /Unknown component type 'Gauge'/);
	} finally {
		unmount(el);
	}
});

test("a call the tool refused is a quiet line, and the retry after it is the answer", async () => {
	const refused = `${block({ components: [{ id: "root", component: "Chart" }] }, "toolu_bad")}\n\n<!-- pi:result #toolu_bad error -->\n\n\`\`\`\nThe a2ui surface would not render\n\`\`\``;
	const { el } = await mount(DOC(refused, block(KPIS, "toolu_good")));
	try {
		await until(() => /42 tickets open/.test(visibleText(el)), "the retry's surface");
		assert.equal(el.querySelectorAll("[data-answer-ui]").length, 1, "only the retry is answer UI");
		assert.equal(el.querySelector("[data-answer-ui-error]"), null, "the refused attempt is not an error in the answer");
		assert.match(el.querySelector(".doc-view-a2ui-refused")?.textContent ?? "", /Refused/);
	} finally {
		unmount(el);
	}
});

test("a block that leaves the document takes its surface with it", async () => {
	const { el } = await mount(DOC(block(KPIS)));
	try {
		await until(() => el.querySelector("a2ui-surface") !== null, "the surface");
		const host = el.querySelector("[data-answer-ui]")!;
		el.replaceDocument(DOC());
		await settle(40);
		assert.equal(el.querySelector("[data-answer-ui]"), null);
		assert.equal(host.isConnected, false);
		assert.equal(host.querySelector("a2ui-surface"), null, "unmounting disposed the surface and its processor");
	} finally {
		unmount(el);
	}
});

/** A view call as pi streams it: arguments are plain JSON. */
const viewCall = (data: unknown) => ({
	type: "toolCall" as const,
	id: "toolu_s",
	name: "view",
	arguments: { template: "a2ui", data: JSON.parse(JSON.stringify(data)) },
});

const assistant = (content: AssistantMessage["content"]): AssistantMessage => ({
	role: "assistant",
	content,
	api: "",
	provider: "",
	model: "",
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "toolUse",
	timestamp: 0,
});

test("a surface still arriving is not judged: no refusal while its message streams, the surface once it is whole", async () => {
	const { el } = await mount(emptyDocument("x"));
	try {
		el.streaming = true;
		await settle();
		el.beginTurn();
		// Half the payload: the root names children that have not arrived yet,
		// which is exactly what the catalog refuses as dangling.
		const half = { components: KPIS.components.slice(0, 2), dataModel: KPIS.dataModel };
		el.applyAssistantPartial(assistant([viewCall(half)]));
		await settle(200);
		assert.equal(el.querySelector("[data-answer-ui-error]"), null, "a payload still streaming is not an error");
		assert.equal(el.querySelector("[data-answer-ui]"), null, "nor an answer yet");
		const whole = assistant([viewCall(KPIS)]);
		el.applyAssistantPartial(whole);
		el.finalizeAssistant(whole);
		await until(() => /42 tickets open/.test(visibleText(el)), "the surface once the message is whole");
		assert.equal(el.querySelector("[data-answer-ui-error]"), null);
	} finally {
		unmount(el);
	}
});
