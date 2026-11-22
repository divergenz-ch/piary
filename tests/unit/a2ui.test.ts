// The `a2ui` view's payload: a `view` call with template `a2ui` lands in the
// document as a `pi:view a2ui` block, round-trips, and its body is wrapped in
// the one A2UI v1.0 message the renderer processes (document-format.md §views).
// Run `pnpm build` first.
import assert from "node:assert/strict";
import test from "node:test";
import { documentMessages, parseDocument, serializeMessages } from "../../dist/document/format.js";
import { viewPayload } from "../../dist/document/views.js";
import { A2UI_CATALOG_ID, a2uiMessages } from "../../dist/document/a2ui.js";
import { checkView } from "../../pi-extension/view-shapes.ts";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

const body = {
	components: [
		{ id: "root", component: "Card", child: "title" },
		{ id: "title", component: "Text", text: "## Support this week" },
	],
	dataModel: { open: 42 },
};

/** The turn an agent answers with: a view call, and the tool's `ok`. */
const turn = (data: unknown) => [
	{ role: "user", content: "show me", timestamp: 0 },
	{
		role: "assistant",
		content: [{ type: "toolCall", id: "toolu_a2", name: "view", arguments: { template: "a2ui", data } }],
		api: "",
		provider: "",
		model: "",
		usage,
		stopReason: "toolUse",
		timestamp: 0,
	},
	{ role: "toolResult", toolCallId: "toolu_a2", toolName: "view", content: [{ type: "text", text: "ok" }], isError: false, timestamp: 0 },
];

test("an a2ui view call is written as a pi:view a2ui block whose payload is the body it sent", () => {
	const md = serializeMessages(turn(body) as never);
	assert.match(md, /^<!-- pi:view a2ui #toolu_a2 -->$/m);
	const seg = parseDocument(md).segments.find((s) => s.kind === "view");
	assert.ok(seg, "the call is a view segment");
	assert.equal(seg.name, "a2ui");
	assert.deepEqual(viewPayload(md, seg)?.data, body);
});

test("the block rebuilds into the same view call, so pi's history keeps the surface it sent", () => {
	const md = serializeMessages(turn(body) as never);
	const { messages } = documentMessages(md);
	const call = messages.flatMap((m) => ((m as { content?: unknown }).content as { type: string; name?: string; arguments?: unknown }[]) ?? [])
		.find((part) => typeof part === "object" && part.type === "toolCall");
	assert.equal(call?.name, "view");
	assert.deepEqual(call?.arguments, { template: "a2ui", data: body });
});

test("the body becomes one v1.0 createSurface on Piary's catalog, under the block's surface", () => {
	assert.deepEqual(a2uiMessages(body, "s1"), {
		messages: [{ version: "1.0", createSurface: { surfaceId: "s1", catalogId: A2UI_CATALOG_ID, components: body.components, dataModel: body.dataModel } }],
	});
});

test("a payload that is already A2UI is pointed at the block's surface and Piary's catalog", () => {
	const message = { version: "v0.9", createSurface: { surfaceId: "mine", catalogId: "https://a2ui.org/basic.json", components: body.components } };
	const one = a2uiMessages(message, "s1");
	assert.ok("messages" in one);
	assert.deepEqual(one.messages, [{ version: "1.0", createSurface: { surfaceId: "s1", catalogId: A2UI_CATALOG_ID, components: body.components } }]);
	const list = a2uiMessages(
		{
			messages: [
				{ version: "v0.9", createSurface: { surfaceId: "mine", catalogId: "x" } },
				{ version: "v0.9", updateComponents: { surfaceId: "mine", components: body.components } },
				{ version: "v0.9", deleteSurface: { surfaceId: "mine" } },
			],
		},
		"s1",
	);
	assert.ok("messages" in list);
	assert.deepEqual(
		list.messages.map((m) => Object.keys(m)[1]),
		["createSurface", "updateComponents"],
		"a deleteSurface is dropped: a block is one surface for as long as it is in the document",
	);
	assert.ok(list.messages.every((m) => (Object.values(m)[1] as { surfaceId: string }).surfaceId === "s1"));
	const updateOnly = a2uiMessages({ messages: [{ updateComponents: { surfaceId: "x", components: [] } }] }, "s1");
	assert.ok("messages" in updateOnly);
	assert.ok("createSurface" in updateOnly.messages[0]!, "a list with no createSurface gets one first");
});

test("a payload that is no A2UI shape at all says what the body must be", () => {
	for (const bad of [null, "text", { rows: [] }, { messages: [{ nonsense: {} }] }]) {
		const out = a2uiMessages(bad, "s1");
		assert.ok("problem" in out, `${JSON.stringify(bad)} is refused`);
		assert.match(out.problem, /components|not one of/);
	}
});

test("the view tool's shape check knows the a2ui template and its envelope", () => {
	assert.equal(checkView("a2ui", body, "a2ui"), null);
	assert.equal(checkView("a2ui", { messages: [] }, "a2ui"), null);
	assert.match(checkView("a2ui", { root: "x" }, "a2ui") ?? "", /"components"/);
});
