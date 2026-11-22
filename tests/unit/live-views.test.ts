// The live-view registry (src/document/live-views.ts): the seam a `pi:view` whose
// content keeps arriving is rendered through.
//
// L1 — the registry is pure, so these are ordinary functions over values. What a
// live view DOES once mounted is tests/integration/live-view-widget.test.ts, which needs an
// editor to mount it into.
import assert from "node:assert/strict";
import test from "node:test";
import { getLiveView, type LiveView, registerLiveView } from "../../dist/document/live-views.js";

/** The thinnest thing satisfying the contract — enough to assert the registry
 *  hands back what was registered. */
const stub = (): LiveView => ({ el: { tagName: "DIV" } as unknown as HTMLElement, write() {}, settle() {}, dispose() {} });

test("an unregistered name yields nothing, so the caller can fall back", () => {
	// The honest-fallback chain depends on this being undefined rather than a
	// throw: the decoration builder tries a live view, then a static template,
	// then leaves the fence visible (docs/document-format.md).
	assert.equal(getLiveView("no-such-view-template"), undefined);
});

test("a registered factory comes back, and is called with its id and host", () => {
	const seen: { id?: string; hasHost?: boolean } = {};
	registerLiveView("test-echo", (id, host) => {
		seen.id = id;
		seen.hasHost = typeof host.send === "function" && typeof host.measure === "function";
		return stub();
	});
	const factory = getLiveView("test-echo");
	assert.ok(factory, "a registered name must resolve");
	const view = factory("term-7", { interactive: true, send() {}, measure() {}, focusEditor() {} });
	assert.equal(seen.id, "term-7");
	assert.equal(seen.hasHost, true, "the factory receives the host it talks back through");
	// The contract's three methods plus the stable element.
	assert.equal(typeof view.write, "function");
	assert.equal(typeof view.settle, "function");
	assert.equal(typeof view.dispose, "function");
	assert.ok(view.el);
});

test("registering the same name again replaces the factory", () => {
	// Last registration wins, matching registerViewTemplate. It is what lets a
	// host override a built-in renderer without the registry growing a priority.
	registerLiveView("test-replaced", () => stub());
	const second = stub();
	registerLiveView("test-replaced", () => second);
	assert.equal(getLiveView("test-replaced")!("x", { interactive: false, send() {}, measure() {}, focusEditor() {} }), second);
});
