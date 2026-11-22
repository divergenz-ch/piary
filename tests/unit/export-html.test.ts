// A conversation as a page that reads without Piary (ADR 0066) — run `pnpm build` first, then `node --test tests/unit/export-html.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { type Drawn, exportBody, exportPage } from "../../dist/document/export-html.js";

const NONE: Drawn = { artifacts: new Map(), views: new Map(), images: new Map(), liveViews: new Set() };
const drawn = (given: Partial<Drawn>): Drawn => ({ ...NONE, ...given });

const doc = (...parts: string[]) => `---\npi: v1\nsession: notes\n---\n\n${parts.join("\n\n")}\n`;
const fence = (text: string, lang = "") => `\`\`\`${lang}\n${text}\n\`\`\``;

/** How many times `part` is in `whole`. */
const count = (whole: string, part: string) => whole.split(part).length - 1;

test("a prompt and its answer are drawn under the words the canvas labels them with, and the frontmatter is not", () => {
	const body = exportBody(doc("<!-- you -->", "how far is it?", "<!-- pi -->", "It is **42 km**."), NONE);
	assert.match(body, /<section class="px-seg px-you"><div class="px-role">you<\/div><div class="px-prose"><p>how far is it\?<\/p>/);
	assert.match(body, /<section class="px-seg px-pi"><div class="px-role">agent<\/div><div class="px-prose"><p>It is <strong>42 km<\/strong>\.<\/p>/);
	assert.doesNotMatch(body, /session: notes|pi: v1/);
});

test("the empty prompt a conversation ends on is not drawn", () => {
	const body = exportBody(doc("<!-- you -->", "hello", "<!-- pi -->", "hi", "<!-- you -->"), NONE);
	assert.equal(count(body, "px-you"), 1);
});

test("a note has no label, and an unasked reply says it was unasked", () => {
	const body = exportBody(doc("<!-- pi:note -->", "# Plan", "<!-- you -->", "ok", "<!-- pi -->", "done", "<!-- pi:aside -->", "you frowned"), NONE);
	assert.match(body, /<section class="px-seg px-note"><div class="px-prose"><h1>Plan<\/h1>/);
	assert.match(body, /<div class="px-role">agent · unasked<\/div><div class="px-prose"><p>you frowned<\/p>/);
});

test("HTML written in the conversation is text in the export, and a link that is no web or mail address keeps only its words", () => {
	const body = exportBody(
		doc("<!-- you -->", 'look <script>alert(1)</script> <img src=x onerror="alert(2)"> [here](javascript:alert(3)) and [there](https://example.org/a?b=1&c=2) and <b>bold</b>'),
		NONE,
	);
	assert.doesNotMatch(body, /<script|<img|<b>|javascript:/);
	assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
	assert.match(body, /<a href="https:\/\/example\.org\/a\?b=1&amp;c=2" rel="noreferrer noopener">there<\/a>/);
	assert.match(body, / here and /);
});

test("a stored picture is in the file as its bytes, wherever the document shows it", () => {
	const images = new Map([["shot-a1.png", "data:image/png;base64,AAAA"]]);
	const body = exportBody(doc("<!-- pi:file image/png #shot-a1.png -->", "![shot.png](/attachments/shot-a1.png)", "<!-- you -->", "again ![the shot](/attachments/shot-a1.png)"), drawn({ images }));
	assert.match(body, /<section class="px-seg px-file"><div class="px-role">image\/png<\/div><img src="data:image\/png;base64,AAAA" alt="shot\.png"><\/section>/);
	assert.match(body, /again <img src="data:image\/png;base64,AAAA" alt="the shot">/);
});

test("a picture the export does not hold is named, never asked of a server", () => {
	const body = exportBody(
		doc("<!-- pi:file application/pdf #paper-b2.pdf -->", "[paper.pdf](/attachments/paper-b2.pdf)", "<!-- you -->", "see ![gone](/attachments/gone-c3.png) and ![far](https://example.org/far.png)"),
		NONE,
	);
	assert.doesNotMatch(body, /<img/);
	assert.match(body, /<div class="px-role">application\/pdf<\/div><p class="px-quiet">paper\.pdf, not in this file\.<\/p>/);
	assert.match(body, /<span class="px-missing">gone<\/span>/);
	assert.match(body, /<a href="https:\/\/example\.org\/far\.png" rel="noreferrer noopener">far<\/a>/);
});

test("a step is folded under its label, an error is open, and what the canvas does not draw is not drawn", () => {
	const body = exportBody(
		doc(
			"<!-- you -->",
			"list them",
			"<!-- pi:thinking -->",
			"they want <files>",
			'<!-- pi:tool budget #b1 -->\n\n' + fence('{ "minutes": 2 }', "json"),
			"<!-- pi:result #b1 -->\n\n" + fence("noted"),
			'<!-- pi:tool bash #t1 -->\n\n' + fence('{ "command": "ls <dir>" }', "json"),
			"<!-- pi:result #t1 -->\n\n" + fence("a.txt"),
			'<!-- pi:tool bash #t2 -->\n\n' + fence('{ "command": "cat nope" }', "json"),
			"<!-- pi:result #t2 error -->\n\n" + fence("no such file"),
			// The `cell` tool's acknowledgement: a result no call in the document owns.
			"<!-- pi:result #orphan -->\n\n" + fence("ok"),
		),
		NONE,
	);
	assert.match(body, /<details class="px-step"><summary class="px-role">thinking<\/summary><div class="px-thinking">they want &lt;files&gt;<\/div><\/details>/);
	assert.match(body, /<details class="px-step"><summary class="px-role">bash<\/summary><pre class="px-code"><code>\{ &quot;command&quot;: &quot;ls &lt;dir&gt;&quot; \}<\/code><\/pre><\/details>/);
	assert.match(body, /<details class="px-step"><summary class="px-role">output<\/summary><pre class="px-code"><code>a\.txt<\/code><\/pre><\/details>/);
	assert.match(body, /<details class="px-step px-error" open><summary class="px-role">error<\/summary><pre class="px-code"><code>no such file<\/code>/);
	assert.doesNotMatch(body, /budget|noted|minutes/);
	assert.equal(count(body, "<details"), 5, "the acknowledgement is no step");
});

test("a view is what the page drew of it, and its payload when the page drew nothing", () => {
	const view = (id: string) => `<!-- pi:view table #${id} -->\n\n` + fence('{ "rows": [["<a>"]] }', "json");
	const md = doc("<!-- you -->", "show", view("v1"), view("v2"));
	const body = exportBody(md, drawn({ views: new Map([["v1", '<div class="doc-view"><table></table></div>']]) }));
	assert.match(body, /<div class="px-role">table<\/div><div class="px-canvas"><div class="doc-view"><table><\/table><\/div><\/div>/);
	assert.match(body, /<div class="px-role">table<\/div><pre class="px-code"><code>\{ &quot;rows&quot;: \[\[&quot;&lt;a&gt;&quot;\]\] \}<\/code><\/pre>/);
});

test("a terminal's place says one ran, and where what it printed is", () => {
	const terminal = (id: string) => `<!-- pi:view terminal #${id} -->\n\n` + fence("{}", "json");
	const md = doc("<!-- you -->", "run it", terminal("t1"), "<!-- pi:result #t1 -->\n\n" + fence("built"), terminal("t2"));
	const body = exportBody(md, drawn({ liveViews: new Set(["terminal"]) }));
	assert.match(body, /A terminal ran here\. What it showed is not kept\. What the command printed is in the output step below\.<\/p>/);
	assert.match(body, /A terminal ran here\. What it showed is not kept\.<\/p>/);
	assert.doesNotMatch(body, /\{\}/);
});

const cell = (id: string, source: string, group = "") => `<!-- pi:cell js #${id}${group} -->\n\n` + fence(source, "js");

test("a cell is its output over its source, folded, standing where the cell is", () => {
	const md = doc("<!-- you -->", "draw", "<!-- pi -->", "Here:", cell("c1", "1 < 2"), "<!-- pi -->", "Done.");
	const body = exportBody(md, drawn({ artifacts: new Map([["#c1", '<div class="artifact">true</div>']]) }));
	assert.match(
		body,
		/<figure class="px-artifact"><div class="px-output px-canvas"><div class="artifact">true<\/div><\/div><details class="px-source"><summary class="px-role">cell · source<\/summary><div class="px-code-name">js #c1<\/div><pre class="px-code"><code>1 &lt; 2<\/code><\/pre><\/details><\/figure>/,
	);
	assert.ok(body.indexOf("Here:") < body.indexOf("px-artifact") && body.indexOf("px-artifact") < body.indexOf("Done."));
});

test("an artifact is one frame where it was first written, with each member's current source and no earlier definition", () => {
	const md = doc(
		"<!-- you -->",
		"draw",
		"<!-- pi:artifact @chart -->",
		cell("data", "const rows = [1]", " @chart"),
		cell("plot", "rows.length", " @chart"),
		"<!-- you -->",
		"more rows",
		"<!-- pi:artifact @chart -->",
		cell("data", "const rows = [1, 2]", " @chart"),
	);
	const body = exportBody(md, drawn({ artifacts: new Map([["@chart", "<svg></svg>"]]) }));
	assert.equal(count(body, "px-artifact"), 1);
	assert.match(body, /<summary class="px-role">cell @chart · source<\/summary>/);
	assert.match(body, /js #data<\/div><pre class="px-code"><code>const rows = \[1, 2\]<\/code>/);
	assert.doesNotMatch(body, /const rows = \[1\]</);
	assert.ok(body.indexOf("px-artifact") < body.indexOf("more rows"), "it stands where it was first written");
});

test("a cell that was not drawn says so above its source", () => {
	const body = exportBody(doc("<!-- you -->", "draw", cell("c1", "while (true) {}")), NONE);
	assert.match(body, /<p class="px-quiet">Not drawn: this had not finished running when the conversation was exported\.<\/p><details class="px-source">/);
	assert.match(body, /while \(true\) \{\}/);
});

test("the page carries its styles, runs no script, asks for nothing, and a title cannot end its own element", () => {
	const page = exportPage({ title: "a </title><script>x", css: "p{color:red}</style><script>y", body: "<p>hello</p>" });
	assert.match(page, /^<!doctype html>/);
	assert.match(page, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">/);
	assert.match(page, /<title>a &lt;\/title&gt;&lt;script&gt;x<\/title>/);
	assert.match(page, /<style>p\{color:red\}<\\\/style><script>y<\/style>/);
	assert.match(page, /<body class="px-page">\n<article class="piary-export">\n<p>hello<\/p>\n<\/article>/);
	assert.equal(count(page, "</style>"), 1);
});
