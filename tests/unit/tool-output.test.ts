// The text of a tool's streamed partial result, which decides whether a panel
// opens at all. `node --test tests/unit/tool-output.test.ts`
import test from "node:test";
import assert from "node:assert/strict";
import { partialText } from "../../src/document/tool-output.ts";

test("a string content is the text itself", () => {
	assert.equal(partialText({ content: "total 0\n" }), "total 0\n");
});

test("text parts are joined by a newline, and other parts are dropped", () => {
	const partial = {
		content: [
			{ type: "text", text: "a" },
			{ type: "image", data: "…", mimeType: "image/png" },
			{ type: "text", text: "b" },
		],
	};
	assert.equal(partialText(partial), "a\nb");
});

test("pi's first, empty update has no text, so no panel opens for it", () => {
	assert.equal(partialText({ content: [] }), "");
	assert.equal(partialText({}), "");
	assert.equal(partialText(null), "");
	assert.equal(partialText(undefined), "");
});
