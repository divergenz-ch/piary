// What the agent is told about drawing, held to a size.
//
// The `view` and `cell` descriptions and the system prompt are in pi's context
// on every turn, so each character is paid on every turn, and guidance grows
// one reasonable sentence at a time. Each ceiling below is one against regrowth, not
// a quota to fill, and raising one is a decision that owes a design run
// (`evals/README.md` §Design runs).
//
// The two tools' texts follow the draw mode (ADR 0044), and a mode exists so
// that pi never carries the other's teaching: free drawing names no a2ui, and
// a2ui mode does not call a cell the default.
//
// The system prompt and the skill are static files, the same whatever pi is
// told to draw with, so the skill describes payloads and cell semantics and
// routes nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { A2UI_GUIDE } from "../../pi-extension/a2ui-guide.ts";
import { type DrawMode, cellDescription, cellSnippet, viewDataHint, viewDescription, viewSnippet, viewTemplateHint } from "../../pi-extension/draw-mode.ts";

/** The smallest guide a design run has passed. */
const A2UI_GUIDE_MAX = 4478;
/** The length of the prompt before it knew of a2ui: the template costs it nothing. */
const SYSTEM_PROMPT_MAX = 3163;
/** The description before it knew of a2ui (1033), 200 to say what a cell is for,
 *  and the 119 of the sentence that leaves type and colour to the cell theme. */
const CELL_DESCRIPTION_MAX = 1352;
/** The paragraph on the face block as the face-format experiment measured it
 *  (`evals/spikes/face-format/guidance/face2.md`). In context only while the
 *  user has the face read, so it is outside `ALWAYS_ON_MAX`. */
const FACE_GUIDANCE_MAX = 1269;
/** Everything a mode keeps in context on every turn, as measured when the mode landed. */
const ALWAYS_ON_MAX: Record<DrawMode, number> = { a2ui: 9886, free: 5159 };

const read = (file: string) => readFileSync(new URL(`../../pi-extension/${file}`, import.meta.url), "utf8");

/** The texts the two tools register with, which is all of them that follows the mode. */
const toolTexts = (mode: DrawMode) => [viewDescription(mode), viewSnippet(mode), viewTemplateHint(mode), viewDataHint(mode), cellDescription(mode), cellSnippet(mode)];

test("what the view tool teaches about a2ui stays within its budget", () => {
	assert.ok(A2UI_GUIDE.length <= A2UI_GUIDE_MAX, `A2UI_GUIDE is ${A2UI_GUIDE.length} chars, over its budget of ${A2UI_GUIDE_MAX}`);
	assert.ok(viewDescription("a2ui").includes(A2UI_GUIDE), "in a2ui mode the view description no longer carries the guide");
});

test("the system prompt stays within its budget", () => {
	const length = read("system-prompt.md").length;
	assert.ok(length <= SYSTEM_PROMPT_MAX, `system-prompt.md is ${length} chars, over its budget of ${SYSTEM_PROMPT_MAX}`);
});

test("what pi is told about a face block stays within its budget, and names no feeling to read off a face", () => {
	const text = read("face-guidance.md");
	assert.ok(text.length <= FACE_GUIDANCE_MAX, `face-guidance.md is ${text.length} chars, over its budget of ${FACE_GUIDANCE_MAX}`);
	assert.match(text, /movements, not feelings/);
});

for (const mode of ["a2ui", "free"] as const) {
	test(`the cell tool's description stays within its budget in ${mode} mode`, () => {
		const { length } = cellDescription(mode);
		assert.ok(length <= CELL_DESCRIPTION_MAX, `the cell description is ${length} chars, over its budget of ${CELL_DESCRIPTION_MAX}`);
	});

	test(`what ${mode} mode keeps in context on every turn stays within its budget`, () => {
		const total = toolTexts(mode).reduce((sum, text) => sum + text.length, read("system-prompt.md").length);
		assert.ok(total <= ALWAYS_ON_MAX[mode], `${mode} mode carries ${total} chars on every turn, over its budget of ${ALWAYS_ON_MAX[mode]}`);
	});
}

test("free drawing teaches no a2ui", () => {
	const naming = toolTexts("free").filter((text) => /a2ui/i.test(text));
	assert.deepEqual(naming, [], "in free mode these texts of the view and cell tools name a2ui");
});

test("a cell is the default for what there is to look at in free drawing, and only there", () => {
	assert.match(cellDescription("free"), /\bdefault\b/);
	assert.doesNotMatch(cellDescription("a2ui"), /\bdefault\b/);
	assert.doesNotMatch(cellSnippet("a2ui"), /\bdefault\b/);
});

test("neither static text names a way of drawing", () => {
	// One file serves both modes, so a route written here is false in one of them.
	for (const file of ["SKILL.md", "system-prompt.md"]) {
		const lines = read(file)
			.split("\n")
			.flatMap((line, index) => (/a2ui/i.test(line) ? [index + 1] : []));
		assert.deepEqual(lines, [], `pi-extension/${file} names a2ui on these lines`);
	}
});
