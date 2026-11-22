// The headless-cell heuristic — run `node --test tests/unit/renders-nothing.test.ts`.
// Imports the .ts directly (node type stripping); no build step needed.
import test from "node:test";
import assert from "node:assert/strict";
import { rendersNothing } from "../../pi-extension/renders-nothing.ts";

/** One corpus row. Labelled so a row's columns do not widen to their union. */
type Row = readonly [source: string, mode: string, expected: boolean];

test("rendersNothing: corpus", () => {
	const corpus: readonly Row[] = [
		// declarations run headless — the hint should fire
		["const a = 1", "js", true],
		["let x = 2", "js", true],
		["var y = 3", "js", true],
		["function f() { return 1 }", "js", true],
		["async function f() {}", "js", true],
		["class A {}", "js", true],
		['import { mean } from "npm:d3-array"', "js", true],
		["const anim = (function* () { yield 1 })()", "js", true], // the classic footgun
		["// leading comment\nconst a = 1", "js", true],
		["/* block */ const a = 1", "js", true],
		// bare expressions display — no hint
		["1 + 1", "js", false],
		["(() => { return 1 })()", "js", false],
		["htl.html`<b>hi</b>`", "js", false],
		// display()/view() make declarations visible — no hint
		["const gain = view(Inputs.range())", "js", false],
		["const x = 1; display(x)", "js", false],
		// unterminated comment: syntax error's problem, not ours
		["/* never closed const a = 1", "js", false],
		// non-code modes never hint
		["const a = 1", "md", false],
		["# heading", "md", false],
		// ts mode behaves like js
		["const a: number = 1", "ts", true],
	];
	for (const [source, mode, expected] of corpus) {
		assert.equal(rendersNothing(source, mode), expected, `${mode}: ${source}`);
	}
});
