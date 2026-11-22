// Live markdown plan (hybrid rendering) — run `pnpm build` first, then
// `node --test tests/unit/markdown-live.test.ts`. Headless: the plan is pure
// EditorState → ranges; only the widget half needs a browser.
import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { linkAt, liveMdPlan, proseAt, safeLinkUrl, safeUrl } from "../../dist/components/markdown-live.js";

const stateAt = (doc: string, anchor: number) => {
	const state = EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ base: markdownLanguage })] });
	ensureSyntaxTree(state, doc.length, 5000);
	return state;
};

const hidden = (doc: string, anchor: number) =>
	liveMdPlan(stateAt(doc, anchor)).hide.map((r) => doc.slice(r.from, r.to));

test("bold marks hide when the caret is elsewhere, reveal when inside", () => {
	const doc = "x **bold** y";
	assert.deepEqual(hidden(doc, 0), ["**", "**"]);
	assert.deepEqual(hidden(doc, 5), []); // caret inside the span
	assert.deepEqual(hidden(doc, 10), []); // boundary-inclusive: adjacent reveals
});

test("heading mark (with its space) hides unless the caret is on the line", () => {
	const doc = "## Title\n\nbody";
	assert.deepEqual(hidden(doc, doc.length), ["## "]);
	assert.deepEqual(hidden(doc, 4), []); // caret on the heading line
});

test("inline code and strikethrough marks hide; fence marks never do", () => {
	const doc = "a `code` ~~gone~~ z\n\n```js\nconst x = 1\n```\n";
	assert.deepEqual(hidden(doc, 0), ["`", "`", "~~", "~~"]);
	// A fence is hidden as two whole lines or not at all, and only where the
	// host says the text is prose: with no host, every fence line stays.
	assert.deepEqual(liveMdPlan(stateAt(doc, 0)).fences, []);
});

/** A state whose host calls `prose(pos)` prose, as the canvas does for a `you`
 *  or `pi` body. */
const proseState = (doc: string, anchor: number, prose: (pos: number) => boolean = () => true) => {
	const state = EditorState.create({
		doc,
		selection: { anchor },
		extensions: [markdown({ base: markdownLanguage }), proseAt.of((_state: EditorState, pos: number) => prose(pos))],
	});
	ensureSyntaxTree(state, doc.length, 5000);
	return state;
};
/** Each planned fence as the text of its two fence lines, its language and its code lines. */
const fences = (doc: string, anchor: number, prose?: (pos: number) => boolean) =>
	liveMdPlan(proseState(doc, anchor, prose)).fences.map((f) => ({
		lines: [f.open, f.close].map((from) => doc.slice(from, doc.indexOf("\n", from) < 0 ? doc.length : doc.indexOf("\n", from))),
		lang: f.lang,
		code: f.code.map((from) => doc.slice(from, doc.indexOf("\n", from))),
	}));

test("a prose code block's two fence lines hide, with or without an info string", () => {
	const doc = "intro\n\n```text\nplain\nmore\n```\n\n```\nbare\n```\n\nend";
	assert.deepEqual(fences(doc, 0), [
		{ lines: ["```text", "```"], lang: "text", code: ["plain", "more"] },
		{ lines: ["```", "```"], lang: "", code: ["bare"] },
	]);
});

test("a hidden fence returns when the selection touches its block, edges included", () => {
	const doc = "intro\n\n```text\nplain\n```\n\nend";
	const open = doc.indexOf("```");
	const close = doc.lastIndexOf("```") + 3;
	for (const at of [open, doc.indexOf("plain") + 2, close]) assert.deepEqual(fences(doc, at), [], `caret at ${at}`);
	assert.equal(fences(doc, open - 2).length, 1, "a caret on the blank line above is away");
	assert.equal(fences(doc, close + 2).length, 1);
});

test("a fence outside prose keeps its lines: a cell's, a view's, a tool's payload", () => {
	const doc = "```text\nprose\n```\n\n```js\npayload\n```\n";
	const payload = doc.indexOf("```js");
	assert.deepEqual(
		fences(doc, doc.length, (pos) => pos < payload).map((f) => f.lang),
		["text"],
	);
});

test("a fence that is not two clean lines keeps them: unclosed, empty, nested in a list or a quote", () => {
	for (const doc of [
		"a\n\n```js\nstill streaming",
		"a\n\n```js\n```\n\nz",
		"a\n\n- item\n  ```js\n  x\n  ```\n\nz",
		"a\n\n> ```js\n> x\n> ```\n\nz",
	])
		assert.deepEqual(fences(doc, 0), [], JSON.stringify(doc));
});

test("a longer fence holding a three-tick line hides only its own two lines", () => {
	const doc = "a\n\n````md\n```js\nx\n```\n````\n\nz";
	assert.deepEqual(fences(doc, 0), [{ lines: ["````md", "````"], lang: "md", code: ["```js", "x", "```"] }]);
});

test("an escape's backslash hides when the caret is elsewhere, reveals when adjacent", () => {
	const doc = "x \\*Northwind's surcharge included. `a \\* b` y";
	// The backslash alone hides: the escaped character is the content. Code
	// spans hold no escapes, so the one inside the backticks is not a mark.
	assert.deepEqual(liveMdPlan(stateAt(doc, doc.length)).hide.map((r) => [r.from, r.to]).slice(0, 1), [[2, 3]]);
	assert.deepEqual(hidden(doc, doc.length), ["\\", "`", "`"]);
	assert.deepEqual(hidden(doc, 3), ["`", "`"]); // caret between the backslash and its character
	assert.deepEqual(hidden(doc, 4), ["`", "`"]); // boundary-inclusive, like every other mark
});

test("links hide the apparatus, keep the label", () => {
	const doc = "see [label](https://x.test) end";
	const plan = liveMdPlan(stateAt(doc, 0));
	const hiddenText = plan.hide.map((r) => doc.slice(r.from, r.to)).join("");
	assert.equal(hiddenText, "[](https://x.test)");
});

test("email and URL link labels stay visible; only their destinations hide", () => {
	for (const [label, destination] of [
		["hello@example.com", "mailto:hello@example.com"],
		["https://label.test", "https://destination.test"],
	]) {
		const doc = `see [${label}](${destination}) end`;
		const state = stateAt(doc, 0);
		assert.deepEqual(liveMdPlan(state).hide.map((r) => doc.slice(r.from, r.to)), ["[", "]", "(", destination, ")"]);
		assert.equal(linkAt(state, doc.indexOf(label) + 2), destination);
		assert.equal(linkAt(state, doc.lastIndexOf(destination) + 2), destination);
	}
	const unsafe = "[https://label.test](javascript:alert(1))";
	assert.equal(linkAt(stateAt(unsafe, 0), 5), null, "a URL label never overrides an unsafe destination");
});

test("tables widgetize when the caret is outside, stay raw on keyboard entry", () => {
	const doc = "before\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nafter";
	const out = liveMdPlan(stateAt(doc, 0));
	assert.equal(out.tables.length, 1);
	const table = out.tables[0];
	assert.equal(doc.slice(table.from, table.to).startsWith("| a |"), true);
	// Header + body rows with editable cells; the delimiter row is structure.
	assert.deepEqual(
		table.rows.map((r) => [r.header, r.cells.map((c) => c.text)]),
		[
			[true, ["a", "b"]],
			[false, ["1", "2"]],
		],
	);
	// Cell ranges are table-relative and slice back to their own text.
	const src = doc.slice(table.from, table.to);
	for (const row of table.rows)
		for (const cell of row.cells) assert.equal(src.slice(cell.from, cell.to).trim(), cell.text);
	assert.equal(liveMdPlan(stateAt(doc, doc.indexOf("| 1") + 2)).tables.length, 0);
});

test("empty cells stay editable slots; escaped pipes display unescaped", () => {
	const doc = "| a\\|b |  |\n|---|---|\n| 1 | 2 |\n\nz";
	const table = liveMdPlan(stateAt(doc, doc.length)).tables[0];
	assert.deepEqual(table.rows[0].cells.map((c) => c.text), ["a|b", ""]);
});

test("a table cell carries its inline markdown, parsed; its text stays the source", () => {
	const doc =
		"| Item | Price |\n|---|---|\n| **Subtotal** | `696.00` \\* |\n| [terms](https://x.test) *net* ~~old~~ | a \\| b |\n| [x](javascript:alert(1)) | <b>h</b> |\n\nz";
	const rows = liveMdPlan(stateAt(doc, doc.length)).tables[0].rows;
	const text = (t: string) => ({ kind: "text", text: t });
	assert.deepEqual(rows[1].cells[0], { ...rows[1].cells[0], text: "**Subtotal**", inline: [{ kind: "strong", children: [text("Subtotal")] }] });
	// An escape is its character; a code span is its content.
	assert.deepEqual(rows[1].cells[1].inline, [{ kind: "code", text: "696.00" }, text(" *")]);
	assert.deepEqual(rows[2].cells[0].inline, [
		{ kind: "link", url: "https://x.test", children: [text("terms")] },
		text(" "),
		{ kind: "em", children: [text("net")] },
		text(" "),
		{ kind: "strike", children: [text("old")] },
	]);
	assert.deepEqual(rows[2].cells[1].inline, [text("a | b")]);
	// A link the canvas would not open keeps its label and goes nowhere; HTML is text.
	assert.deepEqual(rows[3].cells[0].inline, [{ kind: "link", url: null, children: [text("x")] }]);
	assert.deepEqual(rows[3].cells[1].inline, [text("<b>h</b>")]);
	assert.deepEqual(rows[0].cells[0].inline, [text("Item")]);
	// Brackets around a word are not a link's marks unless a destination follows.
	const noted = "| a |\n|---|\n| see [1] and [sic] |\n\nz";
	assert.deepEqual(liveMdPlan(stateAt(noted, noted.length)).tables[0].rows[1].cells[0].inline, [text("see [1] and [sic]")]);
});

test("bullets render as •, ordered numbers and touched lines stay raw", () => {
	const doc = "- a\n- b\n\n1. one\nx";
	const atEnd = liveMdPlan(stateAt(doc, doc.length));
	assert.equal(atEnd.bullets.length, 2); // ordered \"1.\" untouched
	assert.equal(liveMdPlan(stateAt(doc, 2)).bullets.length, 1); // caret on line 1 reveals it
});

test("task markers become checkboxes; their '- ' hides; toggle char is at from+1", () => {
	const doc = "- [ ] milk\n- [x] eggs\nz";
	const plan = liveMdPlan(stateAt(doc, doc.length));
	assert.deepEqual(plan.tasks.map((t) => t.checked), [false, true]);
	assert.deepEqual(plan.tasks.map((t) => doc[t.from + 1]), [" ", "x"]);
	assert.deepEqual(hidden(doc, doc.length), ["- ", "- "]); // the bullets fold into the checkbox
	assert.equal(plan.bullets.length, 0);
});

test("blockquotes keep their bar always, marks hide only when untouched", () => {
	const doc = "> quoted\n\nplain";
	const away = liveMdPlan(stateAt(doc, doc.length));
	assert.deepEqual(away.quoteLines, [0]);
	assert.deepEqual(hidden(doc, doc.length), ["> "]);
	const inside = liveMdPlan(stateAt(doc, 3));
	assert.deepEqual(inside.quoteLines, [0]); // bar stays
	assert.deepEqual(hidden(doc, 3), []); // mark revealed
});

test("images widgetize with url+alt; unsafe schemes stay raw text", () => {
	const doc = "![a cat](https://x.test/c.png)\n\n![bad](javascript:alert(1))\n\nend";
	const plan = liveMdPlan(stateAt(doc, doc.length));
	assert.equal(plan.images.length, 1);
	assert.equal(plan.images[0].url, "https://x.test/c.png");
	assert.equal(plan.images[0].alt, "a cat");
});

test("horizontal rules render except the frontmatter opener", () => {
	const doc = "x\n\n---\n\ny";
	assert.equal(liveMdPlan(stateAt(doc, 0)).rules.length, 1);
	const fm = "---\npi: v1\nsession: s\n---\n\nbody";
	assert.equal(liveMdPlan(stateAt(fm, fm.length)).rules.length, 0);
});

test("linkAt resolves links and autolinks, filters unsafe schemes", () => {
	const doc = "see [label](https://x.test) or <https://auto.test> or [evil](javascript:alert(1))";
	const state = stateAt(doc, 0);
	assert.equal(linkAt(state, doc.indexOf("label") + 2), "https://x.test");
	assert.equal(linkAt(state, doc.indexOf("auto") + 2), "https://auto.test");
	assert.equal(linkAt(state, doc.indexOf("evil") + 2), null);
	assert.equal(linkAt(state, 1), null); // plain text
});

test("linkAt opens email destinations and bare GFM URLs, not URLs inside code", () => {
	const doc = "[Email](mailto:hello@example.com) https://piary.example <https://wa.me/15555550100> " +
		"[Signal](https://signal.me/#eu/contact) [Site](<https://example.com/path>) " +
		"`https://code.test`\n\n```\nhttps://fenced.test\n```";
	const state = stateAt(doc, 0);
	// A null URL is a position where no link is navigable (inline code, a fence).
	const cases: readonly (readonly [label: string, url: string | null])[] = [
		["Email", "mailto:hello@example.com"],
		["https://piary", "https://piary.example"],
		["https://wa.me", "https://wa.me/15555550100"],
		["Signal", "https://signal.me/#eu/contact"],
		["Site", "https://example.com/path"],
		["https://code", null],
		["https://fenced", null],
	];
	for (const [label, url] of cases) assert.equal(linkAt(state, doc.indexOf(label) + 2), url, label);
});

test("email links are navigable but never become image sources", () => {
	assert.equal(safeLinkUrl("mailto:hello@example.com"), "mailto:hello@example.com");
	assert.equal(safeLinkUrl("<https://example.com>"), "https://example.com");
	for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "mailto:", "mailto:x\ny"])
		assert.equal(safeLinkUrl(url), null, url);
	assert.equal(safeUrl("mailto:hello@example.com"), null);
	const doc = "![not an image](mailto:hello@example.com)\n\nend";
	assert.deepEqual(liveMdPlan(stateAt(doc, doc.length)).images, []);
});

test("safeUrl: http(s) and relative pass, script schemes never", () => {
	assert.equal(safeUrl("https://x.test/a"), "https://x.test/a");
	assert.equal(safeUrl("./img.png"), "./img.png");
	assert.equal(safeUrl("/img.png"), "/img.png");
	assert.equal(safeUrl("javascript:alert(1)"), null);
	assert.equal(safeUrl("data:text/html,x"), null);
});

