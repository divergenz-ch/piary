// Steps 10–11 view payloads and extractors — run `pnpm build` first, then
// `node --test tests/unit/views.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { DocSegment } from "../../dist/document/format.js";
import { parseDocument, serializeAssistant, serializeView } from "../../dist/document/format.js";
import { cellStatePayload, viewOverArtifact, viewPayload } from "../../dist/document/views.js";
import { extractDiff, lineDiff } from "../../dist/components/views/diff.js";
import { extractFileTree } from "../../dist/components/views/file-tree.js";
import { extractCards } from "../../dist/components/views/cards.js";
import { extractMatches } from "../../dist/components/views/matches.js";
import { extractProperties } from "../../dist/components/views/properties.js";
import { extractTable, normalizeTable } from "../../dist/components/views/table.js";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** An assistant message carrying only what the serializer reads off one: its
 *  content. The provider bookkeeping is filled in here once rather than
 *  restated at every call. */
const assistant = (content: AssistantMessage["content"]): AssistantMessage => ({
	role: "assistant",
	content,
	api: "",
	provider: "",
	model: "",
	usage,
	stopReason: "stop",
	timestamp: 0,
});

/** The extractor payload shapes these tests read back. The extractors are
 *  typed `unknown` — a `ViewExtractor` promises only "fits the template, or
 *  null" — so each predicate below checks the shape it names. */
interface MatchesData {
	matches: { file: string; lines: { line: number; text: string; spans?: [number, number][] }[] }[];
}
interface CardsData {
	results: { title: string; url: string; age?: string; snippet?: string }[];
}

const isMatches = (v: unknown): v is MatchesData =>
	typeof v === "object" && v !== null && "matches" in v && Array.isArray(v.matches);

const isCards = (v: unknown): v is CardsData =>
	typeof v === "object" && v !== null && "results" in v && Array.isArray(v.results);

const viewSeg = (md: string): DocSegment => {
	const seg = parseDocument(md).segments.find((s) => s.kind === "view");
	assert.ok(seg, "document should hold a view segment");
	return seg;
};

test("closed json fence parses to data; `to` ends on the closing fence line", () => {
	const md = '<!-- pi:view diff #v1 -->\n\n```json\n{ "oldText": "a", "newText": "b" }\n```\n\ntrailing prose\n';
	const seg = viewSeg(md);
	const payload = viewPayload(md, seg);
	assert.ok(payload, "closed fence should parse");
	assert.deepEqual(payload.data, { oldText: "a", newText: "b" });
	assert.equal(md.slice(payload.to - 3, payload.to), "```");
	assert.ok(payload.to < md.indexOf("trailing"));
});

test("unclosed fence (mid-stream) yields null", () => {
	const md = '<!-- pi:view diff #v1 -->\n\n```json\n{ "oldText": "a"\n';
	assert.equal(viewPayload(md, viewSeg(md)), null);
});

test("broken json yields null", () => {
	const md = "<!-- pi:view diff #v1 -->\n\n```json\nnot json {\n```\n";
	assert.equal(viewPayload(md, viewSeg(md)), null);
});

test("serializeView round-trips, backtick-bearing payloads included", () => {
	const data = { paths: ["a/b.ts", "c.md"], note: "has ``` inside" };
	const md = `${serializeView("file-tree", "v9", data)}\n`;
	const seg = viewSeg(md);
	assert.equal(seg.name, "file-tree");
	assert.equal(seg.id, "v9");
	const payload = viewPayload(md, seg);
	assert.ok(payload, "round-tripped view should parse");
	assert.deepEqual(payload.data, data);
});

test("lineDiff: change is del-then-ins between matching context", () => {
	assert.deepEqual(lineDiff("a\nb\nc", "a\nx\nc"), [
		{ type: "same", text: "a" },
		{ type: "del", text: "b" },
		{ type: "ins", text: "x" },
		{ type: "same", text: "c" },
	]);
});

// ------------------------------------------------------------------ step 11

test("serializeAssistant: a view tool call becomes its pi:view block", () => {
	const msg = assistant([
		{ type: "toolCall", id: "c1", name: "view", arguments: { template: "table", data: { columns: ["a"], rows: [[1]] } } },
		{ type: "toolCall", id: "c2", name: "bash", arguments: { command: "ls" } },
	]);
	const segs = parseDocument(serializeAssistant(msg)).segments;
	assert.equal(segs[0].kind, "view");
	assert.equal(segs[0].name, "table");
	assert.equal(segs[0].id, "c1");
	const view = segs[0];
	assert.ok(view, "the view call should have serialized to a segment");
	const payload = viewPayload(serializeAssistant(msg), view);
	assert.ok(payload, "the serialized view fence should parse");
	assert.deepEqual(payload.data, { columns: ["a"], rows: [[1]] });
	assert.equal(segs[1].kind, "toolCall");
});

test("serializeAssistant: a partial view call (no data yet) stays a pi:tool marker", () => {
	const msg = assistant([{ type: "toolCall", id: "c1", name: "view", arguments: { template: "table" } }]);
	assert.equal(parseDocument(serializeAssistant(msg)).segments[0].kind, "toolCall");
});

test("extractDiff: edit call args → first pair with file; other tools → null", () => {
	const args = { path: "a.ts", edits: [{ oldText: "x", newText: "y" }, { oldText: "p", newText: "q" }] };
	assert.deepEqual(extractDiff("edit", args), { file: "a.ts", oldText: "x", newText: "y" });
	assert.equal(extractDiff("bash", args), null);
});

test("extractFileTree: path lines yes, prose and notice lines handled", () => {
	assert.deepEqual(extractFileTree("bash", null, "src/a.ts\nsrc/b.ts\n[Truncated: 100 entries limit]"), {
		paths: ["src/a.ts", "src/b.ts"],
	});
	assert.equal(extractFileTree("bash", null, "not a path list\njust prose"), null);
	// ls output may be bare names without slashes — the tool name vouches.
	assert.deepEqual(extractFileTree("ls", null, "a.ts\nb.ts"), { paths: ["a.ts", "b.ts"] });
	assert.equal(extractFileTree("bash", null, "a.ts\nb.ts"), null);
});

test("extractMatches: grep-shaped lines group by file, spans from the pattern", () => {
	const out = "src/a.ts:3: const foo = 1\nsrc/a.ts:9: foo again\nsrc/b.ts:1: foo!";
	const data = extractMatches("grep", { pattern: "foo" }, out);
	// The extractors are typed `unknown` (the ViewExtractor contract) and claim
	// a shape only by fitting a template — so the shape is checked, not asserted.
	assert.ok(isMatches(data), "grep output should extract as matches");
	assert.equal(data.matches.length, 2);
	const first = data.matches[0];
	const second = data.matches[1];
	assert.ok(first && second, "two files should have grouped");
	assert.deepEqual(first.lines[0], { line: 3, text: "const foo = 1", spans: [[6, 9]] });
	assert.equal(second.file, "src/b.ts");
	assert.equal(extractMatches("bash", null, "just prose\nno match lines"), null);
});

test("extractCards vs extractTable vs extractProperties: shape decides", () => {
	const linked = JSON.stringify([{ title: "T", url: "https://x.test/p", snippet: "s" }]);
	const cards = extractCards(undefined, null, linked);
	assert.ok(isCards(cards), "a linked record array should extract as cards");
	assert.deepEqual(cards.results[0], {
		title: "T",
		url: "https://x.test/p",
		age: undefined,
		snippet: "s",
	});
	const records = JSON.stringify([{ pid: 1, cmd: "sh" }, { pid: 2, cmd: "node", cpu: 0.5 }]);
	assert.equal(extractCards(undefined, null, records), null); // no title+url — rows, not cards
	assert.deepEqual(extractTable(undefined, null, records), {
		columns: ["pid", "cmd", "cpu"],
		rows: [[1, "sh", null], [2, "node", 0.5]],
	});
	assert.equal(extractTable(undefined, null, JSON.stringify([{ nested: { a: 1 } }])), null);
	assert.deepEqual(extractProperties(undefined, null, '{ "name": "pi", "v": 1 }'), { name: "pi", v: 1 });
	assert.equal(extractProperties(undefined, null, "[1, 2]"), null);
});

test("viewOverArtifact: pairs result with its call; error results extract nothing", () => {
	const doc = (flag: string) =>
		'<!-- pi:tool edit #c1 -->\n\n```json\n{ "path": "a.ts", "edits": [{ "oldText": "x", "newText": "y" }] }\n```\n\n' +
		`<!-- pi:result #c1${flag} -->\n\n\`\`\`\nok\n\`\`\`\n`;
	const segs = parseDocument(doc("")).segments;
	const at = segs.findIndex((s) => s.kind === "toolResult");
	assert.deepEqual(viewOverArtifact(segs, at), { template: "diff", data: { file: "a.ts", oldText: "x", newText: "y" } });
	const errSegs = parseDocument(doc(" error")).segments;
	assert.equal(viewOverArtifact(errSegs, errSegs.findIndex((s) => s.kind === "toolResult")), null);
});

test("lineDiff: pure insertion and deletion keep context matched", () => {
	assert.deepEqual(lineDiff("a\nc", "a\nb\nc"), [
		{ type: "same", text: "a" },
		{ type: "ins", text: "b" },
		{ type: "same", text: "c" },
	]);
	assert.deepEqual(lineDiff("a\nb\nc", "a\nc"), [
		{ type: "same", text: "a" },
		{ type: "del", text: "b" },
		{ type: "same", text: "c" },
	]);
});

test("table accepts the record shape models emit ({key,label} columns, object rows)", () => {
	const norm = normalizeTable({
		columns: [{ key: "e", label: "Your element" }, { key: "v", label: "Voice" }],
		rows: [{ e: "User prompt", v: "writer" }, { e: "Machine sim", v: "machine work" }],
	});
	assert.deepEqual(norm, { columns: ["Your element", "Voice"], rows: [["User prompt", "writer"], ["Machine sim", "machine work"]] });
	// documented shape still passes through; mixed record rows keyed by string columns too
	assert.deepEqual(normalizeTable({ columns: ["a"], rows: [[1]] }), { columns: ["a"], rows: [[1]] });
	assert.deepEqual(normalizeTable({ columns: ["a"], rows: [{ a: 1 }] }), { columns: ["a"], rows: [[1]] });
	assert.equal(normalizeTable({ columns: [], rows: [] }), null);
	assert.equal(normalizeTable({ columns: [{ label: "no key" }], rows: [{}] }), null);
});

// The persisted widget state is a versioned envelope (notebook-cells.md
// §Persisting state): `{ v: 2, views, store }`, or a flat v1 `{name: value}`
// written before the split. v1 carries no version marker of its own, so any
// object that is not a v2 envelope can only be read as v1.

test("cellStatePayload: a v2 envelope reads back as its two halves", () => {
	const views = { zoom: 1270 };
	const store = { center: [0.25, 0] };
	assert.deepEqual(cellStatePayload({ v: 2, views, store }), { views, store });
	assert.deepEqual(cellStatePayload({ v: 2 }), { views: {}, store: {} }, "a half that is missing reads as empty");
});

test("cellStatePayload: a flat v1 record is all views and no store", () => {
	const record = { zoom: 1270, palette: "fire" };
	assert.deepEqual(cellStatePayload(record), { views: record, store: {} });
});

test("cellStatePayload: a `v` other than 2 is a v1 view named `v`", () => {
	// Not an unknown version being guessed at: v1 is unmarked, and `v` is a
	// name a cell may export, so `{ v: 3 }` is a legal v1 record.
	const record = { v: 3, views: { zoom: 2 } };
	assert.deepEqual(cellStatePayload(record), { views: record, store: {} });
});

test("cellStatePayload: anything that is not a plain object is no state", () => {
	assert.equal(cellStatePayload(null), null);
	assert.equal(cellStatePayload([{ zoom: 1 }]), null);
	assert.equal(cellStatePayload("v2"), null);
	assert.equal(cellStatePayload(2), null);
});
