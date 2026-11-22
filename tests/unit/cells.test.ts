// Cell vocabulary (integration plan, phase 3) — run `pnpm build` first, then
// `node --test tests/unit/cells.test.ts`. Pure parsing: no DOM shim needed (the
// engine itself is covered by tests/integration/engine.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import type { AssistantMessage, JsonObject } from "@earendil-works/pi-ai";
import type { DocArtifact } from "../../dist/document/cells.js";
import type { DocSegment } from "../../dist/document/format.js";
import { blocksFrom, parseDocument, serializeArtifact, serializeAssistant, serializeCell, serializeMessages, shortCellId, snippetRuns } from "../../dist/document/format.js";
import {
	applyChanges,
	artifactInScope,
	artifactScope,
	artifactsFrom,
	cellAnchors,
	cellSource,
	cellsFrom,
	compactCells,
	newCellSnippet,
} from "../../dist/document/cells.js";

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

const cellsOf = (md: string) => cellsFrom(md, parseDocument(md).segments);

/** The one cell segment a fixture is about. */
const cellSegOf = (md: string): DocSegment => {
	const seg = parseDocument(md).segments.find((x) => x.kind === "cell");
	assert.ok(seg, "the fixture should hold a cell segment");
	return seg;
};

test("serializeCell round-trips through the parser", () => {
	const md = `intro\n\n${serializeCell("js", "a3f2", "const a = 1")}\n`;
	const seg = cellSegOf(md);
	assert.equal(seg.name, "js");
	assert.equal(seg.id, "a3f2");
	const source = cellSource(md, seg);
	assert.ok(source, "a closed fence should yield a source");
	assert.deepEqual(source.source, "const a = 1");
});

test("sources containing fences get a longer fence and still round-trip", () => {
	const source = "const md = `\\`\\`\\`js\\nx\\n\\`\\`\\``\n```\nliteral ticks";
	const md = serializeCell("js", "q", source) + "\n";
	assert.equal(cellsOf(md)[0].source, source);
});

test("an unclosed fence yields no runnable cell (mid-edit honesty)", () => {
	const md = "<!-- pi:cell js #x -->\n\n```js\n1 + 1\n";
	const seg = cellSegOf(md);
	assert.equal(cellSource(md, seg), null);
	assert.deepEqual(cellsOf(md), []);
});

test("unknown modes parse but never run", () => {
	const md = "<!-- pi:cell cobol #x -->\n\n```\nMOVE A TO B.\n```\n";
	assert.equal(parseDocument(md).segments.find((s) => s.kind === "cell")?.name, "cobol");
	assert.deepEqual(cellsOf(md), []);
});

test("the widget anchor sits at the end of the closing fence line", () => {
	const md = `${serializeCell("js", "x", "1 + 1")}\n\nafter\n`;
	const [cell] = cellsOf(md);
	assert.equal(md.slice(cell.at - 3, cell.at), "```");
	assert.match(md.slice(cell.at), /^\n\nafter/);
});

test("newCellSnippet parses as one empty cell with the caret in the fence", () => {
	const { text, caret } = newCellSnippet("js");
	const [cell] = cellsOf(text);
	assert.equal(cell.mode, "js");
	assert.equal(cell.source, "");
	// The caret lands on the blank content line, right before the closing fence.
	assert.equal(text.slice(caret, caret + 4), "\n```");
});

test("a cell mid-conversation opens no block — it is material, not a new intent", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${serializeCell("js", "c", "1")}\n\n<!-- you -->\n\nQ2\n`;
	const { segments } = parseDocument(md);
	const blocks = blocksFrom(segments);
	assert.equal(blocks.length, 2, "the two prompts; the cell belongs to the first");
	const cellIndex = segments.findIndex((s) => s.kind === "cell");
	assert.ok(blocks[0].members.includes(cellIndex), "the cell joined the answer above it");
});

test("a cell at the head of a document still opens the first block", () => {
	// A page composed cells-first has to read as blocks in the rail; only a cell
	// *inside* a conversation is material rather than an opener.
	const md = `${serializeCell("js", "c", "1")}\n\n<!-- you -->\n\nQ\n`;
	const { segments } = parseDocument(md);
	const blocks = blocksFrom(segments);
	assert.equal(blocks.length, 2);
	assert.equal(blocks[0].opensAt, segments.findIndex((s) => s.kind === "cell"));
});

test("a folded cell joins the answer it belongs to", () => {
	// What serializeAssistant writes for a cell the agent produced mid-reply.
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n<!-- pi:block -->\n\n${serializeCell("js", "c", "1")}\n\n<!-- you -->\n\nQ2\n`;
	const { segments } = parseDocument(md);
	const blocks = blocksFrom(segments);
	assert.equal(blocks.length, 2, "the cell folded into the answer");
	const cellIndex = segments.findIndex((s) => s.kind === "cell");
	assert.ok(blocks[0].members.includes(cellIndex));
});

test("a cell-opened block is named by its source, not by its fence", () => {
	const md = serializeCell("js", "c", "const chart = 1;\nmore();");
	assert.equal(blocksFrom(parseDocument(md).segments)[0].name, "const chart = 1;");
});

// --- artifact groups: declared membership, derived layout ---

test("a cell marker's @group parses into segment and cell", () => {
	const md = "<!-- pi:cell js #a @chess -->\n\n```js\n1\n```\n";
	const seg = cellSegOf(md);
	assert.equal(seg.group, "chess");
	assert.equal(cellsOf(md)[0].group, "chess");
});

test("a groupless cell has no group", () => {
	assert.equal(cellsOf("<!-- pi:cell js #a -->\n\n```js\n1\n```\n")[0].group, undefined);
});

test("serializeCell round-trips the group", () => {
	const md = serializeCell("js", "a", "1", "chess") + "\n";
	assert.equal(cellsOf(md)[0].group, "chess");
});

test("grouped members anchor at the group's first cell; strangers keep their own", () => {
	const md = [
		serializeCell("js", "a", "1", "chess"),
		serializeCell("js", "x", "2"),
		serializeCell("js", "b", "3", "chess"),
	].join("\n\n");
	const cells = cellsOf(md);
	const anchors = cellAnchors(cells);
	assert.equal(anchors.get("b"), anchors.get("a"));
	const a = cells.find((c) => c.id === "a");
	const x = cells.find((c) => c.id === "x");
	assert.ok(a && x, "both named cells should have parsed");
	assert.equal(anchors.get("a"), a.at);
	assert.equal(anchors.get("x"), x.at);
});

test("deleting the anchor cell promotes the next member (self-healing)", () => {
	const md = [serializeCell("js", "x", "2"), serializeCell("js", "b", "3", "chess")].join("\n\n");
	const cells = cellsOf(md);
	const b = cells.find((c) => c.id === "b");
	assert.ok(b, "the surviving member should have parsed");
	assert.equal(cellAnchors(cells).get("b"), b.at);
});

// --- the `cell` tool (phase 4): the call IS the cell ---

const toolCall = (args: JsonObject, id = "call-1") =>
	assistant([{ type: "toolCall", id, name: "cell", arguments: args }]);

test("a cell tool call serializes as its pi:cell block", () => {
	const md = serializeAssistant(toolCall({ source: "const a = 1" }, "tc-9"));
	const [cell] = cellsOf(md);
	assert.equal(cell.id, "tc-9"); // fresh cell — call id is the cell id
	assert.equal(cell.mode, "js"); // default mode
	assert.equal(cell.source, "const a = 1");
});

test("a redefinition that names no mode is written in the mode the cell has", () => {
	// Within one message, and across the messages of a transcript.
	const both = assistant([
		{ type: "toolCall", id: "tc-1", name: "cell", arguments: { source: "q = 3", mode: "ojs", id: "q" } },
		{ type: "toolCall", id: "tc-2", name: "cell", arguments: { source: "q = 4", id: "q" } },
	]);
	assert.deepEqual(cellsOf(serializeAssistant(both)).map((c) => c.mode), ["ojs", "ojs"]);
	const turns = serializeMessages([
		toolCall({ source: "q = 3", mode: "ojs", id: "q" }, "tc-1"),
		toolCall({ source: "q = 4", id: "q" }, "tc-2"),
		toolCall({ source: "const fresh = 1", id: "other" }, "tc-3"),
	]);
	assert.deepEqual(cellsOf(turns).map((c) => [c.id, c.mode]), [["q", "ojs"], ["q", "ojs"], ["other", "js"]]);
});

test("only a cell that names no mode asks what mode it has", () => {
	// The answer costs a parse of the document, and a partial is serialized
	// many times a second: a call that is no cell, or names its mode, asks nothing.
	const asked: string[] = [];
	const modeOf = (id: string) => (asked.push(id), "ojs");
	const msg = assistant([
		{ type: "toolCall", id: "tc-1", name: "bash", arguments: { command: "ls" } },
		{ type: "toolCall", id: "tc-2", name: "cell", arguments: { source: "const a = 1", mode: "js", id: "a" } },
		{ type: "toolCall", id: "tc-3", name: "cell", arguments: { source: "q = 4", id: "q" } },
	]);
	assert.deepEqual(cellsOf(serializeAssistant(msg, modeOf)).map((c) => [c.id, c.mode]), [["a", "js"], ["q", "ojs"]]);
	assert.deepEqual(asked, ["q"]);
});

test("an explicit id argument wins over the call id (redefinition)", () => {
	const md = serializeAssistant(toolCall({ source: "const a = 2", id: "a3f2" }, "tc-10"));
	assert.equal(cellsOf(md)[0].id, "a3f2");
});

test("a cell tool call with a group opens an artifact block", () => {
	// The marker owns the group now. Two places saying which artifact a cell
	// belongs to is two places that can disagree.
	const md = serializeAssistant(toolCall({ source: "1", group: "chess" }, "tc-11"));
	assert.match(md, /<!-- pi:artifact @chess -->/);
	assert.equal(cellsOf(md)[0].group, undefined, "and the fence does not repeat it");
	assert.equal(artifactsOf(md)[0].key, "@chess");
});

test("a marker-unsafe group falls back to the honest pi:tool fence", () => {
	for (const group of ["not a token", "a>b", "a#b"]) {
		assert.equal(parseDocument(serializeAssistant(toolCall({ source: "1", group }))).segments[0].kind, "toolCall", group);
	}
});

test("a streaming partial without source stays an honest pi:tool fence", () => {
	const md = serializeAssistant(toolCall({}));
	assert.equal(parseDocument(md).segments[0].kind, "toolCall");
});

test("marker-unsafe mode or id falls back to pi:tool", () => {
	const cases: JsonObject[] = [
		{ source: "1", mode: "has space" },
		{ source: "1", id: "a#b" },
		{ source: "1", id: "a>b" },
	];
	for (const args of cases) {
		assert.equal(parseDocument(serializeAssistant(toolCall(args))).segments[0].kind, "toolCall", JSON.stringify(args));
	}
});

test("older parsers see pi:cell as opaque, not as content", () => {
	// The marker matches the catch-all `pi:\S[^>]*` alternative — a document
	// with cells degrades to a quiet dot in a Piary without phase 3.
	const md = "<!-- pi:unknown-thing -->\n\nbody\n";
	assert.equal(parseDocument(md).segments[0].kind, "opaque");
});

test("srcFrom/srcTo delimit the fence content (the write-back range)", () => {
	const md = `${serializeCell("js", "x", "const a = 1")}\n`;
	const [cell] = cellsOf(md);
	assert.equal(md.slice(cell.srcFrom, cell.srcTo), cell.source);
	const [empty] = cellsOf(serializeCell("js", "y", ""));
	assert.equal(empty.srcFrom, empty.srcTo);
	// Splicing new source at the range round-trips through the parser.
	const next = md.slice(0, cell.srcFrom) + "const a = 2" + md.slice(cell.srcTo);
	assert.equal(cellsOf(next)[0].source, "const a = 2");
});

// ---------- artifacts (derived groups, anchored under the answer) ----------

const artifactsOf = (md: string) => artifactsFrom(md, parseDocument(md).segments);
/** An artifact block: the marker, then its cells, as `[id, source]` pairs. */
type CellPair = readonly [id: string, source: string];
const artifactBlock = (name: string, cells: readonly CellPair[]) =>
	[serializeArtifact(name), ...cells.map(([id, src]) => `\n${serializeCell("js", id, src)}`)].join("\n");

test("an artifact block holds the cells written under it", () => {
	const md = ["ask", "", "<!-- pi -->", "", "here", "", artifactBlock("app", [["a", "1"], ["b", "2"]]), ""].join("\n");
	const arts = artifactsOf(md);
	assert.equal(arts.length, 1);
	assert.equal(arts[0].key, "@app");
	assert.deepEqual(
		arts[0].members.map((m) => m.id),
		["a", "b"],
	);
	assert.ok(md.slice(arts[0].at).startsWith("<!-- pi:artifact @app -->"), "it sits where its marker is — nothing computes a place for it");
});

test("a cell nobody grouped is its own artifact", () => {
	// It needs the frame for the same reasons a group does, and its own fence is
	// already a movable segment — a marker is for making SEVERAL cells one thing.
	const md = ["ask", "", serializeCell("js", "solo", "1"), ""].join("\n");
	const arts = artifactsOf(md);
	assert.equal(arts.length, 1);
	assert.equal(arts[0].key, "#solo");
	assert.deepEqual(
		arts[0].members.map((m) => m.id),
		["solo"],
	);
});

test("two ungrouped cells are two artifacts", () => {
	// Adjacency is not membership any more. The marker is.
	const md = ["ask", "", serializeCell("js", "a", "1"), "", serializeCell("js", "b", "2"), ""].join("\n");
	assert.equal(artifactsOf(md).length, 2);
});

test("only the winning definition is a member; the superseded fence is history", () => {
	const md = ["ask", "", artifactBlock("app", [["a", "old"], ["a", "new"]]), ""].join("\n");
	const [art] = artifactsOf(md);
	assert.equal(art.members.length, 1);
	assert.equal(art.members[0].source, "new");
});


test("a cell-free document derives no artifacts", () => {
	assert.deepEqual(artifactsOf("just prose\n"), []);
});

// ---------- editing an artifact instead of growing a second one ----------

const scopeAt = (md: string, pos?: number) => {
	const { segments } = parseDocument(md);
	const blocks = blocksFrom(segments);
	const artifacts = artifactsFrom(md, segments);
	return artifactInScope(segments, blocks, artifacts, pos ?? md.length);
};

const SCOPED = [
	"make me a widget",
	"",
	"<!-- pi -->",
	"",
	"here",
	"",
	artifactBlock("app", [["aa", "const city = 1"], ["bb", "city + 1"]]),
	"",
	"<!-- pi -->",
	"",
	"done",
	"",
].join("\n");

test("a follow-up inside the artifact's block is scoped to that artifact", () => {
	const scope = scopeAt(SCOPED, SCOPED.length);
	assert.ok(scope, "the block holds an artifact");
	assert.equal(scope.key, "@app");
});

test("a prompt in a block with no artifact is scoped to nothing", () => {
	const md = "just asking\n\n<!-- pi -->\n\njust answering\n";
	assert.equal(scopeAt(md, md.length), null);
});

test("the scope chip is exactly `[artifact] NAME — edit by id` (document-format.md §Snippets)", () => {
	const scope = scopeAt(SCOPED, SCOPED.length);
	assert.ok(scope, "the block holds an artifact");
	const chip = artifactScope(scope);
	assert.equal(chip, "[artifact] app — edit by id");
	// `artifactScope` reads `key` only; the rest completes the record.
	const long: DocArtifact = { key: "@a-very-long-artifact-name-indeed", members: [], at: 0 };
	assert.equal(artifactScope(long), "[artifact] a-very-long-a… — edit by id", "a long name is cut to 14 characters");
	const unnamed: DocArtifact = { key: "c1", members: [], at: 0 };
	assert.equal(artifactScope(unnamed), "[artifact] the one above — edit by id", "a key with no @ is not a name");
});

test("the chip is one SHORT line — pi splits a prompt prefix at 40 characters", () => {
	// The failure this pins: a longer chip round-tripped through the transcript
	// as several content parts, rejoined with a blank line, and broke mid-word
	// into a paragraph of its own. Under 40 it cannot split.
	// `artifactScope` reads `key` only; the rest completes the record.
	const long: DocArtifact = { key: "@a-very-long-artifact-name-indeed", members: [], at: 0 };
	const scoped = scopeAt(SCOPED, SCOPED.length);
	assert.ok(scoped, "the block holds an artifact");
	for (const a of [scoped, long]) {
		const chip = artifactScope(a);
		assert.equal(chip.split("\n").length, 1, "one line");
		assert.ok(chip.length < 40, `under the split: ${JSON.stringify(chip)}`);
	}
});

test("the chip is ordinary user text to the parser, and one chip to the reader", () => {
	const scope = scopeAt(SCOPED, SCOPED.length);
	assert.ok(scope, "the block holds an artifact");
	const md = `${artifactScope(scope)}\n\nmake it wider\n`;
	const { segments } = parseDocument(md);
	assert.deepEqual(
		segments.map((s) => s.kind),
		["user"],
		"the quote adds no segment",
	);
	const runs = snippetRuns(md, segments);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].kind, "artifact");
	assert.equal(runs[0].label, "app — edit by id");
});

test("a fresh agent cell gets a short id; a redefinition keeps the one it names", () => {
	const call = (args: JsonObject) =>
		assistant([{ type: "toolCall", id: "toolu_01HRtcsBTZ9EvMipct3saCSK", name: "cell", arguments: args }]);
	assert.match(serializeAssistant(call({ source: "1" })), /<!-- pi:cell js #3saCSK -->/);
	assert.match(serializeAssistant(call({ source: "1", id: "mine" })), /<!-- pi:cell js #mine -->/);
	assert.equal(shortCellId("toolu_01HRtcsBTZ9EvMipct3saCSK"), "3saCSK");
	assert.equal(shortCellId("short"), "short", "an id already short stays whole");
});

test("a follow-up in a NEW block still scopes to the artifact above it", () => {
	// Which of ⌘⏎ / ⌥⌘⏎ was pressed decides block structure, not what "fix it"
	// refers to — the chip must not depend on the modifier key.
	const md = `${SCOPED}\n<!-- you -->\n\nfix the slider\n`;
	const scope = scopeAt(md, md.length);
	assert.ok(scope, "the artifact one block up is still in scope");
	assert.equal(scope.key, "@app");
});

test("scope stops one block up — a stale chip is worse than none", () => {
	const md = `${SCOPED}\n<!-- you -->\n\nnext thing\n\n<!-- pi -->\n\nsure\n\n<!-- you -->\n\nand another\n`;
	assert.equal(scopeAt(md, md.length), null);
});



// ------------------------------------------------------------ compaction

/** Two turns: the artifact is built in the first, retranslated in the second. */
const REDEFINED = [
	"build me a counter",
	"",
	"<!-- pi -->",
	"",
	"here it is:",
	"",
	"<!-- pi:block -->",
	"",
	"<!-- pi:cell js #a @counter -->",
	"",
	"```js",
	'const label = "Count"',
	"```",
	"",
	"<!-- pi:cell js #b @counter -->",
	"",
	"```js",
	"htl.html`${label}`",
	"```",
	"",
	"<!-- you -->",
	"",
	"in German please",
	"",
	"<!-- pi -->",
	"",
	"umgestellt:",
	"",
	"<!-- pi:block -->",
	"",
	"<!-- pi:cell js #a @counter -->",
	"",
	"```js",
	'const label = "Anzahl"',
	"```",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

/** Compaction applied, or null when there was nothing to fold. */
const compact = (md: string): string | null => {
	const changes = compactCells(md, parseDocument(md).segments);
	return changes ? applyChanges(md, changes) : null;
};

/** Compaction applied, asserted to have happened — every fixture below redefines. */
const compacted = (md: string): string => {
	const out = compact(md);
	assert.ok(out, "the fixture redefines a cell, so compaction has work to do");
	return out;
};

const artifactOf = (md: string) => artifactsFrom(md, parseDocument(md).segments)[0];

test("a redefinition folds back into the fence it redefines", () => {
	const out = compacted(REDEFINED);
	const cells = cellsOf(out);
	assert.equal(cells.length, 2, "one fence per cell, not three");
	const a = cells.find((c) => c.id === "a");
	const b = cells.find((c) => c.id === "b");
	assert.ok(a && b, "both cells survive compaction");
	assert.equal(a.source, 'const label = "Anzahl"', "the survivor carries the NEWEST source");
	assert.ok(!out.includes('"Count"'), "and the superseded copy is gone from the page");
	assert.equal(b.source, "htl.html`${label}`", "an untouched cell is left alone");
});

test("compaction leaves the surviving fence where it was", () => {
	// Holding the artifact still is the BLOCK's job now — its position is its
	// marker's, and nothing computes one. What compaction still does is keep a
	// redefinition from leaving a dead copy of a forty-line cell behind.
	const out = compacted(REDEFINED);
	const turnsAbove = (md: string, at: number) =>
		parseDocument(md).segments.filter((s) => s.kind === "user" && s.text && s.from < at).length;
	const survivor = cellsOf(out).find((c) => c.id === "a");
	assert.ok(survivor, "cell a survives compaction");
	assert.equal(turnsAbove(out, survivor.seg.from), 1, "the survivor kept the position of the fence it folded into");
});

test("compaction is idempotent and leaves nothing dangling", () => {
	const once = compacted(REDEFINED);
	assert.equal(compact(once), null, "a second pass has nothing to do");
	assert.ok(!/<!-- pi:block -->\s*<!-- pi:block -->/.test(once), "a block marker goes with the fence it folded");
	assert.ok(!/<!-- pi:block -->\s*<!-- you -->\s*$/.test(once.trimEnd()), "and never strands itself before the prompt slot");
	// Still a valid document: same turns, same order, parse clean.
	assert.deepEqual(
		parseDocument(once).segments.filter((s) => s.kind === "user" && s.text).map((s) => s.text),
		["build me a counter", "in German please"],
	);
});

test("a redefinition in another mode keeps its mode through compaction", () => {
	// The newest definition is the cell: its source under the older marker would
	// be run in a language it was not written in.
	const md = `q\n\n<!-- pi -->\n\n${serializeCell("js", "pick", "const quarter = 3", "qc")}\n\n<!-- you -->\n\nas a selector\n\n<!-- pi -->\n\n${serializeCell("ojs", "pick", 'viewof quarter = Inputs.select(["Q3"])')}\n\n<!-- you -->\n\n`;
	const out = compacted(md);
	const cells = cellsOf(out);
	assert.equal(cells.length, 1, "one fence for the cell");
	assert.equal(cells[0].mode, "ojs", "the marker names the mode the newest definition has");
	assert.equal(cells[0].source, 'viewof quarter = Inputs.select(["Q3"])');
	assert.equal(cells[0].group, "qc", "and the survivor still says which artifact it is in");
	assert.equal(out.slice(cells[0].fenceFrom, cells[0].srcFrom), "```ojs\n", "the fence's language is the marker's mode");
	assert.equal(compact(out), null, "a second pass has nothing to do");
});

test("a document with no redefinition is left exactly alone", () => {
	const md = `q\n\n${serializeCell("js", "solo", "1")}\n\n<!-- you -->\n\n`;
	assert.equal(compactCells(md, parseDocument(md).segments), null);
});

// ---------- one name, however many times it is declared ----------
//
// `serializeAssistant` opens an artifact block from a cell's `group` argument,
// and the set it remembers that by is scoped to ONE assistant message. So an
// agent that names the same group across seven turns — which is exactly what
// the tool asks it to do, and all it can do — gets seven markers.
//
// It cannot do otherwise: a block is contiguous, and a cell written on turn 7
// cannot sit inside a block that closed on turn 1 with prose, thinking and the
// user's prompt in between. So the marker is re-emitted, and the second one
// means "these belong to @NAME too" rather than "here is a second @NAME".
//
// Read one-per-marker this was not a cosmetic problem. `key` is `@name` and the
// host's element registry is keyed by it, so N markers resolved to ONE
// <pi-artifact> whose members were overwritten N times: the cells of one
// declaration rendered and the rest were hidden as members of a frame that was
// not on the page.

const twoDeclarations = [
	"ask",
	"",
	artifactBlock("weather", [["a", "const a = 1"]]),
	"",
	"<!-- pi -->",
	"",
	"first pass",
	"",
	"<!-- pi:block -->",
	"",
	artifactBlock("weather", [["b", "a + 1"]]),
	"",
	"<!-- you -->",
	"",
].join("\n");

test("a name declared twice is one artifact holding both declarations' cells", () => {
	const arts = artifactsOf(twoDeclarations);
	const weather = arts.filter((a) => a.key === "@weather");
	assert.equal(weather.length, 1, "one artifact, not one per marker");
	assert.deepEqual(
		weather[0].members.map((m) => m.id),
		["a", "b"],
		"and it holds every cell either marker gathered",
	);
	assert.equal(arts.length, 1, "the second marker adds no artifact of its own");
});

test("it anchors at the first declaration — later turns add to it, not move it", () => {
	const arts = artifactsOf(twoDeclarations);
	assert.equal(arts[0].at, twoDeclarations.indexOf(serializeArtifact("weather")), "the position it was made at");
});

test("a redefinition in a later declaration supersedes the earlier fence", () => {
	const md = [
		"ask",
		"",
		artifactBlock("weather", [["a", "const a = 1"]]),
		"",
		"<!-- pi -->",
		"",
		"again",
		"",
		artifactBlock("weather", [["a", "const a = 99"]]),
		"",
		"<!-- you -->",
		"",
	].join("\n");
	const [art] = artifactsOf(md);
	assert.equal(art.members.length, 1, "one cell, not two copies of it");
	assert.match(art.members[0].source, /99/, "and it is the later definition");
});

test("compaction takes an artifact marker left holding nothing", () => {
	// The last cell under the second marker is a redefinition of the first, so
	// it is cut — and the marker that opened for it would be left declaring a
	// group that is not there: an empty block in the rail, a lie in the file.
	const md = [
		"ask",
		"",
		artifactBlock("weather", [["a", "const a = 1"]]),
		"",
		"<!-- pi:block -->",
		"",
		artifactBlock("weather", [["a", "const a = 2"]]),
		"",
		"<!-- you -->",
		"",
	].join("\n");
	const next = applyChanges(md, compactCells(md, parseDocument(md).segments) ?? []);
	assert.match(next, /const a = 2/, "the newest source survives");
	assert.equal(next.match(/pi:artifact/g)?.length, 1, "one marker left, not two");
	assert.equal(artifactsOf(next).filter((a) => a.members.length === 0).length, 0, "and none of them is empty");
});

test("a repeated declaration opens no block — it is more of the same artifact", () => {
	// The rail is a list of intents, and "more of that" is not a new one. A turn
	// whose FIRST content is a grouped cell gets no fold marker in front of it
	// (`serializeAssistant` only writes one for a cell that follows something),
	// so without this the continuation put a nameless block in the rail.
	const md = [
		"<!-- you -->",
		"",
		"# Weather",
		"",
		"build it",
		"",
		"<!-- pi -->",
		"",
		"here you go",
		"",
		// Written after prose, so serializeAssistant folds it in with a marker.
		"<!-- pi:block -->",
		"",
		artifactBlock("weather", [["a", "const a = 1"]]),
		"",
		// A later turn whose FIRST content is the cell: no fold marker is written
		// for it, and it must fold anyway.
		artifactBlock("weather", [["b", "a + 1"]]),
		"",
		"<!-- you -->",
		"",
	].join("\n");
	const { segments } = parseDocument(md);
	const blocks = blocksFrom(segments);
	assert.deepEqual(blocks.map((b) => b.name), ["Weather", ""], "the request, and the trailing slot — nothing between");
	const cells = blocks[0].members.filter((i) => segments[i].kind === "cell");
	assert.equal(cells.length, 2, "both declarations' cells sit in the block that asked for them");
});

test("a DIFFERENT artifact name still opens its own block", () => {
	const md = [
		"<!-- you -->",
		"",
		"# Two things",
		"",
		"<!-- pi:block -->",
		"",
		artifactBlock("weather", [["a", "1"]]),
		"",
		// A new name with no fold marker in front is a new intent: it opens.
		artifactBlock("clock", [["b", "2"]]),
		"",
		"<!-- you -->",
		"",
	].join("\n");
	assert.deepEqual(
		blocksFrom(parseDocument(md).segments).map((b) => b.name),
		["Two things", "", ""],
		"the request, the second artifact, and the trailing slot",
	);
});

test("compaction leaves a marker that still holds a cell", () => {
	const md = [
		"ask",
		"",
		artifactBlock("weather", [["a", "const a = 1"]]),
		"",
		"<!-- pi:block -->",
		"",
		artifactBlock("weather", [["a", "const a = 2"], ["b", "a + 1"]]),
		"",
		"<!-- you -->",
		"",
	].join("\n");
	const next = applyChanges(md, compactCells(md, parseDocument(md).segments) ?? []);
	assert.equal(next.match(/pi:artifact/g)?.length, 2, "the second marker still opens for #b");
	assert.deepEqual(artifactsOf(next)[0].members.map((m) => m.id), ["a", "b"]);
});
