// What the face's pill shows and which camera is read (app/face/state.ts): the rules, asserted
// without a page.
import test from "node:test";
import assert from "node:assert/strict";
import { type FaceFacts, mayAsk, MEASURED, SILENT_RUN_MAX, unaskedThreshold, pickCamera, pillSays, pillState, pillTitle, readingOf, stretchSays, TUNABLE, tunedOf } from "../../app/face/state.ts";

const facts = (over: Partial<FaceFacts> = {}): FaceFacts => ({ face: true, explained: true, source: null, seen: null, ...over });

test("the switch off is off, whatever a camera last said", () => {
	assert.equal(pillState(facts({ face: false, source: "watching", seen: "face" })), "off");
	assert.equal(pillState(facts({ face: false, explained: false })), "off");
});

test("on but not agreed to asks, and reads nothing", () => {
	assert.equal(pillState(facts({ explained: false })), "ask");
	assert.equal(pillState(facts({ explained: false, source: "watching", seen: "face" })), "ask");
});

test("on with the camera off is idle: before a key, and after a stop", () => {
	assert.equal(pillState(facts()), "idle");
	assert.equal(pillState(facts({ source: "stopped" })), "idle");
});

test("the camera coming on and on are told apart, and what is in view says why nothing is read", () => {
	assert.equal(pillState(facts({ source: "starting" })), "starting");
	assert.equal(pillState(facts({ source: "watching" })), "watching");
	assert.equal(pillState(facts({ source: "watching", seen: "face" })), "watching");
	assert.equal(pillState(facts({ source: "watching", seen: "none" })), "no-face");
	assert.equal(pillState(facts({ source: "watching", seen: "many" })), "two-faces");
	assert.equal(pillState(facts({ source: "watching", seen: "turned" })), "turned");
});

test("a camera that cannot be had says which way: refused, absent, or why it failed", () => {
	assert.equal(pillState(facts({ source: "refused" })), "refused");
	assert.equal(pillState(facts({ source: "absent" })), "no-camera");
	const failed = facts({ source: { failed: "NotReadableError: in use" } });
	assert.equal(pillState(failed), "failed");
	assert.equal(pillSays("failed", failed.source), "Your face is not read: NotReadableError: in use");
	assert.match(pillSays("refused", "refused"), /System Settings → Privacy & Security → Camera/);
});

test("every state has a sentence and a name", () => {
	for (const state of ["off", "ask", "idle", "starting", "watching", "no-face", "two-faces", "turned", "no-camera", "refused", "failed"] as const) {
		assert.ok(pillSays(state, null).length > 10, state);
		assert.match(pillTitle(state), /^Read my face: \S/);
	}
});

test("the camera read is the one chosen while it is there, else this Mac's own, never a phone's", () => {
	const mac = "FaceTime HD Camera";
	const phone = "Ada's iPhone Camera";
	assert.equal(pickCamera([phone, mac], ""), mac);
	assert.equal(pickCamera([phone, "Ada's iPhone Desk View Camera", mac], ""), mac);
	assert.equal(pickCamera([mac, "Studio Display Camera"], "Studio Display Camera"), "Studio Display Camera");
	// Chosen by name, a phone is read: the rule is about what is picked unasked.
	assert.equal(pickCamera([phone, mac], phone), phone);
	// The chosen one unplugged: back to this Mac's own.
	assert.equal(pickCamera([phone, mac], "Studio Display Camera"), mac);
	assert.equal(pickCamera([phone], ""), null);
	assert.equal(pickCamera([], mac), null);
});

test("a reading the user set is held to the values offered, and anything else is the measured one", () => {
	assert.deepEqual(readingOf(undefined), MEASURED);
	assert.deepEqual(MEASURED, { intensity: "C", minMs: 500, yaw: 12, pitch: 10 });
	assert.deepEqual(readingOf({ intensity: "B", minMs: 300, yaw: 25, pitch: 6 }), { intensity: "B", minMs: 300, yaw: 25, pitch: 6 });
	assert.deepEqual(readingOf({ intensity: "A", minMs: 5, yaw: 90, pitch: 10 }), MEASURED);
	for (const key of ["intensity", "minMs", "yaw", "pitch"] as const) assert.ok((TUNABLE[key] as readonly unknown[]).includes(MEASURED[key]), `${key}'s measured value is offered`);
});

test("a reading is used as a filter and as how far the head may turn", () => {
	const { threshold, tuning } = tunedOf({ intensity: "D", minMs: 2000, yaw: 18, pitch: 15 });
	assert.deepEqual(threshold, { intensity: "D", seconds: 2 });
	assert.equal(tuning.steadyYaw, 18);
	assert.equal(tuning.steadyPitch, 15);
});

test("a stretch is said in the block's own words", () => {
	assert.equal(stretchSays({ from: 1000, to: 2900, units: [[4, "C"], [24, "B"]] }), "brows lowered marked + lips pressed slight 1.9s");
});

test("the agent is asked to speak first until it is dismissed, has stayed silent three times running, or is a model known never to speak", () => {
	const fresh = { asked: 0, spoke: 0, silent: 0, silentRun: 0, dismissed: false };
	assert.ok(mayAsk(fresh, "claude-opus-5-5"));
	assert.ok(mayAsk(fresh, ""), "a model not known yet is tried");
	assert.ok(mayAsk({ ...fresh, silent: 9, silentRun: SILENT_RUN_MAX - 1 }, "claude-sonnet-5-5"));
	assert.ok(!mayAsk({ ...fresh, silentRun: SILENT_RUN_MAX }, "claude-sonnet-5-5"));
	assert.ok(!mayAsk({ ...fresh, dismissed: true }, "claude-sonnet-5-5"));
	assert.ok(!mayAsk(fresh, "claude-haiku-5-5"));
});

test("what the agent is asked about unasked is never weaker than the measured threshold, and as strict as the user's", () => {
	assert.deepEqual(unaskedThreshold({ intensity: "B", seconds: 0.3 }), { intensity: "C", seconds: 0.5 });
	assert.deepEqual(unaskedThreshold({ intensity: "D", seconds: 2 }), { intensity: "D", seconds: 2 });
});

