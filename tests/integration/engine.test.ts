// Notebook engine (integration plan, phase 1) — run `pnpm build` first, then
// `node --test tests/integration/engine.test.ts`.
//
// notebook-kit's /runtime entry reads `document` at import time, so the shim
// must land before the dynamic imports below (static imports would hoist
// above it — only node builtins are imported statically).
import test from "node:test";
import assert from "node:assert/strict";
// Type-only — erased, so it cannot hoist a module above the shim below.
import type { CellState, NotebookEngine as NotebookEngineClass } from "../../dist/notebook/engine.js";

// The shim stands in for a browser realm, so it is installed through a bag
// keyed by runtime name — the same door `tests/helpers/editor.ts` uses, and the
// only one that does not demand a whole Document and Event per DOM lib.
type Globals = Record<string, unknown>;
const g: Globals = globalThis;

g.document = {
	querySelector: () => null,
	body: {},
	// `state()` builds a hidden element to carry its value; the runtime only
	// ever reads `.value` and listens for `input` on it.
	createElement: () => {
		const listeners = new Set<(event: unknown) => void>();
		return {
			style: {},
			value: undefined,
			addEventListener: (_type: string, fn: (event: unknown) => void) => listeners.add(fn),
			removeEventListener: (_type: string, fn: (event: unknown) => void) => listeners.delete(fn),
			dispatchEvent: (event: unknown) => (listeners.forEach((fn) => fn(event)), true),
		};
	},
};
g.Event = class Event {
	readonly type: string;
	constructor(type: string) {
		this.type = type;
	}
};
// A rAF that never fires — Chrome's occluded-window behavior, installed
// before the runtime captures its frame source. The whole suite would hang
// on it if the engine's background pump (heartbeat race) ever regressed.
g.requestAnimationFrame = () => 0;
const { NotebookEngine, CellSyntaxError } = await import("../../dist/notebook/engine.js");
const { transpile, toCell } = await import("@observablehq/notebook-kit");

/** The runtime recomputes through promises; poll until the predicate holds. */
async function until(fn: () => boolean, timeout = 2000): Promise<void> {
	const start = Date.now();
	for (;;) {
		if (fn()) return;
		if (Date.now() - start > timeout) throw new Error("until: timed out");
		await new Promise((r) => setTimeout(r, 10));
	}
}

const fulfilled = (engine: NotebookEngineClass, id: string, value?: unknown) => () => {
	const s = engine.state(id);
	return s?.status === "fulfilled" && (value === undefined || s.value === value);
};

test("two cells: dependency evaluates, named value resolves", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	engine.upsertCell("b", "a + 1");
	await until(fulfilled(engine, "b", 2));
	assert.equal(await engine.value("a"), 1);
	engine.dispose();
});

test("redefining a cell re-runs its dependents", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	engine.upsertCell("b", "a + 1");
	await until(fulfilled(engine, "b", 2));
	engine.upsertCell("a", "const a = 10");
	await until(fulfilled(engine, "b", 11));
	assert.equal(await engine.value("a"), 10);
	engine.dispose();
});

test("stale observers of deleted variables don't corrupt state", async () => {
	const seen: Array<[string, CellState["status"]]> = [];
	const engine = new NotebookEngine({ onState: (id: string, s: CellState) => seen.push([id, s.status]) });
	engine.upsertCell("a", "const a = 1");
	await until(fulfilled(engine, "a"));
	engine.upsertCell("a", "const a = 2");
	await until(fulfilled(engine, "a"));
	await new Promise((r) => setTimeout(r, 50)); // let any stale event land
	const state = engine.state("a");
	assert.ok(state, "the redefined cell should have a state");
	assert.equal(state.status, "fulfilled");
	assert.ok(state.status === "fulfilled", "…so it carries a value");
	assert.deepEqual(state.value, { a: 2 }); // declaration cells fulfill with exports
	engine.dispose();
});

test("syntax error throws typed and leaves the previous definition live", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	engine.upsertCell("b", "a + 1");
	await until(fulfilled(engine, "b", 2));
	assert.throws(() => engine.upsertCell("a", "const a = )"), CellSyntaxError);
	assert.throws(
		() => engine.upsertCell("a", "const a = )"),
		(e) => e instanceof CellSyntaxError && e.cellId === "a",
	);
	assert.equal(await engine.value("a"), 1); // still the old definition
	engine.upsertCell("a", "const a = 5"); // and recovery works
	await until(fulfilled(engine, "b", 6));
	engine.dispose();
});

test("runtime errors reject the cell's state", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("c", "missing + 1");
	await until(() => engine.state("c")?.status === "rejected");
	const state = engine.state("c");
	assert.ok(state?.status === "rejected", "a runtime error should reject the cell");
	const { error } = state;
	assert.match(String(error), /missing is not defined/);
	engine.dispose();
});

test("removing a cell rejects its dependents", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	engine.upsertCell("b", "a + 1");
	await until(fulfilled(engine, "b", 2));
	engine.removeCell("a");
	assert.equal(engine.state("a"), undefined);
	await until(() => engine.state("b")?.status === "rejected");
	engine.dispose();
});

test("snapshot reports source, mode, and state for the agent loop", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	await until(fulfilled(engine, "a"));
	assert.deepEqual(
		engine.snapshot().map(({ id, source, mode, state }) => [id, source, mode, state.status]),
		[["a", "const a = 1", "js", "fulfilled"]],
	);
	engine.dispose();
});

test("occluded windows still compute: the background pump beats a dead rAF", async () => {
	// The suite-wide dead rAF (see top) simulates Chrome parking an occluded
	// window — the bug where every cell sat pending until the user looked.
	// This test restates the invariant by name; every test above also rides
	// the heartbeat.
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const a = 1");
	engine.upsertCell("b", "a + 1");
	await until(fulfilled(engine, "b", 2), 5000);
	engine.dispose();
});

// The invariant the whole standalone-browser story rests on (plan risk #1):
// npm: and bare imports resolve to CDN URLs at *transpile* time — no Vite,
// no bundler in the loop. Asserted against the pinned notebook-kit directly.
test("npm: imports rewrite to jsdelivr at transpile time", () => {
	const t = transpile(toCell({ id: 1, value: "import {mean} from 'npm:d3-array'" }));
	assert.match(t.body, /cdn\.jsdelivr\.net\/npm\/d3-array\/\+esm/);
	assert.deepEqual(t.outputs, ["mean"]);
});

test("outputs(): declared names surface for the headless-cell hint", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("decl", "const walk = 1; const pace = 2");
	engine.upsertCell("expr", "walk + pace");
	await until(fulfilled(engine, "expr", 3));
	assert.deepEqual(engine.outputs("decl"), ["walk", "pace"]);
	assert.deepEqual(engine.outputs("expr"), []);
	assert.deepEqual(engine.outputs("unknown"), []);
	// Redefinition replaces the declared names, not appends.
	engine.upsertCell("decl", "const walk = 1");
	assert.deepEqual(engine.outputs("decl"), ["walk"]);
	engine.dispose();
});

test("values(): JSON-safe snapshot of named exports", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", "const nums = [1, 2, 3]");
	engine.upsertCell("b", "const fn = () => 1"); // unserializable — dropped
	engine.upsertCell("c", 'const m = new Map([["a", 1]])'); // stringifies to {} — dropped, not lied about
	await until(fulfilled(engine, "a"));
	await until(fulfilled(engine, "b"));
	await until(fulfilled(engine, "c"));
	const v = await engine.values();
	assert.deepEqual(v.nums, [1, 2, 3]);
	assert.ok(!("fn" in v));
	assert.ok(!("m" in v));
	engine.dispose();
});

test("values(): rejected, never-resolving, and removed names are omitted", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("ok", "const alive = 1");
	engine.upsertCell("bad", 'const boom = (() => { throw new Error("boom") })()');
	engine.upsertCell("stuck", "const forever = await new Promise(() => {})");
	engine.upsertCell("gone", "const dead = 2");
	await until(fulfilled(engine, "ok"));
	await until(() => engine.state("bad")?.status === "rejected");
	engine.removeCell("gone");
	const v = await engine.values();
	assert.deepEqual(v, { alive: 1 });
	engine.dispose();
});

test("values(): per-name maxLength and total budget caps", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", 'const big = "x".repeat(50)');
	engine.upsertCell("b", "const small = 7");
	await until(fulfilled(engine, "a"));
	await until(fulfilled(engine, "b"));
	// per-name cap: big (52 chars of JSON) dropped, small survives
	assert.deepEqual(await engine.values(20), { small: 7 });
	// total budget: big spends it, small never considered — first names win
	assert.deepEqual(await engine.values(2000, 10), { big: "x".repeat(50) });
	engine.dispose();
});

test("values(): nested Map dropped, JSON-safe siblings kept", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("a", 'const o = { n: 1, m: new Map([["k", 1]]) }');
	await until(fulfilled(engine, "a"));
	assert.deepEqual(await engine.values(), { o: { n: 1 } });
	engine.dispose();
});

test("viewStateNames: view()-backed exports only", async () => {
	const engine = new NotebookEngine();
	// Headless the view builtin is absent (the cell rejects), but outputs and
	// the uses-view flag are recorded at define time — which is all the
	// persistence bookkeeping needs.
	engine.upsertCell("w", "const picked = view(whatever)");
	engine.upsertCell("d", "const derived = 1 + 1");
	await until(() => engine.state("d")?.status === "fulfilled");
	assert.deepEqual(engine.viewStateNames(), ["picked"]);
	engine.dispose();
});

test("restore: headless cells and unknown names resolve as a no-op", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("w", "const picked = view(whatever)");
	await new Promise((r) => setTimeout(r, 50));
	// No root anywhere → nothing pending → returns without polling or throwing.
	await engine.restore({ picked: ["a"], stranger: 1 });
	engine.dispose();
});

// ---------- the persisted store ----------

test("seedStore is what state() starts from — the document, not the default", async () => {
	const engine = new NotebookEngine();
	engine.seedStore({ board: ["x", null, null] });
	assert.deepEqual(engine.stateCell("board", ["fresh"]).value, ["x", null, null], "the saved value wins");
	assert.deepEqual(engine.stateCell("other", ["fresh"]).value, ["fresh"], "an unseeded key takes its initial");
	engine.dispose();
});

test("storeValues is the snapshot the document persists", async () => {
	const engine = new NotebookEngine();
	engine.stateCell("n", 1);
	assert.deepEqual(engine.storeValues(), { n: 1 });
	engine.setState("n", 42);
	assert.deepEqual(engine.storeValues(), { n: 42 }, "a write is visible to the next save");
	engine.dispose();
	assert.deepEqual(engine.storeValues(), {}, "and a new document is a new store");
});

test("a display expression with a trailing semicolon still displays its value", async () => {
	// notebook-kit parses `1 + 1;` as a program (nothing returned), so without
	// the compile step's unterminate pass the cell fulfills with undefined and the
	// page shows an empty frame — the paper seed's house went missing this way.
	const { unterminateExpression } = await import("../../dist/notebook/compile.js");
	assert.equal(unterminateExpression("1 + 1;", "js"), "1 + 1");
	assert.equal(unterminateExpression("1 + 1;\n", "js"), "1 + 1");
	assert.equal(unterminateExpression("a; b;", "js"), "a; b;"); // a program stays a program
	assert.equal(unterminateExpression("const a = 1;", "js"), "const a = 1;");
	assert.equal(unterminateExpression("1 + 1;", "md"), "1 + 1;");
	const engine = new NotebookEngine();
	engine.upsertCell("a", "1 + 1;");
	await until(fulfilled(engine, "a", 2));
	engine.upsertCell("b", "const b = 5;");
	await until(fulfilled(engine, "b"));
	const declared = engine.state("b");
	assert.ok(declared?.status === "fulfilled", "the declaration cell carries a value");
	assert.deepEqual(declared.value, { b: 5 });
	engine.dispose();
});

test("a cell's FileAttachment reads a workspace path through the host's file base", async () => {
	// The app's page is served from its bundle, so `document.baseURI` names no
	// workspace file; the host gives the engine the scheme that does
	// (`notebook-cells.md` §Files). A leading slash means the workspace root too.
	const fetched: string[] = [];
	const realFetch = g.fetch;
	g.fetch = async (href: string) => {
		fetched.push(href);
		return new Response("month,revenue\nJan,10\nFeb,20\n");
	};
	try {
		const engine = new NotebookEngine({ fileBase: "piary-workspace://localhost/" });
		engine.upsertCell("text", 'const text = await FileAttachment("data/sales.csv").text()');
		engine.upsertCell("total", "text.trim().split(\"\\n\").slice(1).reduce((sum, line) => sum + Number(line.split(\",\")[1]), 0)");
		engine.upsertCell("root", 'FileAttachment("/sales.csv").href');
		await until(fulfilled(engine, "total", 30));
		await until(fulfilled(engine, "root", "piary-workspace://localhost/sales.csv"));
		assert.deepEqual(fetched, ["piary-workspace://localhost/data/sales.csv"]);
		engine.dispose();
	} finally {
		g.fetch = realFetch;
	}
});

// ---------- ojs cells ----------

test("an ojs cell runs: a named cell, a block, and an unnamed expression each fulfil with their value", async () => {
	// notebook-kit transpiles an ojs cell to a function, named after the cell
	// when it has a name, where a js cell becomes an arrow.
	const engine = new NotebookEngine();
	engine.upsertCell("named", "base = 20 + 1", { mode: "ojs" });
	engine.upsertCell("block", "doubled = {\n  const twice = base * 2;\n  return twice;\n}", { mode: "ojs" });
	engine.upsertCell("bare", "doubled + 1", { mode: "ojs" });
	await until(fulfilled(engine, "named", 21));
	await until(fulfilled(engine, "block", 42));
	await until(fulfilled(engine, "bare", 43));
	assert.equal(await engine.value("doubled"), 42, "and a js or ojs cell can read the name");
	engine.dispose();
});

test("an ojs cell defines nothing on the page's global object", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("leak", "ojsCellLeakProbe = 1", { mode: "ojs" });
	await until(() => engine.state("leak")?.status !== "pending");
	assert.equal("ojsCellLeakProbe" in globalThis, false);
	engine.dispose();
});

test("an ojs viewof cell hands its readers the element's value", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("pick", 'viewof quarter = ({value: "Q3", addEventListener() {}, removeEventListener() {}})', { mode: "ojs" });
	engine.upsertCell("read", "`lots of ${quarter}`", { mode: "ojs" });
	await until(fulfilled(engine, "read", "lots of Q3"));
	engine.dispose();
});

test("an ojs cell declares the name its source gives it, and its readers are found by it", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("named", "base = 20 + 1", { mode: "ojs" });
	engine.upsertCell("ojsReader", "base * 2", { mode: "ojs" });
	engine.upsertCell("jsReader", "base + 1");
	await until(fulfilled(engine, "ojsReader", 42));
	await until(fulfilled(engine, "jsReader", 22));
	assert.deepEqual(engine.outputs("named"), ["base"]);
	assert.deepEqual(engine.readers("named").sort(), ["jsReader", "ojsReader"]);
	assert.deepEqual(await engine.values(), { base: 21 }, "and the agent's snapshot holds its value");
	engine.dispose();
});

test("an ojs viewof or mutable cell declares the bare name, whichever way a reader spells it", async () => {
	const engine = new NotebookEngine();
	engine.upsertCell("pick", 'viewof quarter = ({value: "Q3", addEventListener() {}, removeEventListener() {}})', { mode: "ojs" });
	engine.upsertCell("value", "`lots of ${quarter}`", { mode: "ojs" });
	engine.upsertCell("element", "viewof quarter.value", { mode: "ojs" });
	engine.upsertCell("count", "mutable count = 3", { mode: "ojs" });
	engine.upsertCell("counted", "count + 1", { mode: "ojs" });
	await until(fulfilled(engine, "value", "lots of Q3"));
	await until(fulfilled(engine, "element", "Q3"));
	await until(fulfilled(engine, "counted", 4));
	assert.deepEqual(engine.outputs("pick"), ["quarter"]);
	assert.deepEqual(engine.readers("pick").sort(), ["element", "value"]);
	assert.deepEqual(engine.viewStateNames(), ["quarter"], "a viewof is widget state, as a view() export is");
	assert.deepEqual(engine.outputs("count"), ["count"]);
	assert.deepEqual(engine.readers("count"), ["counted"]);
	assert.deepEqual(await engine.values(), { quarter: "Q3", count: 3 });
	engine.dispose();
});
