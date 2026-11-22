// Inline questions: where a dialog mounts, and the card it builds from the
// pending plan_mode_question call. Run `pnpm build` first, then
// `node --test tests/unit/ask.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { askAnchor, questionCard, type AskRequest } from "../../dist/document/ask.js";
import { parseDocument } from "../../dist/document/format.js";

const QUESTIONS = {
	questions: [
		{
			id: "scope",
			header: "Scope",
			question: "How far should the refactor go?",
			options: [
				{ label: "Just the parser", description: "Smallest diff, leaves callers alone." },
				{ label: "Parser + callers", description: "One pass, bigger review." },
			],
		},
		{
			id: "tests",
			header: "Tests",
			question: "Add tests now?",
			options: [
				{ label: "Yes", description: "Slower, safer." },
				{ label: "No", description: "Faster, riskier." },
			],
		},
	],
};

const CALL = `<!-- pi:tool plan_mode_question #c1 -->\n\n\`\`\`json\n${JSON.stringify(QUESTIONS, null, 2)}\n\`\`\``;
const DOC = `<!-- you -->\n\nplan it\n\n${CALL}\n\n<!-- you -->\n\n`;

/** Exactly what question-tool.ts sends for question `n` (0-based). */
const requestFor = (n: number): AskRequest => {
	const q = QUESTIONS.questions[n];
	assert.ok(q, `no question ${n} in the fixture`);
	return {
		method: "select",
		title: `${q.header}: ${q.question}`,
		options: [
			...q.options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`),
			`${q.options.length + 1}. Other (free-form)`,
		],
	};
};

const cardFor = (md: string, req: AskRequest) => questionCard(md, parseDocument(md).segments, req);

test("the anchor sits below the pending tool call, not in the empty prompt", () => {
	const at = askAnchor(DOC, parseDocument(DOC).segments);
	assert.equal(DOC.slice(at - 3, at), "```"); // end of the call's fence line
	assert.equal(DOC[at], "\n"); // a line end, where a block widget is legal
	assert.ok(at < DOC.lastIndexOf("<!-- you -->")); // never inside the empty prompt
});

test("an empty document anchors at its end", () => {
	assert.equal(askAnchor("", []), 0);
	const md = "<!-- you -->\n\n";
	assert.equal(askAnchor(md, parseDocument(md).segments), md.length);
});

test("a matching select request becomes the pending question's card", () => {
	const card = cardFor(DOC, requestFor(0));
	assert.ok(card, "the pending call matches the request");
	assert.equal(card.header, "Scope");
	assert.equal(card.question, "How far should the refactor go?");
	assert.deepEqual(
		card.options.map((o) => [o.label, o.description]),
		[
			["Just the parser", "Smallest diff, leaves callers alone."],
			["Parser + callers", "One pass, bigger review."],
		],
	);
	assert.ok(card.other, "a select card always offers the free-form option");
	assert.equal(card.other.label, "Other (free-form)");
	assert.equal(card.index, 1);
	assert.equal(card.total, 2);
	const second = cardFor(DOC, requestFor(1));
	assert.ok(second, "the second question matches the same pending call");
	assert.equal(second.index, 2);
});

test("every value is the verbatim choice string the extension will index", () => {
	const req = requestFor(0);
	const card = cardFor(DOC, req);
	assert.ok(card, "the pending call matches the request");
	const options = req.options;
	assert.ok(options, "a select request carries its options");
	card.options.forEach((o, i) => assert.equal(o.value, options[i]));
	assert.ok(card.other, "a select card always offers the free-form option");
	assert.equal(card.other.value, options[options.length - 1]);
});

test("an answered call, a mismatched title, or a wrong option count give no card", () => {
	const answered = `${DOC}<!-- pi:result #c1 -->\n\n\`\`\`\nok\n\`\`\`\n`;
	assert.equal(cardFor(answered, requestFor(0)), null);
	assert.equal(cardFor(DOC, { ...requestFor(0), title: "Scope: something else" }), null);
	const short = requestFor(0);
	assert.ok(short.options, "a select request carries its options");
	assert.equal(cardFor(DOC, { ...short, options: short.options.slice(0, 2) }), null);
	assert.equal(cardFor(DOC, { method: "confirm", title: "Proceed?" }), null);
	assert.equal(cardFor("<!-- you -->\n\nno call here\n", requestFor(0)), null);
});
