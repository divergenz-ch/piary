// The keymap, asserted as data.
//
// This file is where the native shell's one real weakness is answered. The
// driver that can reach the packaged app cannot type text or deliver
// `Mod-Shift-<letter>` chords on macOS (ADR 0014), so asserting what a key
// does up there would be asserting a synthetic event instead of a keystroke.
// Resolving a binding is a pure question, so it is answered here — no events,
// no engine, no app — and the layer above only has to prove the editor is
// wired to this table.
//
// Every assertion is about the mapping the canvas ships today. A change here
// changes what the user's fingers do, which is why the counts are pinned.
import assert from "node:assert/strict";
import { test } from "node:test";

import { BINDINGS, Command, KeyContext, bindingsFor, commandFor } from "../../src/document/keymap.ts";

test("the send chords resolve to the three distinct intents", () => {
	// Mid-stream these are the two real intents — steer now, or run after — and
	// idle, Mod-Enter is the ordinary send. Collapsing any two of them loses a
	// gesture the user has no other way to make.
	assert.equal(commandFor("Mod-Enter", KeyContext.Prose), Command.SendNewBlock);
	assert.equal(commandFor("Alt-Mod-Enter", KeyContext.Prose), Command.SendContinue);
	assert.equal(commandFor("Shift-Mod-Enter", KeyContext.Prose), Command.SendFollowUp);
});

test("the most specific send chord comes first", () => {
	// Order is behaviour here, not tidiness: CodeMirror takes the first match,
	// so `Mod-Enter` ahead of `Alt-Mod-Enter` would swallow it and continuing a
	// block would become unreachable.
	const prose = bindingsFor(KeyContext.Prose).map((binding) => binding.key);
	assert.ok(
		prose.indexOf("Alt-Mod-Enter") < prose.indexOf("Mod-Enter"),
		`Alt-Mod-Enter must precede Mod-Enter, got ${prose.join(", ")}`,
	);
	assert.ok(
		prose.indexOf("Shift-Mod-Enter") < prose.indexOf("Mod-Enter"),
		`Shift-Mod-Enter must precede Mod-Enter, got ${prose.join(", ")}`,
	);
});

test("Mod-Enter means run inside a cell and send in prose", () => {
	// The same chord, two meanings, decided by where the caret is — which is
	// the whole reason the table is keyed by context.
	assert.equal(commandFor("Mod-Enter", KeyContext.Cell), Command.RunCell);
	assert.equal(commandFor("Mod-Enter", KeyContext.Prose), Command.SendNewBlock);
});

test("a cell owns its own undo and redo", () => {
	// A cell being edited has its own history; the document's undo would throw
	// away an edit the user is still making.
	assert.equal(commandFor("Mod-z", KeyContext.Cell), Command.Undo);
	assert.equal(commandFor("Mod-Shift-z", KeyContext.Cell), Command.Redo);
	// Both redo spellings, because a keyboard layout may only offer one.
	assert.equal(commandFor("Mod-y", KeyContext.Cell), Command.Redo);
	// The pair: prose does not claim them, so the document's own history keeps
	// them.
	assert.equal(commandFor("Mod-z", KeyContext.Prose), null);
});

test("an interactive terminal claims no key at all", () => {
	// Every keystroke belongs to the shell (ADR 0013). A chord bound here is a
	// key the user cannot send, and Escape is the sharpest case: ^[ is how a
	// terminal program is told to stop.
	assert.deepEqual(bindingsFor(KeyContext.Terminal), []);
	assert.equal(commandFor("Escape", KeyContext.Terminal), null);
	assert.equal(commandFor("Mod-Enter", KeyContext.Terminal), null);
	// The pair: prose does claim Escape, so the emptiness above is about the
	// terminal rather than about the table being unpopulated.
	assert.equal(commandFor("Escape", KeyContext.Prose), Command.Stop);
});

test("an artifact sends but has nothing to run", () => {
	assert.equal(commandFor("Mod-Enter", KeyContext.Artifact), Command.SendNewBlock);
	assert.equal(commandFor("Mod-Enter", KeyContext.Cell), Command.RunCell);
});

test("no chord resolves twice in one context", () => {
	// Two commands on one key in one context is a binding that silently never
	// fires, and which one loses depends on array order — so the gate refuses
	// the ambiguity rather than picking.
	const seen = new Map<string, string>();
	for (const binding of BINDINGS) {
		const slot = `${binding.context}:${binding.key}`;
		const existing = seen.get(slot);
		assert.equal(existing, undefined, `${slot} is bound to both ${existing} and ${binding.command}`);
		seen.set(slot, binding.command);
	}
});

test("every context is covered, so a new one cannot be forgotten", () => {
	// A context added to the enum without bindings or a stated reason would
	// silently inherit nothing. The terminal's emptiness is deliberate and
	// named above; every other context must define something.
	for (const context of Object.values(KeyContext)) {
		const bindings = bindingsFor(context);
		if (context === KeyContext.Terminal) {
			assert.equal(bindings.length, 0, "the terminal's emptiness is deliberate");
			continue;
		}
		assert.ok(bindings.length > 0, `${context} defines no bindings`);
	}
});

test("a destructive binding yields when its precondition does not hold", () => {
	// Backspace takes a block only at an empty block's head, and Escape stops
	// only a live stream. Both sit in front of behaviour the user relies on, so
	// a non-conditional spelling would eat ordinary Backspace and every Escape.
	const conditional = BINDINGS.filter((binding) => binding.conditional).map((binding) => binding.key);
	assert.deepEqual([...conditional].sort(), ["Backspace", "Escape"]);
});

test("the soft break is bound, because CodeMirror does not bind it", () => {
	// Unbound in defaultKeymap: without this row Shift-Enter silently does
	// nothing, which is the bug that put it in the table.
	assert.equal(commandFor("Shift-Enter", KeyContext.Prose), Command.SoftBreak);
});

test("⌘← and ⌘→ are left to the platform's own motion, as every other editor has them", () => {
	// On macOS that is the line's start and end, and ⌥←/→ is by word
	// (CodeMirror's `standardKeymap`). The table overriding them made ⌘← go back
	// one word, which no other tool does.
	assert.equal(commandFor("Mod-ArrowLeft", KeyContext.Prose), null);
	assert.equal(commandFor("Mod-ArrowRight", KeyContext.Prose), null);
});

test("an unbound chord resolves to null rather than a default", () => {
	// `null` is what lets a keystroke fall through to CodeMirror's own keymap.
	// Returning a command for everything would make the table authoritative
	// over keys it has never heard of.
	assert.equal(commandFor("Mod-k", KeyContext.Prose), null);
	assert.equal(commandFor("F13", KeyContext.Prose), null);
});
