// Running a prompt anywhere — run `pnpm build` first, then
// `node --test tests/unit/run-at.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, NOTE_MARKER, BLOCK_MARKER } from "../../dist/document/format.js";
import { promptAt, tailPrompt, promptEnd, historyAbove, historyOf, answerRange, beginTurnAt, runAnchor, attachmentsAbove, promptPrefixes, subsessionInsert } from "../../dist/document/run.js";

// Three blocks: two answered prompts and a pending tail.
const MD = [
	"Q1",
	"",
	"<!-- pi -->",
	"",
	"A1",
	"",
	"<!-- you -->",
	"",
	"Q2",
	"",
	"<!-- pi:thinking -->",
	"",
	"hmm",
	"",
	"<!-- pi -->",
	"",
	"A2",
	"",
	"<!-- you -->",
	"",
	"",
].join("\n");

const segs = (md: string) => parseDocument(md).segments;

test("the document under test has the shape the rest of these assume", () => {
	assert.deepEqual(segs(MD).map((s) => s.kind), ["user", "assistant", "user", "thinking", "assistant", "user"]);
});

// -- which prompt --------------------------------------------------------------

test("promptAt finds the prompt the caret sits in", () => {
	const s = segs(MD);
	assert.equal(promptAt(s, s[0].bodyFrom + 1), 0);
	assert.equal(promptAt(s, s[2].bodyFrom + 1), 2);
	assert.equal(promptAt(s, s[5].from), 5);
});

test("a caret in a reply is not in the prompt above it", () => {
	// Re-running is destructive: it must never be a near-miss.
	const s = segs(MD);
	assert.equal(promptAt(s, s[1].bodyFrom + 1), -1);
	assert.equal(promptAt(s, s[3].bodyFrom + 1), -1);
});

test("tailPrompt is the pending slot, and -1 when the page ends elsewhere", () => {
	assert.equal(tailPrompt(segs(MD)), 5);
	assert.equal(tailPrompt(segs("Q1\n\n<!-- pi -->\n\nA1\n")), -1);
});

test("with no caret prompt the tail is the fallback — today's behaviour", () => {
	const s = segs(MD);
	const caret = promptAt(s, s[1].bodyFrom + 1); // in a reply
	assert.equal(caret >= 0 ? caret : tailPrompt(s), 5);
});

// -- history above -------------------------------------------------------------

test("historyAbove is everything before the prompt", () => {
	const s = segs(MD);
	assert.equal(historyAbove(MD, s[2]), "Q1\n\n<!-- pi -->\n\nA1\n\n");
	assert.equal(historyAbove(MD, s[0]), "");
});

test("historyAbove of the tail matches what the old tail-only rule produced", () => {
	const s = segs(MD);
	const last = s.at(-1);
	const old = last?.kind === "user" ? MD.slice(0, last.from) : MD;
	assert.equal(historyAbove(MD, s[tailPrompt(s)]), old);
});

test("a null segment means the whole document is history", () => {
	assert.equal(historyAbove(MD, null), MD);
});

// -- the answer ----------------------------------------------------------------

test("answerRange spans the reply and stops at the next prompt", () => {
	const s = segs(MD);
	const r = answerRange(s, 0);
	assert.ok(r, "the first prompt has an answer under it");
	assert.deepEqual(r, { from: s[1].from, to: s[1].to });
	assert.equal(MD.slice(r.from, r.to).trim(), "<!-- pi -->\n\nA1");
});

test("answerRange covers a multi-segment answer", () => {
	const s = segs(MD);
	const r = answerRange(s, 2);
	assert.ok(r, "the second prompt has an answer under it");
	assert.equal(MD.slice(r.from, r.to).trim(), "<!-- pi:thinking -->\n\nhmm\n\n<!-- pi -->\n\nA2");
});

test("a prompt with no answer under it has no range — that is what makes it a run, not a re-run", () => {
	assert.equal(answerRange(segs(MD), 5), null);
});

test("answerRange stops at page material, not just at prompts", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${NOTE_MARKER}\n\naside\n`;
	const s = segs(md);
	assert.deepEqual(s.map((x) => x.kind), ["user", "assistant", "note"]);
	assert.deepEqual(answerRange(s, 0), { from: s[1].from, to: s[1].to });
});

test("answerRange stops at a fold marker — it belongs to what follows", () => {
	const md = `Q1\n\n<!-- pi -->\n\nA1\n\n${BLOCK_MARKER}\n\n<!-- you -->\n\nfollow-up\n`;
	const s = segs(md);
	assert.deepEqual(answerRange(s, 0), { from: s[1].from, to: s[1].to });
});

test("cutting the answer leaves a document that still parses, prompt offsets intact", () => {
	const s = segs(MD);
	const r = answerRange(s, 0);
	assert.ok(r, "the first prompt has an answer to cut");
	const cut = MD.slice(0, r.from) + MD.slice(r.to);
	assert.deepEqual(segs(cut).map((x) => x.kind), ["user", "user", "thinking", "assistant", "user"]);
	assert.equal(segs(cut)[0].from, s[0].from); // above the cut, nothing moved
});

// -- where the run region opens -------------------------------------------------

test("promptEnd is just past the prompt's own text", () => {
	const s = segs(MD);
	// bodyFrom sits on the newline after the marker line, so the slice keeps a
	// leading blank — what matters is that the offset lands after the last
	// inked character, which is where the machine's region opens.
	assert.equal(MD.slice(s[2].bodyFrom, promptEnd(MD, s[2])).trim(), "Q2");
	assert.ok(MD.slice(0, promptEnd(MD, s[2])).endsWith("Q2"));
	assert.equal(MD.slice(0, promptEnd(MD, s[0])), "Q1");
});

test("promptEnd ignores the blank lines a marker is padded with", () => {
	const s = segs(MD);
	assert.equal(MD[promptEnd(MD, s[0])], "\n");
});

// -- opening the machine's region ------------------------------------------------

test("at the end of the page the region is followed by a fresh prompt slot", () => {
	const md = "Q1";
	const r = beginTurnAt(md, md.length);
	assert.equal(r.doc, "Q1\n\n<!-- pi -->\n\n<!-- you -->\n\n");
	assert.equal(r.doc.slice(r.msgAnchor, r.tailAnchor), "<!-- pi -->\n\n");
});

test("beginTurnAt at the document end matches what the old tail-only path produced", () => {
	const md = `${MD}   \n\n`;
	const trimmed = md.replace(/\s+$/, "");
	const r = beginTurnAt(md, md.length);
	assert.equal(r.doc, `${trimmed}\n\n<!-- pi -->\n\n<!-- you -->\n\n`);
	assert.equal(r.msgAnchor, trimmed.length + 2);
});

test("mid-page the region opens under its own prompt and everything below stays", () => {
	const s = segs(MD);
	const answer = answerRange(s, 0);
	assert.ok(answer, "the first prompt has an answer to cut");
	const cut = MD.slice(0, answer.from) + MD.slice(answer.to);
	const prompt = segs(cut)[0];
	assert.ok(prompt, "the cut document still opens with the prompt");
	const r = beginTurnAt(cut, promptEnd(cut, prompt));
	assert.deepEqual(segs(r.doc).map((x) => x.kind), ["user", "assistant", "user", "thinking", "assistant", "user"]);
	assert.equal(r.doc.slice(r.msgAnchor, r.tailAnchor), "<!-- pi -->\n\n");
	// Q2 and its answer are still below, untouched.
	assert.ok(r.doc.slice(r.tailAnchor).startsWith("<!-- you -->\n\nQ2"));
});

test("streaming into a mid-page region leaves the page below it alone", () => {
	const s = segs(MD);
	const r = beginTurnAt(MD, promptEnd(MD, s[5])); // the pending tail
	const below = r.doc.slice(r.tailAnchor);
	// The splice the host performs on every message_update.
	const spliced = r.doc.slice(0, r.msgAnchor) + "streaming text\n\n" + r.doc.slice(r.tailAnchor);
	assert.ok(spliced.endsWith(below));
});

// -- the anchor the send path actually uses ---------------------------------------

test("runAnchor lands past the whole prompt when a fold marker was spliced in above it", () => {
	// Exactly what ⌥⌘⏎ does: insert BLOCK_MARKER before the tail's `<!-- you -->`,
	// then open the machine's region under the prompt. Anchoring on the offsets
	// parsed BEFORE the splice cut the prompt mid-word and stranded its tail
	// below the reply ("So you are not my baby" → sent "So y").
	const prompt = "So you are not my baby";
	const doc = `Q1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n${prompt}`;
	const tail = parseDocument(doc).segments.at(-1);
	assert.ok(tail, "the prompt is the document's last segment");
	const base = `${doc.slice(0, tail.from)}${BLOCK_MARKER}\n\n${doc.slice(tail.from)}`;

	const at = runAnchor(base, true, -1);
	assert.ok(base.slice(0, at).endsWith(prompt), "the region opens after the last character of the prompt");
	assert.equal(base.slice(at), "", "…and nothing of it is left below");

	// The stale-offset anchor is what shipped broken — pin the difference.
	assert.notEqual(at, promptEnd(base, tail));
	assert.equal(base.slice(0, promptEnd(base, tail)).endsWith(prompt), false);
});

test("the run region opened at that anchor keeps the prompt whole", () => {
	const prompt = "So you are not my baby";
	const doc = `Q1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n${prompt}`;
	const tail = parseDocument(doc).segments.at(-1);
	assert.ok(tail, "the prompt is the document's last segment");
	const base = `${doc.slice(0, tail.from)}${BLOCK_MARKER}\n\n${doc.slice(tail.from)}`;
	const region = beginTurnAt(base, runAnchor(base, true, -1));
	const segs = parseDocument(region.doc).segments;
	assert.deepEqual(segs.map((s) => s.kind), ["user", "assistant", "block", "user", "assistant", "user"]);
	assert.equal(segs[3].text, prompt, "the prompt survives whole");
});

test("runAnchor at the tail with no splice is unchanged", () => {
	const s = segs(MD);
	assert.equal(runAnchor(MD, true, -1), promptEnd(MD, s[tailPrompt(s)]));
});

test("runAnchor for a mid-page prompt uses its own index", () => {
	const s = segs(MD);
	assert.equal(runAnchor(MD, false, 2), promptEnd(MD, s[2]));
});

test("runAnchor falls back to the end when the slot was stripped (a /command send)", () => {
	const s = segs(MD);
	const stripped = MD.slice(0, s[tailPrompt(s)].from);
	assert.equal(runAnchor(stripped, true, -1), stripped.length);
});

test("historyOf is a document's history: everything above its pending prompt", () => {
	// What a transcript rendered as a document is compared on: its trailing
	// prompt slot is where the next prompt goes, not history.
	assert.equal(historyOf("<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n"), "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n");
	// A document that ends on an answer is history to its last byte.
	assert.equal(historyOf("<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n"), "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n");
});


// The attachments a prompt carries are the `pi:file` segments directly above it.
const ATTACHED = [
	"<!-- pi:file image/png #aaa -->",
	"",
	"![one.png](/attachments/one-aaa.png)",
	"",
	"<!-- you -->",
	"",
	"Q1",
	"",
	"<!-- pi -->",
	"",
	"A1",
	"",
	"<!-- pi:file image/png #bbb -->",
	"",
	"![two.png](/attachments/two-bbb.png)",
	"",
	"<!-- pi:file application/pdf #ccc -->",
	"",
	"[paper.pdf](/attachments/paper-ccc.pdf)",
	"",
	"<!-- you -->",
	"",
	"Q2",
	"",
].join("\n");

test("attachmentsAbove: the refs directly above a prompt, in document order", () => {
	const s = segs(ATTACHED);
	const q2 = s.findIndex((seg) => seg.kind === "user" && seg.text === "Q2");
	assert.deepEqual(attachmentsAbove(s, q2), [
		{ id: "bbb", mime: "image/png", url: "/attachments/two-bbb.png", name: "two.png" },
		{ id: "ccc", mime: "application/pdf", url: "/attachments/paper-ccc.pdf", name: "paper.pdf" },
	]);
	// The first prompt carries only its own: the walk stops at the answer.
	const q1 = s.findIndex((seg) => seg.kind === "user" && seg.text === "Q1");
	assert.deepEqual(attachmentsAbove(s, q1).map((ref) => ref.id), ["aaa"]);
});

test("attachmentsAbove: none when the segment above is not a file", () => {
	assert.deepEqual(attachmentsAbove(segs(MD), tailPrompt(segs(MD))), []);
	assert.deepEqual(attachmentsAbove(segs(MD), 0), [], "nothing above the first segment");
});

test("attachmentsAbove: a file segment that does not parse into a ref is skipped", () => {
	const md = ATTACHED.replace("![two.png](/attachments/two-bbb.png)", "not a link");
	const s = segs(md);
	const q2 = s.findIndex((seg) => seg.kind === "user" && seg.text === "Q2");
	assert.deepEqual(attachmentsAbove(s, q2).map((ref) => ref.id), ["ccc"]);
});

// A `/subagent` send: the invocation becomes the subsession's card, and what
// was written before it stays the parent's unsent tail, below the card.
const CARD = '<!-- pi:view subsession #web-11112222 -->\n\n```json\n{"sid":"web-11112222"}\n```';
const apply = (md: string, edit: { from: number; to: number; insert: string }) => md.slice(0, edit.from) + edit.insert + md.slice(edit.to);

test("subsessionInsert: the card replaces the invocation, and the draft stays below it", () => {
	const md = "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\nnotes first\n/subagent say hi\n";
	const edit = subsessionInsert(md, segs(md), CARD, "notes first");
	const next = apply(md, edit);
	const after = segs(next).map((seg) => [seg.kind, seg.kind === "user" ? seg.text : seg.name ?? ""]);
	assert.deepEqual(after.slice(2), [
		["user", ""],
		["view", "subsession"],
		["user", "notes first"],
	]);
	assert.equal(edit.caret, next.length, "the caret stays on the draft");
	assert.ok(!next.includes("/subagent"));
	assert.ok(next.startsWith("<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n"), "the history above is untouched");
});

test("subsessionInsert: a page with no pending prompt gets its marker", () => {
	const md = "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n";
	const next = apply(md, subsessionInsert(md, segs(md), CARD, ""));
	assert.equal(next, "<!-- you -->\n\nQ1\n\n<!-- pi -->\n\nA1\n\n<!-- you -->\n\n" + CARD + "\n\n<!-- you -->\n\n");
});

// ── what a prompt carries in front of its text ──────────────────────────────

const SPIRAL = [
	"<!-- you -->\n\nDraw a spiral.\n\n",
	"<!-- pi -->\n\nA spiral.\n\n",
	"<!-- pi:artifact @spiral -->\n\n",
	"<!-- pi:cell js #tu -->\n\n```js\nconst turns = view(Inputs.range([1, 20], {value: 6}))\n```\n\n",
	"<!-- you -->\n\nMake it red.\n",
].join("");

test("a prompt under an artifact carries the cell values and the artifact it is about", () => {
	const index = tailPrompt(parseDocument(SPIRAL).segments);
	assert.deepEqual(promptPrefixes(SPIRAL, index, { turns: 15 }), ['[cell values] {"turns":15}', "[artifact] spiral — edit by id"]);
});

test("cell values already sent above, unchanged, are not sent again; nothing set sends nothing", () => {
	const sent = SPIRAL.replace("Make it red.", '[cell values] {"turns":15}\n\nMake it red.\n\n<!-- pi -->\n\nRed.\n\n<!-- you -->\n\nThicker.');
	const index = tailPrompt(parseDocument(sent).segments);
	// Two blocks under the artifact, the prompt is no longer about it.
	assert.deepEqual(promptPrefixes(sent, index, { turns: 15 }), []);
	assert.deepEqual(promptPrefixes(sent, index, { turns: 9 }), ['[cell values] {"turns":9}']);
	const plain = "<!-- you -->\n\nWhat is 2+2?\n";
	assert.deepEqual(promptPrefixes(plain, 0, {}), []);
});
