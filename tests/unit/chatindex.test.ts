// Rail rollup — run `pnpm build` first, then `node --test tests/unit/chatindex.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { indexFromDocument } from "../../dist/components/ChatIndex.js";

const call = (name: string, id: number) => `<!-- pi:tool ${name} #${id} -->\n\n\`\`\`\ncmd\n\`\`\`\n\n`;
const result = (id: number) => `<!-- pi:result #${id} -->\n\n\`\`\`\nok\n\`\`\`\n\n`;

test("3+ machine steps in a row collapse to one rail tick", () => {
	const md = `Q\n\n<!-- pi -->\n\n${call("bash", 1)}${result(1)}${call("read", 2)}${result(2)}${call("grep", 3)}${result(3)}`;
	const kinds = indexFromDocument(md).map((e) => `${e.kind}:${e.label}`);
	assert.deepEqual(kinds, ["user:Q", "tool:3 steps"]);
});

test("fewer than 3 stay individual; running wins the rolled status", () => {
	const md = `Q\n\n<!-- pi -->\n\n${call("bash", 1)}${result(1)}${call("read", 2)}`;
	assert.deepEqual(
		indexFromDocument(md).map((e) => e.label),
		["Q", "bash", "read"],
	);
	const long = `Q\n\n<!-- pi -->\n\n${call("bash", 1)}${result(1)}${call("read", 2)}${result(2)}${call("grep", 3)}`;
	const last = indexFromDocument(long).at(-1);
	assert.ok(last, "the rolled-up run must produce a trailing entry");
	assert.equal(last.status, "running");
});
