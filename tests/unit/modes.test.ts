// The mode catalog: a block's mode is read from the transcript's state
// entries (step 13), with the marks it left in the document as the fallback
// (step 12). Run `pnpm build` first, then `node --test tests/unit/modes.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { blocksFrom, parseDocument, serializeView } from "../../dist/document/format.js";
import type { SessionEntry, SessionMessageEntry } from "@earendil-works/pi-coding-agent";
import { blockMode, childSessionInvocation, modesByBlock, modeState, viewIsMode } from "../../dist/document/modes.js";

const modeOf = (md: string, n = 0) => {
	const { segments } = parseDocument(md);
	return blockMode(segments, blocksFrom(segments)[n]);
};

test("a block carrying a subsession view is the sub-agent block", () => {
	const md = `<!-- you -->\n\nspawn one\n\n${serializeView("subsession", "web-child", { sid: "web-child", title: "spawn one" })}\n`;
	assert.equal(modeOf(md)?.id, "subagent");
	assert.equal(modeOf(md)?.badge, "agent");
});

test("a sub-agent invocation keeps its prompt in the notebook", () => {
	const invocation = childSessionInvocation("/subagent Inspect the parser.\nReport edge cases.");
	assert.equal(invocation?.mode.id, "subagent");
	assert.equal(invocation?.draft, "");
	assert.equal(invocation?.prompt, "Inspect the parser.\nReport edge cases.");
});

test("text before a sub-agent invocation remains a parent draft", () => {
	const invocation = childSessionInvocation("Keep this for the parent.\n/subagent Check the tests.");
	assert.equal(invocation?.draft, "Keep this for the parent.");
	assert.equal(invocation?.prompt, "Check the tests.");
	assert.equal(childSessionInvocation("/subagent-helper is ordinary text"), null);
	assert.equal(childSessionInvocation("/plan start"), null);
});

test("a block with the plan extension's tool calls is a plan block", () => {
	const md = "<!-- you -->\n\nplan it\n\n<!-- pi:tool plan_mode_complete #c1 -->\n\n```json\n{}\n```\n";
	assert.equal(modeOf(md)?.badge, "plan");
});

test("ordinary tool calls carry no mode — including ones named like agents", () => {
	const md = "<!-- you -->\n\ngo\n\n<!-- pi:tool run_agent #c1 -->\n\n```json\n{}\n```\n";
	assert.equal(modeOf(md), undefined);
});

// Transcript fixtures: what the plan extension actually appends (verified
// against installed @narumitw/pi-plan-mode session files, 2026-08-19).
const stateEntry = (id: string, parentId: string | null, enabled: boolean, awaitingAction = false): SessionEntry => ({
	type: "custom",
	customType: "plan-mode-state",
	data: { enabled, awaitingAction },
	id,
	parentId,
	timestamp: "",
});
// pi-coding-agent is pinned a minor behind the agent-core devDep, so the
// AgentMessage a SessionEntry carries is that older copy's. Deriving the message
// type from the entry keeps the two halves of a fixture on one definition.
//
// `modeState` and `modesByBlock` never read an entry's `message` — they look at
// `type`, `customType`, `data` and `id` only — so the provider block and
// timestamps below are inert filler, present to complete pi's message type.
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const message = (role: "user" | "assistant", content: string): SessionMessageEntry["message"] =>
	role === "assistant"
		? { role, content: [{ type: "text", text: content }], api: "", provider: "", model: "", usage, stopReason: "stop", timestamp: 0 }
		: { role, content, timestamp: 0 };
const msgEntry = (id: string, parentId: string | null, role: "user" | "assistant" = "user", content = "hi"): SessionEntry => ({
	type: "message",
	id,
	parentId,
	timestamp: "",
	message: message(role, content),
});

test("modeState follows on/off/awaiting transitions on the branch", () => {
	assert.equal(modeState([msgEntry("u1", null)]), null);
	const on = modeState([stateEntry("s1", null, true), msgEntry("u1", "s1")]);
	assert.equal(on?.mode.id, "plan");
	assert.equal(on?.enabled, true);
	assert.equal(on?.awaitingAction, false);
	const waiting = modeState([stateEntry("s1", null, true), msgEntry("u1", "s1"), stateEntry("s2", "u1", true, true)]);
	assert.equal(waiting?.awaitingAction, true);
	const off = modeState([stateEntry("s1", null, true), stateEntry("s2", "s1", false)]);
	assert.equal(off?.enabled, false);
});

test("modesByBlock: blocks inside an enabled span badge, spans don't bleed", () => {
	const entries = [
		msgEntry("u1", null), // before the mode started
		stateEntry("s1", "u1", true),
		msgEntry("u2", "s1"), // inside the first plan span
		stateEntry("s2", "u2", false),
		msgEntry("u3", "s2"), // after exit
		stateEntry("s3", "u3", true),
		msgEntry("u4", "s3"), // inside the second span
	];
	const byBlock = modesByBlock(
		entries,
		new Map([
			[0, "u1"],
			[1, "u2"],
			[2, "u3"],
			[3, "u4"],
		]),
	);
	assert.equal(byBlock.get(0), undefined);
	assert.equal(byBlock.get(1)?.id, "plan");
	assert.equal(byBlock.get(2), undefined);
	assert.equal(byBlock.get(3)?.id, "plan");
});

test("no state entries → state null, byBlock empty; marks fallback stands", () => {
	const entries = [msgEntry("u1", null), msgEntry("a1", "u1", "assistant")];
	assert.equal(modeState(entries), null);
	assert.equal(modesByBlock(entries, new Map([[0, "u1"]])).size, 0);
	// The marks-based read (blockMode) still badges hand-written docs.
	const md = "<!-- you -->\n\nplan it\n\n<!-- pi:tool plan_mode_complete #c1 -->\n\n```json\n{}\n```\n";
	assert.equal(modeOf(md)?.badge, "plan");
});

test("other view templates are artifacts, not modes", () => {
	assert.equal(viewIsMode("subsession"), true);
	assert.equal(viewIsMode("diff"), false);
	const md = `<!-- you -->\n\nshow it\n\n${serializeView("diff", "v1", { oldText: "a", newText: "b" })}\n`;
	assert.equal(modeOf(md), undefined);
});
