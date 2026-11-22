#!/usr/bin/env node
// The hard rules from docs/CODING_GUIDELINES.md that are mechanically checkable.
//
// Zero dependencies on purpose. The dependency policy (docs/HANDBOOK.md) admits the
// editor and renderer stack and a test runner; it does not admit a linter, and
// an ESLint install plus its TypeScript parser is a larger surface than the six
// rules below are worth. These are line-oriented checks over the source text,
// which is enough because every rule here is about a declaration or an import —
// not about types.
//
// Each rule's BASELINE is the count that exists today. A baseline above 0 is a
// debt with a number on it, not a permission: it may only ever go down. Lower it
// in the same commit that fixes a violation, so the gate ratchets.
//
// Run: pnpm lint        (also run by pnpm verify)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** Every file under `dir` whose extension is in `exts`, skipping ignored trees. */
function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walk(path, exts, out);
		else if (exts.includes(extname(path))) out.push(path);
	}
	return out;
}

/**
 * Strip comments so a rule cannot fire on prose about itself — line numbers are
 * preserved by blanking rather than deleting. The continuation case is why this
 * is line-oriented rather than one regex: a jsdoc block's middle lines start
 * with `*` and are not matched by the `/* … *\/` form once it has been blanked.
 */
function codeOnly(text: string): string {
	let inBlock = false;
	return text
		.split("\n")
		.map((line) => {
			let out = line.replace(/\/\*[\s\S]*?\*\//g, "");
			if (inBlock) {
				const end = out.indexOf("*/");
				if (end < 0) return "";
				inBlock = false;
				out = out.slice(end + 2);
			}
			const open = out.indexOf("/*");
			if (open >= 0) {
				inBlock = true;
				out = out.slice(0, open);
			}
			return out.replace(/\/\/.*$/, "");
		})
		.join("\n");
}

// The document modules that are pure by contract. The two omissions are
// renderers by design — see the pure-document-core rule.
const PURE_DOCUMENT_MODULES = [
	"format.ts",
	"run.ts",
	"cells.ts",
	"branch.ts",
	"modes.ts",
	"ask.ts",
	"live-views.ts",
	"keymap.ts",
];

const srcFiles = walk(join(ROOT, "src"), [".ts"]);
const demoTs = walk(join(ROOT, "demo"), [".ts"]);
const appFiles = walk(join(ROOT, "app"), [".ts"]);
const rustFiles = walk(join(ROOT, "src-tauri", "src"), [".rs"]);
// Every test, at every layer: the node tiers, the Playwright specs, the WDIO specs.
const testFiles = ["tests", "e2e", "e2e-app"].flatMap((dir) => walk(join(ROOT, dir), [".ts"]));
/** The node-side tools: their comments answer to the same policy as the app's. */
const toolFiles = ["evals", "pi-extension"].flatMap((dir) => walk(join(ROOT, dir), [".ts"]));

// The one module allowed to name @tauri-apps, and the Rust files allowed to name
// `tauri::`. Both lists are the seam (ADR 0014); adding to either is a design
// change, not a lint fix.
//
// `menu.rs` is on the list because a native menu IS Tauri surface — it builds
// `Submenu`s and installs an app-level handler, and there is no pure half to
// keep below it. What it does NOT do is decide anything: every item emits an
// event the page handles, so the verbs stay testable where they are
// implemented. A module that both names `tauri::` and makes decisions is the
// thing this rule is for.
//
// `teardown.rs` is on it for the same reason: it is the exit sequence's
// contact with the event loop — preventing an exit, emitting to a window,
// destroying one — and every decision it acts on is made in `exit.rs`, which
// names no `tauri::` and is where the sequence is tested (ADR 0019 §2).
const BRIDGE_MODULE = join(ROOT, "src", "bridge.ts");
const TAURI_AWARE_RUST = ["main.rs", "commands.rs", "menu.rs", "teardown.rs"];

/** One mechanically-checkable rule from the guidelines. */
interface Rule {
	name: string;
	/** What the gate prints when it fires: the rule, and where it is written down. */
	doc: string;
	files: readonly string[];
	/** Known violations today. May only ever go DOWN — see the ratchet below. */
	baseline: number;
	/** Reads the raw text instead of the comment-stripped form, for rules about comments. */
	raw?: boolean;
	test: (line: string) => boolean;
}

const rules: readonly Rule[] = [
	{
		// ADR 0008: `private` is erased, so the member name ships in dist/ and in
		// the app's minified bundle. A test that needs access gets a public
		// member documented as a harness seam — never a reach through the erasure.
		//
		// Exempt, per the ADR: `private constructor` (`#constructor` is not valid
		// syntax), and a Lit `@state()`/`@property()` field — those are the
		// element's reactive contract, and the decorator installs an accessor a
		// `#` field cannot be.
		name: "no-private-keyword",
		doc: "ADR 0008 — use #private; a test-reached member is public and documented as a seam",
		files: srcFiles,
		baseline: 0,
		test: (line: string) =>
			/(?:^|[\s(])private\s+(?:readonly\s+|static\s+|get\s+|set\s+|async\s+)*[#\w[]/.test(line) &&
			!/private\s+constructor\b/.test(line) &&
			!/@(?:state|property)\s*\(/.test(line),
	},
	{
		// TS compiles a numeric enum to a two-way map, so every member name ships
		// as a string literal no minifier can touch. `as const` object + type alias.
		name: "no-enum",
		doc: "CODING_GUIDELINES — use an `as const` object plus a same-name type alias",
		files: srcFiles,
		baseline: 0,
		test: (line: string) => /^\s*(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+\w/.test(line),
	},
	{
		// ADR 0006: the grammar-and-position modules are the layer the suite drives
		// directly and the layer a bug repro starts at. An effect import there
		// removes a test the next person would have written.
		//
		// command-doc.ts and views.ts are deliberately NOT in this set: they are
		// renderers that return an HTMLElement, and they live here because they
		// render a document construct rather than a component's own state. Do not
		// add a renderer to the list below to "fix" a violation — move the pure
		// half out of the renderer instead.
		name: "pure-document-core",
		doc: "ADR 0006 — format/run/cells/branch/modes/ask import no DOM, no fetch, no RPC",
		files: PURE_DOCUMENT_MODULES.map((name) => join(ROOT, "src", "document", name)),
		baseline: 0,
		test: (line: string) => /\b(?:document|window)\s*\.|[^.\w]fetch\(/.test(line),
	},
	{
		// Debug residue. What the user should see goes to a real surface, the
		// status line or the document (ADR 0011).
		name: "no-console-in-src",
		doc: "CODING_GUIDELINES — no console.* in src/; say it on a real surface",
		files: srcFiles,
		baseline: 0,
		test: (line: string) => /\bconsole\.\w+\(/.test(line),
	},
	{
		// Comment policy: a spec task number stops resolving once the spec is done,
		// so the tag becomes a dead reference; a ticket id and a path into the
		// git-ignored plans resolve for no reader of the repository at all. Cite an
		// ADR or a normative spec §.
		// This one reads the COMMENTS, so it runs on the raw text.
		name: "no-task-tags-in-comments",
		doc: "CODING_GUIDELINES comment policy — cite an ADR or a spec §, not a task number, a ticket id or a plan",
		files: [...srcFiles, ...appFiles, ...demoTs, ...testFiles, ...toolFiles, ...rustFiles],
		raw: true,
		baseline: 0,
		test: (line: string) => /(?:\/\/|\*|#).*(?:\b(?:fn-\d+(?:\.\d+)?\s+(?:task|step)\b|task\s+\.\d+|\bP\d+\s+of\s+fn-)|\bDIV-\d+\b|docs\/plans\/)/i.test(line),
	},
	{
		// ADR 0014: src/bridge.ts is the one place the page talks to Rust, which is
		// what lets a spec boot the page by replacing a single module. A second
		// importer also means a second place to audit against the capability
		// grants, and an ungranted call fails invisibly.
		name: "single-tauri-client",
		doc: "ADR 0014 — src/bridge.ts is the only importer of @tauri-apps/api",
		files: [...srcFiles, ...appFiles, ...demoTs].filter((f) => f !== BRIDGE_MODULE),
		baseline: 0,
		test: (line: string) => /["'`]@tauri-apps\//.test(line),
	},
	{
		// ADR 0058: frames and landmarks exist inside one module and nowhere else.
		// A second importer of the model's library is a second place a frame can
		// be held, and the promise that only numbers leave is no longer checkable
		// by reading one file.
		name: "single-mediapipe-client",
		doc: "ADR 0058 — app/face/mediapipe.ts is the only importer of @mediapipe/tasks-vision",
		files: [...srcFiles, ...appFiles, ...demoTs].filter((f) => !f.endsWith("app/face/mediapipe.ts")),
		baseline: 0,
		test: (line: string) => /["'`]@mediapipe\//.test(line),
	},
	{
		// ADR 0014: a module that reaches for `tauri::` has stopped being drivable
		// by `cargo test` without an app, which is the whole of layer 2 of the
		// testing strategy. Commands are the shell; the logic behind them takes
		// plain Rust types.
		name: "tauri-types-at-the-surface",
		doc: "ADR 0014 — only the surface modules (TAURI_AWARE_RUST) name tauri::; the modules behind them stay app-free",
		files: rustFiles.filter((f) => !TAURI_AWARE_RUST.some((name) => f.endsWith(name))),
		baseline: 0,
		test: (line: string) => /\btauri(?:_plugin_\w+)?::/.test(line),
	},
	{
		// The same rule as no-console-in-src, extended over the app's own entry:
		// it is page code, and the page has a real way to report (src/bridge.ts's
		// logLine, which src/forward-console.ts routes console through). A bare
		// console.* here is debug residue that reaches no one.
		name: "no-console-in-app",
		doc: "CODING_GUIDELINES — app/ reports through src/bridge.ts, not a bare console.*",
		files: appFiles,
		baseline: 0,
		test: (line: string) => /\bconsole\.\w+\(/.test(line),
	},
	{
		// A committed `.only` reduces its file to one test and the run still goes
		// green. Playwright's `forbidOnly` and mocha's catch it only in strict
		// mode, and node:test has no such switch — this catches it everywhere,
		// in the gate every change runs.
		name: "no-only-in-tests",
		doc: "docs/TEST_ARCHITECTURE.md §5 — a focused test is a local tool, never a commit",
		files: testFiles,
		baseline: 0,
		test: (line: string) => /\b(?:test|it|describe|suite)\.only\s*\(/.test(line),
	},
	{
		// A fixed wait guesses how long the page needs: a negative passes before
		// the page looked, or every run pays for a margin. A wait FOR something
		// polls it; a barrier before a negative is e2e/helpers/frames.ts. What is
		// left is time that has no event — each named for what it covers.
		name: "no-fixed-waits-in-specs",
		doc: "docs/TEST_ARCHITECTURE.md §5 — poll the observable, or use afterFrames; name what a wait covers",
		files: testFiles,
		baseline: 4,
		test: (line: string) => /\b(?:waitForTimeout|browser\.pause)\s*\(/.test(line),
	},
];

// Each rule's predicate, proved to fire and proved not to over-fire. A rule
// whose regex never matches is a vacuous gate that reports success forever
// (docs/TEST_ARCHITECTURE.md), and the three rules added for the native shell
// are new enough that nothing in the tree would have caught a typo in them.
const selfTests: readonly { rule: string; fires: readonly string[]; quiet: readonly string[] }[] = [
	{
		rule: "no-task-tags-in-comments",
		fires: ["// fn-3 task .7 moved this", "// the fix for DIV-123", " * see docs/plans/some-plan.md §2"],
		quiet: ['const ROOT_ISSUE = "DIV-540";', "// cells report a failure once (ADR 0031)"],
	},
	{
		rule: "single-tauri-client",
		fires: [
			'import { invoke } from "@tauri-apps/api/core";',
			"const { listen } = await import('@tauri-apps/api/event');",
		],
		quiet: ['import { logLine } from "../src/bridge.ts";', "// @tauri-apps/api is imported in src/bridge.ts"],
	},
	{
		rule: "single-mediapipe-client",
		fires: ['import { FaceLandmarker } from "@mediapipe/tasks-vision";', "await import('@mediapipe/tasks-vision');"],
		quiet: ['import type { FaceDetector } from "./detector.ts";', "// @mediapipe/tasks-vision is imported in app/face/mediapipe.ts"],
	},
	{
		rule: "tauri-types-at-the-surface",
		fires: ["use tauri::AppHandle;", "    pub fn go(app: tauri::AppHandle) {}", "use tauri_plugin_shell::ShellExt;"],
		quiet: ["use serde::Serialize;", "let tauri = 1;", "// tauri::AppHandle belongs in commands.rs"],
	},
	{
		rule: "no-only-in-tests",
		fires: ['test.only("x", () => {});', "\tit.only('y', async function () {", "describe.only(\"z\", () => {"],
		quiet: ['test("only once", () => {});', "// test.only( is what this forbids", "const only = 1;"],
	},
	{
		rule: "no-fixed-waits-in-specs",
		fires: ["await page.waitForTimeout(200);", "\tawait browser.pause(SECOND_WINDOW_GRACE_MS);"],
		quiet: ["await afterFrames(page);", "// page.waitForTimeout( is what this counts", "await expect.poll(() => x).toBe(1);"],
	},
	{
		rule: "no-console-in-app",
		fires: ["console.log(x);", "\tconsole.error(err);"],
		quiet: ['logLine("warn", message);', "// console.log is the thing this forbids"],
	},
];

let selfTestFailures = 0;
for (const check of selfTests) {
	const rule = rules.find((candidate) => candidate.name === check.rule);
	if (!rule) {
		console.error(`\n✗ self-test names an unknown rule: ${check.rule}`);
		selfTestFailures++;
		continue;
	}
	// The comment cases go through the same stripping the rule gets, so a rule
	// that would fire on prose about itself fails here.
	const visible = (line: string) => (rule.raw ? line : codeOnly(line));
	for (const line of check.fires) {
		if (!rule.test(visible(line))) {
			console.error(`\n✗ ${rule.name} does not fire on a violation it must catch:\n    ${line}`);
			selfTestFailures++;
		}
	}
	for (const line of check.quiet) {
		if (rule.test(visible(line))) {
			console.error(`\n✗ ${rule.name} fires on a line that is allowed:\n    ${line}`);
			selfTestFailures++;
		}
	}
}
if (!selfTestFailures) console.log(`✓ rule self-tests (${selfTests.length} rules)`);

let failed = 0;
for (const rule of rules) {
	const hits: string[] = [];
	for (const file of rule.files) {
		const text = readFileSync(file, "utf8");
		const lines = (rule.raw ? text : codeOnly(text)).split("\n");
		lines.forEach((line, i) => {
			if (rule.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}`);
		});
	}
	const over = hits.length - rule.baseline;
	if (over > 0) {
		failed++;
		console.error(`\n✗ ${rule.name}: ${hits.length} (baseline ${rule.baseline})`);
		console.error(`  ${rule.doc}`);
		for (const hit of hits.slice(0, 20)) console.error(`    ${hit}`);
		if (hits.length > 20) console.error(`    … and ${hits.length - 20} more`);
	} else if (over < 0) {
		// The ratchet: a baseline that is now too high hides the next regression.
		failed++;
		console.error(`\n✗ ${rule.name}: ${hits.length} violations but baseline is ${rule.baseline}.`);
		console.error(`  Lower the baseline to ${hits.length} in scripts/verify-hygiene.ts — the gate only ratchets down.`);
	} else {
		console.log(`✓ ${rule.name}${rule.baseline ? ` (${rule.baseline} known, must not grow)` : ""}`);
	}
}

// Files held to a line budget rather than a per-line rule. A count does not
// measure tangle, but it catches the one slide that matters most: an entry module
// growing back into a host (ADR 0024). Like a baseline above, a budget only goes
// down — lower it in the commit that shrinks the file.
const budgets: readonly { file: string; lines: number; doc: string }[] = [
	{
		file: "app/main.ts",
		lines: 110,
		doc: "ADR 0024 — app/main.ts only assembles: put it in a module and compose its fragment",
	},
];

/** The lines a budget counts: every line, the trailing newline's empty one excluded. */
const lineCount = (text: string) => text.replace(/\n$/, "").split("\n").length;

// The budget check, proved to fire before it is trusted: a text one line over
// must exceed, and one exactly at the budget must not.
const overBudget = (text: string, lines: number) => lineCount(text) > lines;
if (!overBudget("a\nb\nc\n", 2) || overBudget("a\nb\n", 2)) {
	console.error("\n✗ the file-budget check does not count lines as it should");
	selfTestFailures++;
}

for (const budget of budgets) {
	const lines = lineCount(readFileSync(join(ROOT, budget.file), "utf8"));
	if (lines > budget.lines) {
		failed++;
		console.error(`\n✗ ${budget.file}: ${lines} lines, budget ${budget.lines}`);
		console.error(`  ${budget.doc}`);
	} else if (lines < budget.lines) {
		failed++;
		console.error(`\n✗ ${budget.file}: ${lines} lines but the budget is ${budget.lines}.`);
		console.error(`  Lower the budget to ${lines} in scripts/verify-hygiene.ts — it only ratchets down.`);
	} else {
		console.log(`✓ ${budget.file} within its budget (${budget.lines} lines)`);
	}
}

// Every node test sits in exactly one tier directory, because the tier IS the
// directory: `pnpm test:smoke` runs `tests/unit` and `tests/contract` by glob, so
// a test file placed anywhere else is silently outside the development loop
// (docs/TEST_ARCHITECTURE.md §8). `tests/helpers/` holds no tests.
const TEST_TIERS = ["unit", "contract", "integration"];
const misplacedTest = (rel: string) => {
	const parts = rel.split("/");
	return parts.length !== 3 || parts[0] !== "tests" || !TEST_TIERS.includes(parts[1]!);
};
if (
	!misplacedTest("tests/stray.test.ts") ||
	!misplacedTest("tests/helpers/x.test.ts") ||
	!misplacedTest("tests/unit/deep/x.test.ts") ||
	misplacedTest("tests/unit/format.test.ts") ||
	!misplacedTest("tests/legacy/pool.test.ts")
) {
	console.error("\n✗ the test-tier check does not place files as it should");
	selfTestFailures++;
}
const misplaced = walk(join(ROOT, "tests"), [".ts"])
	.map((file) => relative(ROOT, file))
	.filter((rel) => rel.endsWith(".test.ts") && misplacedTest(rel));
if (misplaced.length) {
	failed++;
	console.error(`\n✗ test-in-a-tier: ${misplaced.length} test file(s) outside tests/{${TEST_TIERS.join(",")}}/`);
	console.error("  docs/TEST_ARCHITECTURE.md §8 — move each into the tier its subject belongs to");
	for (const rel of misplaced) console.error(`    ${rel}`);
} else {
	console.log("✓ test-in-a-tier");
}

process.exit(failed || selfTestFailures ? 1 : 0);
