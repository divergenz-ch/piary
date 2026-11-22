// The app page's pure decisions, pulled out of modules that are otherwise DOM
// wiring. The wiring is driven by the app's Playwright project
// (e2e/app-page.spec.ts, e2e/flows.spec.ts); what is here is what a wrong
// answer from it would look like, asserted where it is cheapest to see.
import test from "node:test";
import assert from "node:assert/strict";
import type { ImageContent, Usage } from "@earendil-works/pi-ai";
import { toldTheSame } from "../../app/history.ts";
import { assetUrl, withNotes } from "../../app/attachments.ts";
import { newSid } from "../../app/ids.ts";
import { effortRows, modelRows, pickOf, stagedPick } from "../../app/picks.ts";
import { addUsage, contextUsed, EMPTY_TOTALS, meterOf, statsTotals, sumTotals, totalsTitle } from "../../app/usage-pure.ts";
import { signInNeeded } from "../../app/sign-in-pure.ts";

const image = (data: string, mimeType = "image/png"): ImageContent => ({ type: "image", data, mimeType });

// ── toldTheSame: whether a send must rebuild pi's history ───────────────────
// A false "different" restarts pi on every send; a false "same" leaves pi
// answering a conversation the document no longer holds.

test("the same messages and the same images tell pi the same thing", () => {
	const told = { messages: "a\nb", images: [[image("x")], []] };
	assert.equal(toldTheSame(told, { messages: "a\nb", images: [[image("x")], []] }), true);
});

test("an edited message is an edit", () => {
	assert.equal(toldTheSame({ messages: "a", images: [] }, { messages: "a!", images: [] }), false);
});

test("an image swapped for another of the same type is an edit, compared by its bytes", () => {
	assert.equal(toldTheSame({ messages: "a", images: [[image("x")]] }, { messages: "a", images: [[image("y")]] }), false);
	assert.equal(toldTheSame({ messages: "a", images: [[image("x")]] }, { messages: "a", images: [[image("x", "image/jpeg")]] }), false);
});

test("an image added, removed, or moved to another message is an edit", () => {
	const one = { messages: "a", images: [[image("x")], []] };
	assert.equal(toldTheSame(one, { messages: "a", images: [[image("x"), image("x")], []] }), false, "added");
	assert.equal(toldTheSame(one, { messages: "a", images: [[], []] }), false, "removed");
	assert.equal(toldTheSame(one, { messages: "a", images: [[], [image("x")]] }), false, "moved");
	assert.equal(toldTheSame(one, { messages: "a", images: [[image("x")]] }), false, "a message fewer");
});

// ── attachments: the url the webview loads, and the line a send carries ─────

test("a document's attachment loads from the app's own scheme; any other url as it is", () => {
	assert.equal(assetUrl("/attachments/shot-ab12.png"), "piary-file://localhost/shot-ab12.png");
	assert.equal(assetUrl("https://example.com/a.png"), "https://example.com/a.png");
	assert.equal(assetUrl("attachments/not-rooted.png"), "attachments/not-rooted.png");
});

test("a prompt's attachment lines follow its own text, one per line", () => {
	assert.equal(withNotes("look", []), "look");
	assert.equal(withNotes("look", ["[attached: a.pdf]", "[attached: b.csv]"]), "look\n[attached: a.pdf]\n[attached: b.csv]");
});

// ── ids: a session id must be usable as a window label ──────────────────────

test("a minted session id is Piary's `web-` shape, and dot-free for a window label", () => {
	const ids = new Set(Array.from({ length: 50 }, () => newSid()));
	for (const id of ids) {
		assert.match(id, /^web-[0-9a-f]{8}$/);
		assert.ok(!id.includes("."), "a window label cannot hold a dot (ADR 0027)");
	}
	assert.ok(ids.size > 45, "ids are random, not a counter or a constant");
});

// ── picks: what the model and effort pills name and offer ───────────────────
// A chip naming a model pi is not running is the defect this guards against; the rows
// are what the user chooses from.

test("a pick is read from pi's state, named by the model's own name", () => {
	const state = { model: { provider: "openai", id: "gpt-9", name: "GPT 9" }, thinkingLevel: "high" };
	assert.deepEqual(pickOf(state), { provider: "openai", modelId: "gpt-9", name: "GPT 9", thinking: "high" });
	assert.equal(pickOf({ model: { provider: "openai", id: "gpt-9" }, thinkingLevel: "off" })?.name, "gpt-9", "no name: the id");
	assert.equal(pickOf({ thinkingLevel: "off" }), null, "no model: no pick");
	assert.equal(pickOf(undefined), null);
});

test("a staged pick is read back only when it is whole", () => {
	const pick = { provider: "openai", modelId: "gpt-9", name: "GPT 9", thinking: "high" };
	assert.deepEqual(stagedPick(JSON.stringify(pick)), pick);
	assert.equal(stagedPick(null), null);
	assert.equal(stagedPick("{not json"), null);
	assert.equal(stagedPick(JSON.stringify({ provider: "openai" })), null, "a partial pick is no pick");
});

test("the model rows are grouped by provider in pi's order, the current one marked and not choosable", () => {
	const chosen: string[] = [];
	const rows = modelRows(
		[
			{ provider: "openai", id: "gpt-9", name: "GPT 9" },
			{ provider: "google", id: "gem-2" },
			{ provider: "openai", id: "gpt-9-mini", name: "GPT 9 mini" },
		],
		{ provider: "openai", modelId: "gpt-9-mini", name: "GPT 9 mini", thinking: "off" },
		(model) => chosen.push(`${model.provider}/${model.id}`),
		() => chosen.push("sign in"),
	);
	assert.deepEqual(
		rows.map((row) => ("label" in row ? `${row.label}${row.disabled ? " (current)" : ""}` : "section" in row ? `[${row.section}]` : row.note)),
		["[openai]", "GPT 9", "GPT 9 mini · (current)", "[google]", "gem-2"],
	);
	const gem = rows.find((row) => "label" in row && row.label === "gem-2");
	assert.ok(gem && "label" in gem);
	assert.equal(gem.title, "google/gem-2");
	gem.run();
	assert.deepEqual(chosen, ["google/gem-2"]);
});

test("no models is no provider, and the one row signs in", () => {
	let signedIn = 0;
	const rows = modelRows([], null, () => {}, () => signedIn++);
	assert.equal(rows.length, 1);
	const row = rows[0]!;
	assert.ok("label" in row && !row.disabled);
	assert.equal(row.label, "Sign in…");
	row.run();
	assert.equal(signedIn, 1);
});

test("the effort rows are pi's levels, the current one marked", () => {
	const rows = effortRows(["off", "low", "high"], "low", () => {});
	assert.deepEqual(
		rows.map((row) => ("label" in row ? `${row.label}${row.disabled ? "!" : ""}` : "")),
		["off", "low ·!", "high"],
	);
});

// ── The context meter and the session's totals ───────────────────────────────
// What the chip says a conversation has used. A wrong meter tells the user the
// model still sees clearly when it does not; wrong totals misstate what a
// conversation cost.

const step = (input: number, output: number, cacheRead: number, cacheWrite: number, totalTokens: number, cost: number): Usage => ({
	input,
	output,
	cacheRead,
	cacheWrite,
	totalTokens,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

test("the context a step used is the provider's total, else the sum of its parts", () => {
	assert.equal(contextUsed(step(100, 20, 3000, 5, 4000, 0)), 4000);
	assert.equal(contextUsed(step(100, 20, 3000, 5, 0, 0)), 3125);
});

test("no context used shows no meter", () => {
	assert.equal(meterOf(0, 200_000), null);
});

test("with no window size the meter is only a count", () => {
	const meter = meterOf(1500, 0);
	assert.equal(meter?.fill, null);
	assert.equal(meter?.label, "1.5k ctx");
	assert.equal(meter?.title, "context: 1.5k — the model's window size is unknown");
});

test("the meter warns from 70% and is over from 85%", () => {
	assert.equal(meterOf(69_000, 100_000)?.zone, "ok");
	assert.equal(meterOf(70_000, 100_000)?.zone, "warn");
	assert.equal(meterOf(84_999, 100_000)?.zone, "warn");
	assert.equal(meterOf(85_000, 100_000)?.zone, "over");
});

test("the meter names used of max, and its tooltip the percent and what it means", () => {
	const meter = meterOf(50_000, 200_000);
	assert.equal(meter?.fill, 25);
	assert.equal(meter?.label, "50k / 200k");
	assert.equal(
		meter?.title,
		"context: 50k of 200k (25%) — full sharpness under 50% · complex reasoning dulls past 70% · meaningfully worse past 85%",
	);
});

test("a context past the window caps the fill, and the tooltip says how far past", () => {
	const meter = meterOf(250_000, 200_000);
	assert.equal(meter?.fill, 100);
	assert.equal(meter?.zone, "over");
	assert.match(meter!.title, /\(125%\)/);
});

test("a context pi does not know yet, after a compaction, is an empty meter, never 0%", () => {
	const meter = meterOf(null, 200_000);
	assert.equal(meter?.fill, 0);
	assert.equal(meter?.label, "? / 200k");
	assert.doesNotMatch(meter!.title, /0%\)/);
});

test("a reply's usage and pi's session stats make the same totals", () => {
	const fromStats = statsTotals({ tokens: { input: 100, output: 20, cacheRead: 3000, cacheWrite: 5, total: 3125 }, cost: 0.5 });
	const fromReply = addUsage(EMPTY_TOTALS, step(100, 20, 3000, 5, 3125, 0.5));
	assert.deepEqual(fromReply, fromStats);
	assert.equal(fromStats.cost.total, 0.5);
});

test("each reply adds to the totals", () => {
	const once = addUsage(EMPTY_TOTALS, step(100, 20, 0, 0, 120, 0.25));
	const twice = addUsage(once, step(10, 2, 100, 0, 112, 0.5));
	assert.deepEqual(
		[twice.input, twice.output, twice.cacheRead, twice.cacheWrite, twice.totalTokens, twice.cost.total],
		[110, 22, 100, 0, 232, 0.75],
	);
});

test("a parent's totals and a child's sum", () => {
	const parent = statsTotals({ tokens: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, total: 120 }, cost: 0.25 });
	const child = statsTotals({ tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 }, cost: 0.5 });
	const sum = sumTotals(parent, child);
	assert.deepEqual(
		[sum.input, sum.output, sum.cacheRead, sum.cacheWrite, sum.totalTokens, sum.cost.total],
		[101, 22, 3, 4, 130, 0.75],
	);
});

test("a window of a million tokens or more reads in millions", () => {
	assert.equal(meterOf(50_000, 1_000_000)?.label, "50k / 1M");
	assert.equal(meterOf(50_000, 1_048_576)?.label, "50k / 1M");
	assert.equal(meterOf(50_000, 2_000_000)?.label, "50k / 2M");
	assert.equal(meterOf(1_500_000, 2_000_000)?.label, "1.5M / 2M");
	assert.match(meterOf(50_000, 1_000_000)!.title, /of 1M \(5%\)/);
});

test("the totals say sub-agents are included only when one used something", () => {
	assert.equal(totalsTitle(null), "session tokens");
	assert.equal(totalsTitle(EMPTY_TOTALS), "session tokens");
	assert.equal(totalsTitle(addUsage(EMPTY_TOTALS, step(0, 0, 0, 0, 0, 0.01))), "session tokens, sub-agents included");
	assert.equal(totalsTitle(addUsage(EMPTY_TOTALS, step(1, 0, 0, 0, 1, 0))), "session tokens, sub-agents included");
});

test("sign-in is offered only when pi refused the prompt and lists no model", () => {
	const refused = { success: false, error: "No API key found for openai." };
	const none = { success: true, data: { models: [] } };
	const some = { success: true, data: { models: [{ provider: "openai", id: "gpt-5" }] } };
	assert.equal(signInNeeded(refused, none), true);
	assert.equal(signInNeeded(refused, some), false);
	assert.equal(signInNeeded({ success: true }, none), false);
	// The models query failing says nothing about providers; the error already
	// in the document says why, and a guess would add a wrong ask.
	assert.equal(signInNeeded(refused, { success: false, error: "pi exited" }), false);
	assert.equal(signInNeeded(refused, null), false);
	assert.equal(signInNeeded(refused, { success: true, data: {} }), false);
	// A late reply is not a refusal: pi may still be answering (ADR 0019 §4).
	assert.equal(signInNeeded({ success: false, timedOut: true }, none), false);
});
