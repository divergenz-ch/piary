// CodeMirror's height map ignores vertical margins on lines and block
// widgets: a margin there makes posAtCoords land clicks a line away from
// the pointer. All vertical gaps inside the editor must be padding.
import { strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Exact class names only: .doc-view-header etc. are children INSIDE a
// widget, where margins are contained by the widget's padding.
const EDITOR_CHILD = /\.(cm-line|doc-fold|doc-view)(?![\w-])/;

test("no vertical margins on editor lines or block widgets", () => {
	const css = readFileSync(new URL("../../src/styles/document.css", import.meta.url), "utf8");
	const offenders = [];
	// ponytail: naive selector{body} split — enough for this hand-written file.
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!EDITOR_CHILD.test(selector) || selector.includes("::before")) continue;
		for (const [decl, value] of body.matchAll(/margin(?:-top|-bottom)?\s*:\s*([^;]+)/g)) {
			// `margin: 0 …` and `margin-top: 0` are fine; anything else is a gap.
			const vertical = value.trim().split(/\s+/)[0];
			if (vertical !== "0") offenders.push(`${selector.trim()} → ${decl.trim()}`);
		}
	}
	strictEqual(offenders.length, 0, `vertical margins break click mapping:\n${offenders.join("\n")}`);
});

// The `+` between cells, its drop band and its drop line all position
// themselves inside the gap BELOW the widget they hang on. All three read that
// height straight from `--doc-block-gap`, which is the padding a `.cm-line`
// carries as a block's first line — and an artifact frame is a block WIDGET, so
// it carries none of it. Its gap is `.doc-cell`'s own 0.75rem padding. The `+`
// centred itself in 2.5rem it did not have, landed 10px below the seam, and
// collided with the artifact's drag handle starting at 12px in the same 20px
// channel. The drop line landed inside the artifact and the drop band was three
// times the height of the gap it stood for.
//
// One variable answers "how tall is this gap", set per case. This keeps the
// three rules reading it rather than reaching for the constant again.
test("cell-gap chrome measures the gap it is in, not the block gap", () => {
	const css = readFileSync(new URL("../../src/styles/document.css", import.meta.url), "utf8");
	const GAP_CHROME = /\.doc-cell-gap(-plus|-zone|-over)?(?![\w-])/;
	const offenders = [];
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!GAP_CHROME.test(selector)) continue;
		for (const [decl] of body.matchAll(/[\w-]+\s*:[^;]*var\(--doc-block-gap\)[^;]*/g)) {
			// Defining the default in terms of the block gap is the point; USING
			// it to place something is the bug.
			if (/^\s*--doc-gap-height\s*:/.test(decl)) continue;
			offenders.push(`${selector.trim()} → ${decl.trim()}`);
		}
	}
	strictEqual(
		offenders.length,
		0,
		`gap chrome must use --doc-gap-height so a frame gap can differ:\n${offenders.join("\n")}`,
	);
});

// The text column and everything that lines up against it — the status bar, an
// alert, an extension's question — must be one number. They were four separate
// `42rem` literals, so widening the document meant finding all four, and
// missing one left the page crooked in a way only a screenshot would show.
test("everything that matches the text column reads --doc-measure", () => {
	const css = readFileSync(new URL("../../src/styles/document.css", import.meta.url), "utf8");
	// Deliberately narrower than the column (a hover card, the extension menu)
	// is a different intent and not covered here.
	const ALIGNS_TO_COLUMN = /\.(cm-content|doc-bar|doc-alert|doc-ui-request)(?![\w-])/;
	// The element ITSELF, not something inside it: `.doc-bar .doc-meter-track`
	// is a 9rem gauge that lives in the bar and has nothing to do with the
	// measure. Test the last compound of each comma-separated selector.
	const subject = (selector: string) =>
		selector
			.split(",")
			.map((part: string) => part.trim().split(/[\s>+~]+/).pop() ?? "")
			.some((last: string) => ALIGNS_TO_COLUMN.test(last));
	const offenders = [];
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!subject(selector)) continue;
		for (const [decl] of body.matchAll(/(?:max-)?width\s*:[^;]*/g)) {
			// `calc(100% - …)` viewport clamps and `fit-content` are not the measure.
			if (/var\(--doc-measure\)|100%|fit-content|auto/.test(decl)) continue;
			offenders.push(`${selector.trim()} → ${decl.trim()}`);
		}
	}
	strictEqual(offenders.length, 0, `hard-coded column width — use --doc-measure:\n${offenders.join("\n")}`);
});
