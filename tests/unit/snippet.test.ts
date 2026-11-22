// Snippets: a selection quoted into a follow-up prompt — run `pnpm build`
// first, then `node --test tests/unit/snippet.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, pendingUserText, snippetQuote, snippetRuns, SNIPPET_MARK } from "../../dist/document/format.js";

const runsIn = (md: string) => snippetRuns(md, parseDocument(md).segments);

test("every line is quoted; blank lines keep the run together", () => {
	const quote = snippetQuote("  first\n\nsecond  ");
	assert.equal(quote, `${SNIPPET_MARK}\n> first\n>\n> second`);
});

test("quoting is the escape: markers and fences can't smuggle structure", () => {
	const selection = "<!-- pi -->\n```json\n{ \"a\": 1 }\n```";
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n${snippetQuote(selection)}\n\nwhat is this?\n`;
	const { segments } = parseDocument(md);
	assert.deepEqual(
		segments.map((s) => s.kind),
		["user", "assistant", "user"],
	);
	// The quoted text travels to the agent as part of the pending prompt.
	const pending = pendingUserText(md);
	assert.ok(pending, "the document ends in a pending user prompt");
	assert.match(pending, /> <!-- pi -->/);
	assert.match(pending, /> ```json/);
	assert.match(pending, /what is this\?$/);
});

test("runs are found in user segments only, with preview and line count", () => {
	const md = `<!-- you -->\n\n${snippetQuote("hello world\nsecond line")}\n\nfollow-up\n`;
	const runs = runsIn(md);
	assert.equal(runs.length, 1);
	assert.equal(runs[0].lines, 2);
	assert.equal(runs[0].preview, "hello world");
	assert.equal(md.slice(runs[0].from, runs[0].markTo), SNIPPET_MARK);
	assert.equal(md.slice(runs[0].to - 11, runs[0].to), "second line");

	// The same text inside a reply is the agent's prose, not the user's snippet.
	const reply = `Q\n\n<!-- pi -->\n\n${snippetQuote("hello")}\n\n<!-- you -->\n\nok\n`;
	assert.deepEqual(runsIn(reply), []);
});

// Expanding a run replaces the bracket and nothing else, so a one-line mark
// reveals what it holds. Replacing up to `markTo` swallowed the whole line:
// a [cell values] row expanded to a header and no values.
test("labelFrom lands on the payload, past the bracket", () => {
	const values = '[cell values] {"servings":4}';
	const scope = "[artifact] my-card — edit by id";
	const md = `<!-- you -->\n\n${scope}\n\n${values}\n\nmake it wider\n`;
	const runs = runsIn(md);
	assert.deepEqual(
		runs.map((r) => r.kind),
		["artifact", "values"],
	);
	assert.equal(md.slice(runs[0].labelFrom, runs[0].markTo), "my-card — edit by id");
	assert.equal(md.slice(runs[1].labelFrom, runs[1].markTo), '{"servings":4}');

	// A snippet's whole line IS the mark — nothing to leave behind on it.
	const quoted = runsIn(`<!-- you -->\n\n${snippetQuote("hello")}\n\nfollow-up\n`);
	assert.equal(quoted[0].labelFrom, quoted[0].markTo);
});

test("two runs in one prompt, and a run at end of document", () => {
	const md = `<!-- you -->\n\n${snippetQuote("one")}\n\nmid\n\n${snippetQuote("two\nlines")}`;
	const runs = runsIn(md);
	assert.equal(runs.length, 2);
	assert.ok(runs[0].from < runs[1].from);
	assert.deepEqual(
		runs.map((r) => r.preview),
		["one", "two"],
	);
	assert.equal(runs[1].to, md.length); // last run runs to the end, no trailing newline
	assert.equal(runs[1].lines, 2);
});

test("a long selection is truncated in the chip preview only", () => {
	const long = "x".repeat(200);
	const md = `<!-- you -->\n\n${snippetQuote(long)}\n`;
	const [run] = runsIn(md);
	assert.ok(run.preview.length < 70 && run.preview.endsWith("…"));
	const pending = pendingUserText(md);
	assert.ok(pending, "the document ends in a pending user prompt");
	assert.match(pending, new RegExp(`> ${long}`)); // the agent still gets all of it
});

test("a lone mark line is a run with nothing quoted", () => {
	const md = `<!-- you -->\n\n${SNIPPET_MARK}\n`;
	const [run] = runsIn(md);
	assert.equal(run.lines, 0);
	assert.equal(run.preview, "");
	assert.equal(run.to, run.markTo);
});
