// The canvas's event catalog and its source cannot drift apart.
//
// `src/canvas/events.ts` names every event `<document-chat>` raises for its
// host. A host is held to that list — the app page's table must name a
// disposition for every entry — so the list is only worth something while it
// is complete. An event missing from it is a gesture some host can leave dead
// without a single test noticing: `tests/integration/events.test.ts` proves an event is
// EMITTED, and nothing a mounted editor can observe proves it is CONSUMED.
//
// So this file reads the source, as `tests/contract/keymap-wiring.test.ts` does and for
// the same reason: the thing to catch is a listener that was never written,
// and a running editor cannot see an absence.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { composeHost, DECLINED, notCarried, OWED } from "../../app/canvas-events.ts";
import { CanvasEvent, INTERNAL_EVENTS, RailEvent } from "../../src/canvas/events.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

// Page-level components the canvas does not mount. The app mounts them beside
// `<document-chat>` (`app/conversations.ts`, `app/rail.ts`), and their events are
// theirs: the module that mounts one answers it, not the canvas's table.
const NOT_THE_CANVAS = new Set(["src/components/SessionList.ts", "src/components/ChatIndex.ts"]);

/** Every `.ts` file under the trees the canvas is built from. */
function canvasSources(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walk(path);
			else if (path.endsWith(".ts")) out.push(relative(ROOT, path));
		}
	};
	walk(join(ROOT, "src/components"));
	walk(join(ROOT, "src/canvas"));
	return out.filter((file) => !NOT_THE_CANVAS.has(file));
}

/** Every event name dispatched in the canvas, with the files that dispatch it. */
function dispatched(): Map<string, string[]> {
	const seen = new Map<string, string[]>();
	const add = (name: string, file: string) => seen.set(name, [...(seen.get(name) ?? []), file]);
	for (const file of canvasSources()) {
		const source = readFileSync(join(ROOT, file), "utf8");
		for (const match of source.matchAll(/new CustomEvent(?:<[^>]*>)?\(\s*"([^"]+)"/g)) add(match[1]!, file);
		// The subsession view's buttons pass their event's name through a helper
		// (`action(cls, label, sid, event)`), so the literal is its last argument.
		for (const match of source.matchAll(/\baction\([^)]*,\s*"([a-z]+(?:-[a-z]+)+)"\s*\)/g)) add(match[1]!, file);
	}
	return seen;
}

const HOST = new Set<string>(Object.values(CanvasEvent));
const INTERNAL = new Set<string>(INTERNAL_EVENTS);

test("every event the canvas dispatches is catalogued", () => {
	for (const [name, files] of dispatched()) {
		assert.ok(
			HOST.has(name) || INTERNAL.has(name),
			`${files.join(", ")} dispatch "${name}", which src/canvas/events.ts does not list — add it to CanvasEvent (and its detail) if a host must act on it, or to INTERNAL_EVENTS if the canvas consumes it itself`,
		);
	}
});

test("every catalogued host event is still dispatched", () => {
	const seen = dispatched();
	for (const name of HOST) {
		assert.ok(seen.has(name), `src/canvas/events.ts lists "${name}", but nothing under src/components or src/canvas dispatches it`);
	}
});

test("every internal event has a listener inside the canvas", () => {
	const source = readFileSync(join(ROOT, "src/components/DocumentChat.ts"), "utf8");
	for (const name of INTERNAL) {
		assert.ok(
			source.includes(`addEventListener("${name}"`),
			`"${name}" is listed as internal, but DocumentChat.ts does not listen for it — it would reach the host unconsumed`,
		);
	}
});

test("no event is both a host event and an internal one", () => {
	for (const name of INTERNAL) assert.ok(!HOST.has(name), `"${name}" is in both lists`);
});

// The app page's table (app/canvas-events.ts) is held complete by its type; what
// a type cannot hold is that the gap shrinks. This is a debt with a number on
// it, not a permission: the commit that ports an event out of `OWED` lowers
// BASELINE with it, so the gate ratchets.
const BASELINE = 0;

test("the events the app does not carry yet only ever shrink", () => {
	assert.ok(
		OWED.length <= BASELINE,
		`app/canvas-events.ts owes ${OWED.length} events against a baseline of ${BASELINE} — a port closes a gap, it does not open one`,
	);
	assert.equal(OWED.length, BASELINE, `OWED shrank to ${OWED.length}: lower BASELINE to match, in the same commit`);
});

test("an event is owed or declined, never both", () => {
	const declined = new Set<string>(DECLINED);
	for (const name of OWED) assert.ok(!declined.has(name), `"${name}" is in both OWED and DECLINED`);
	assert.equal(new Set(OWED).size, OWED.length, "OWED names an event twice");
});

// The app page's table is composed from per-module fragments (ADR 0024). Object
// spread would let a second module's handler silently replace the first's, so
// the composition refuses an event answered twice.
test("composing two fragments that answer the same event is refused", () => {
	const a = { "doc-stop": () => {} };
	const b = { "doc-stop": () => {} };
	assert.throws(() => composeHost(a, b), /doc-stop/);
	// The control: distinct events compose.
	assert.doesNotThrow(() => composeHost(a, { "doc-change": () => {} }));
});

test("the not-carried fragment answers exactly the owed and declined events", () => {
	const owed = Object.entries(notCarried)
		.filter(([, entry]) => "owed" in entry)
		.map(([name]) => name);
	const declined = Object.entries(notCarried)
		.filter(([, entry]) => "declined" in entry)
		.map(([name]) => name);
	assert.deepEqual(owed.sort(), [...OWED].sort());
	assert.deepEqual(declined.sort(), [...DECLINED].sort());
});

// The rail is mounted beside the canvas, not inside it, so it is not in the
// canvas catalog (`NOT_THE_CANVAS`); the page that mounts it answers to its own.
const RAIL = new Set<string>(Object.values(RailEvent));
const railDispatched = () =>
	new Set([...readFileSync(join(ROOT, "src/components/ChatIndex.ts"), "utf8").matchAll(/new CustomEvent(?:<[^>]*>)?\(\s*"([^"]+)"/g)].map((match) => match[1]!));

test("every event the rail dispatches is in its catalog", () => {
	for (const name of railDispatched()) {
		assert.ok(RAIL.has(name), `ChatIndex.ts dispatches "${name}", which RailEvent in src/canvas/events.ts does not list`);
	}
});

test("every event in the rail's catalog is still dispatched", () => {
	const seen = railDispatched();
	for (const name of RAIL) assert.ok(seen.has(name), `RailEvent lists "${name}", but ChatIndex.ts never dispatches it`);
});

