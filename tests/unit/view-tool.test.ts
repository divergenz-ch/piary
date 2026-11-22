// The view tool's payload check: ill-fitting data is rejected at call time
// instead of silently degrading to a JSON fence. `node --test tests/unit/view-tool.test.ts`
import test from "node:test";
import assert from "node:assert/strict";
import { checkView } from "../../pi-extension/view-shapes.ts";

test("valid payloads pass, including the record-shaped table", () => {
	assert.equal(checkView("table", { columns: ["a"], rows: [[1]] }, "a2ui"), null);
	assert.equal(checkView("table", { columns: [{ key: "a", label: "A" }], rows: [{ a: 1 }] }, "a2ui"), null);
	assert.equal(checkView("diff", { oldText: "a", newText: "b" }, "a2ui"), null);
	assert.equal(checkView("file-tree", { paths: ["a/b.ts"] }, "a2ui"), null);
	assert.equal(checkView("cards", { results: [{ title: "t" }] }, "a2ui"), null);
	assert.equal(checkView("matches", { matches: [{ file: "a.ts", lines: [{ text: "x" }] }] }, "a2ui"), null);
	assert.equal(checkView("properties", { a: 1 }, "a2ui"), null);
});

test("bad shapes and unknown templates report what was expected", () => {
	// checkView returns null on a fit; each of these must report, so narrow first.
	const reported = (template: string, data: unknown): string => {
		const msg = checkView(template, data, "a2ui");
		assert.ok(msg, `${template} should have been rejected`);
		return msg;
	};
	assert.match(reported("table", { columns: [], rows: [] }), /Expected/);
	assert.match(reported("table", { rows: [{ a: 1 }] }), /columns/);
	assert.match(reported("cards", { results: [{ name: "no title" }] }), /title/);
	assert.match(reported("properties", {}), /flat JSON object/);
	assert.match(reported("tabel", { columns: ["a"], rows: [[1]] }), /Unknown template/);
});

test("in free drawing the a2ui template is refused and the agent is sent to the cell tool", () => {
	const surface = { components: [{ id: "root", component: "Text", text: "## Runway" }] };
	assert.equal(checkView("a2ui", surface, "a2ui"), null);
	// A model that saw a2ui views in the history of a conversation tries one:
	// the answer has to say what to do instead, whatever the payload is.
	const refusal = "The a2ui template is not enabled in this session; draw it with the `cell` tool.";
	assert.equal(checkView("a2ui", surface, "free"), refusal);
	assert.equal(checkView("a2ui", { root: "x" }, "free"), refusal);
});

test("free drawing keeps every other template, and offers no a2ui for a name it does not know", () => {
	assert.equal(checkView("table", { columns: ["a"], rows: [[1]] }, "free"), null);
	assert.equal(checkView("diff", { oldText: "a", newText: "b" }, "free"), null);
	assert.match(checkView("properties", {}, "free") ?? "", /flat JSON object/);
	const unknown = checkView("tabel", { columns: ["a"], rows: [[1]] }, "free") ?? "";
	assert.match(unknown, /Unknown template "tabel"\. Use one of: diff, file-tree, table, cards, matches, properties\./);
	assert.match(checkView("tabel", {}, "a2ui") ?? "", /properties, a2ui\./);
});
