// The send-time line that tells pi when it is — run `pnpm build` first.
import test from "node:test";
import assert from "node:assert/strict";
import { renderFace, type Timeline } from "../../dist/document/face.js";
import { FACE_UNKEPT, faceBlockOf, isFaceOnly, isNowLine, isSilent, nowLine, withFace, withNow, withoutAppTail, withoutNow } from "../../dist/document/turn-context.js";

test("the line names the local weekday, date, time, zone and offset", () => {
	assert.equal(nowLine(new Date("2026-11-01T23:41:00Z"), "Europe/Zurich"), "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]");
});

test("summer time is the zone's summer offset", () => {
	assert.equal(nowLine(new Date("2026-07-15T08:05:00Z"), "Europe/Zurich"), "[now: Wednesday 2026-07-15 10:05, Europe/Zurich (UTC+02:00)]");
});

test("UTC itself has a zero offset, and a western zone a negative one", () => {
	assert.equal(nowLine(new Date("2026-11-01T23:41:00Z"), "UTC"), "[now: Sunday 2026-11-01 23:41, UTC (UTC+00:00)]");
	assert.equal(nowLine(new Date("2026-11-02T03:00:00Z"), "America/New_York"), "[now: Sunday 2026-11-01 22:00, America/New_York (UTC-05:00)]");
});

test("midnight is 00, not 24", () => {
	assert.equal(nowLine(new Date("2026-11-01T23:00:00Z"), "Europe/Zurich"), "[now: Monday 2026-11-02 00:00, Europe/Zurich (UTC+01:00)]");
});

test("the line goes last, and is recognised as what it is", () => {
	const line = nowLine(new Date("2026-11-01T23:41:00Z"), "Europe/Zurich");
	assert.equal(withNow("what day is it?", line), `what day is it?\n${line}`);
	assert.ok(isNowLine(line));
	assert.ok(!isNowLine("[attached: notes.txt (text/plain) at /tmp/notes.txt]"));
	assert.ok(!isNowLine(`${line} and more`));
});

test("a half-hour zone keeps its minutes, and a named zone at zero offset is UTC+00:00", () => {
	assert.equal(nowLine(new Date("2026-11-01T23:41:00Z"), "Asia/Kolkata"), "[now: Monday 2026-11-02 05:11, Asia/Kolkata (UTC+05:30)]");
	assert.equal(nowLine(new Date("2026-11-01T23:41:00Z"), "Asia/Kathmandu"), "[now: Monday 2026-11-02 05:26, Asia/Kathmandu (UTC+05:45)]");
	assert.equal(nowLine(new Date("2026-01-15T12:00:00Z"), "Europe/London"), "[now: Thursday 2026-01-15 12:00, Europe/London (UTC+00:00)]");
});

test("the offset ignores the seconds of the instant", () => {
	assert.equal(nowLine(new Date("2026-11-01T23:41:59.999Z"), "Europe/Zurich"), "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]");
});

test("every trailing [now: …] line goes, and nothing before them", () => {
	const a = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";
	assert.equal(withoutNow(`what\n[now: typed]\n${a}`), "what");
	assert.equal(withoutNow(`what\n[attached: x (text/plain) at /x]\n${a}`), "what\n[attached: x (text/plain) at /x]");
	assert.equal(withoutNow(`${a}\nwhat`), `${a}\nwhat`);
	assert.equal(withoutNow(a), "");
});

test("what a send adds comes off again: the text, the block and the time line, whatever the block says", () => {
	const now = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";
	const message = 'She said "ship it"\nthen ran the build — günaydın, 3 × 4 = 12, and the rest\n[attached: x (text/plain) at /x]';
	const timelines: Timeline[] = [
		{ read: { window: 4, events: [{ at: 0.6, run: [{ units: [[85, "C"]], dur: 1 }, { units: [[84, "E"], [12, "A"]], dur: 12.5 }] }] } },
		{ type: [{ kind: "during", text: 'said "ship it"\nthen', run: [{ units: [[4, "C"]], dur: 2.3 }] }, { kind: "during", text: "the", nth: 2, run: [{ units: [[4, "C"]], dur: 2.3 }] }] },
		{ type: [{ kind: "pause", after: "günaydın, 3 × 4", pause: 6.2, run: [{ units: [[1, "B"]], dur: 1.4 }] }, { kind: "deleted", text: "a \\ and\n\na blank line", run: [{ units: [[4, "D"]], dur: 1.1 }] }] },
	];
	for (const timeline of timelines) {
		const block = renderFace(timeline, message);
		assert.ok(block);
		assert.equal(withoutAppTail(withNow(withFace(message, block), now)), message);
		assert.equal(withoutAppTail(withFace(message, block)), message);
	}
	assert.equal(withFace(message, ""), message);
	assert.equal(withoutAppTail(message), message);
	assert.equal(withoutAppTail(`${message}\n${now}`), message);
});

test("the block a send ended a message with is read back whole, at whatever strength it was passed on", () => {
	const now = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";
	const message = "drop the cache line and still ship by Friday?";
	// A filter set to slight passes slight movements on, and they come off again like any other.
	const block = renderFace({ type: [{ kind: "during", text: "drop the cache line", run: [{ units: [[4, "B"]], dur: 2.3 }, { units: [[24, "D"]], dur: 0.3 }] }] }, message);
	assert.equal(block, '[face]\ntyping "drop the cache line": brows lowered slight 2.3s, then lips pressed severe 0.3s');
	assert.equal(faceBlockOf(withNow(withFace(message, block), now)), block);
	assert.equal(faceBlockOf(withFace(message, block)), block);
	assert.equal(withoutAppTail(withNow(withFace(message, block), now)), message);
	assert.equal(faceBlockOf(message), "");
	assert.equal(faceBlockOf(`${message}\n${now}`), "");
	// A `[face]` the user wrote above words of their own is theirs.
	assert.equal(faceBlockOf("see\n\n[face]\nis what the header looks like"), "");
});

test("a message the user wrote no word of is told from one they wrote, whatever tail a send gave it", () => {
	const now = "[now: Monday 2026-11-02 00:41, Europe/Zurich (UTC+01:00)]";
	const block = "[face]\nread 0.6s: brows lowered marked 1.8s";
	assert.ok(isFaceOnly(block));
	assert.ok(isFaceOnly(`${block}\n${now}`));
	assert.ok(isFaceOnly(FACE_UNKEPT));
	assert.ok(isFaceOnly(`${FACE_UNKEPT}\n${now}`));
	for (const theirs of ["", now, `why?\n\n${block}\n${now}`, "[face]", "[face]\nis what the header looks like", `${FACE_UNKEPT} really`]) assert.ok(!isFaceOnly(theirs), theirs);
	// What stands for a block that was not kept is the user's to keep as text: it is not stripped as a tail.
	assert.equal(withoutAppTail(FACE_UNKEPT), FACE_UNKEPT);
});

test("silence is the word for it however a model writes it, and anything else is something said", () => {
	for (const silent of ["", "  \n", "[silent]", "[Silent]", "`[silent]`", '"[silent]"', "[silent].", "∅"]) assert.ok(isSilent(silent), JSON.stringify(silent));
	for (const said of ["A key is a token.", "[silent] is what I would say", "silent", "I will stay [silent]"]) assert.ok(!isSilent(said), said);
});

