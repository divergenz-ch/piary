// The flows a user actually walks (docs/TEST_ARCHITECTURE.md).
//
// Every other suite in this repo tests a piece of the loop. These test the loop:
// a prompt leaves the canvas, pi answers, the answer lands in the document, and
// the page is still yours while it happens. Named after what a user does, so a
// failure here names what the user lost.
//
// Real browser, real keyboard, real canvas, real `app/turn.ts`. The Rust half is
// scripted (`e2e/helpers/scripted-pi.ts`) — which is why these run in CI and
// need no credential. That the same loop survives the REAL IPC boundary is
// `e2e-app/`'s job, and is a smoke test rather than a second copy of this file.
import type { Page } from "@playwright/test";
import { allowConsoleError, expect, test } from "./helpers/console-guard.ts";
import { answerBy, answerWith, cellAnswer, FOLLOW_UP_ANSWER, final, partial, providerRefused, settled, toolCallAnswer, toolResultEnd, toolRun, type PiEvent } from "./helpers/scripted-pi.ts";
import { afterFrames } from "./helpers/frames.ts";

/** The page's record of what pi was told. */
const piLog = (page: Page) =>
	page.evaluate(
		() =>
			(
				window as unknown as {
					__PI_LOG__: { sent: Array<{ sid: string; command: { type: string; message?: string } }> };
				}
			).__PI_LOG__,
	);

/** The prompts pi was sent, in order — `sent` also holds the questions a send
 *  asks first (`get_entries`, ADR 0021) and the silence probe's `get_state`. */
const promptsOf = (log: { sent: Array<{ sid: string; command: { type: string; message?: string } }> }) =>
	log.sent.filter((sent) => sent.command.type === "prompt");

/** An empty conversation: one open prompt, which is what a new document is.
 *
 *  Seeded rather than relying on the app's welcome page — that is prose with no
 *  markers at all (deliberately: a file with none is one pending user message,
 *  ADR 0001), so typing at its end lands mid-paragraph and the answer splices
 *  into the middle of the welcome text. A flow needs a document with a tail. */
const EMPTY = "<!-- you -->\n\n";

/** Boot the app page with a scripted pi behind it. */
async function openApp(page: Page, script: string, doc = EMPTY) {
	await page.addInitScript({ content: script });
	await page.goto(`/?doc=${encodeURIComponent(doc)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
}

/** Type into the document at the caret, through the browser's own input path. */
async function write(page: Page, text: string) {
	// The first: a cell's code pane is a `.cm-content` of its own.
	await page.locator(".cm-content").first().click();
	// The trailing prompt is the tail, and `Control+End` is the one chord that
	// means "document end" in both engines.
	await page.keyboard.press("Control+End");
	await page.keyboard.type(text);
}

/** ⌘⏎ on macOS, Ctrl+⏎ elsewhere — the same chord the keymap binds. */
async function send(page: Page) {
	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${mod}+Enter`);
}

const docText = (page: Page) =>
	page.evaluate(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());

/** Wait until the turn is over, not merely until its text has appeared.
 *
 *  `toContainText` matches the moment a PARTIAL lands, and `agent_settled` can
 *  still be in flight behind it — so a spec that clicks into the answer right
 *  after is clicking at a document that is about to shift under it. That is
 *  exactly how the undo flow failed roughly 1 run in 3: the edit landed in the
 *  trailing prompt instead of after the answer. Any spec that edits what a turn
 *  wrote has to come through here first. */
async function turnOver(page: Page) {
	// No catch: a turn that never ends is a failure, not a settled document. A
	// turn already over when this is called passes on the first poll.
	await page.waitForFunction(
		() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming === false,
		undefined,
		{ timeout: 5000 },
	);
}

/** Past the canvas's save debounce (`SAVE_DEBOUNCE_MS`, 500 ms, in
 *  DocumentChat.ts) with room to spare: what a negative about a save that must
 *  NOT happen has to wait out, since there is no event for a save not made. */
const PAST_THE_SAVE_DEBOUNCE_MS = 900;

/** A cell a spec makes throw is logged by notebook-kit's own observer, which
 *  `console.error`s every rejected cell before it displays the error — so a
 *  spec that drives a failing cell on purpose declares the error it expects.
 *  Not required to appear: the runtime evaluates the cell on its own schedule,
 *  which may be after the spec's last assertion. */
const allowThrowingCells = (page: Page) => allowConsoleError(page, /^Error: /, { required: false });

// ── The core loop ────────────────────────────────────────────────────────────

test("a prompt is answered, and the answer lands in the document", { tag: "@smoke" }, async ({ page }) => {
	await openApp(page, answerWith([partial("Four"), final("Four."), settled()]));

	await write(page, "what is 2+2");
	await send(page);

	// What a user sees: the answer on the page, under their prompt.
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await expect(page.locator(".cm-content")).toContainText("what is 2+2");

	const md = await docText(page);
	expect(md.indexOf("what is 2+2")).toBeLessThan(md.indexOf("Four."));
	// Attributed, not anonymous prose: the agent's own marker precedes it.
	expect(md).toContain("<!-- pi -->");
	// And the page is ready for the next thing — every turn leaves exactly one
	// trailing prompt (docs/document-format.md).
	expect(md.trimEnd().endsWith("<!-- you -->")).toBe(true);
});

test("the prompt that ran is history, and pi was told what was typed", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });

	// The only place the rebuild is observable from outside: what pi received.
	// pi's own rpc verb, not a bare string: `{ type: "prompt", message }`.
	const prompts = promptsOf(await piLog(page));
	expect(prompts).toHaveLength(1);
	expect(prompts[0].command.message).toContain("what is 2+2");
});

test("an answer streams in rather than appearing whole", async ({ page }) => {
	// Three chunks, spaced: the canvas re-renders the in-flight message each
	// time, which is what `applyAssistantPartial` is for.
	await openApp(
		page,
		answerWith([partial("Four"), partial("Four, because"), final("Four, because two plus two."), settled()], 120),
	);
	await write(page, "what is 2+2");
	await send(page);

	// Caught mid-answer: the first chunk is on the page before the last arrives.
	await expect(page.locator(".cm-content")).toContainText("Four", { timeout: 5000 });
	await expect(page.locator(".cm-content")).toContainText("Four, because two plus two.", { timeout: 5000 });
	// Each chunk REPLACES the last rather than appending — the region is spliced,
	// so a partial must not survive beside its own continuation.
	const md = await docText(page);
	expect(md.match(/Four, because/g) ?? []).toHaveLength(1);
});

// ── The page is still yours while the agent writes ───────────────────────────
// The canvas's whole premise (ADR 0005): the agent writes into the document you
// are editing, and you do not have to wait for it. Three of five defects
// once found in the canvas lived in this interaction.

test("a draft typed in the tail survives an answer streaming in above it", async ({ page }) => {
	await openApp(
		page,
		answerWith([partial("Four"), partial("Four, because"), final("Four, because two plus two."), settled()], 150),
	);
	await write(page, "what is 2+2");
	await send(page);

	// Straight into the fresh prompt while the answer is still arriving.
	await expect(page.locator(".cm-content")).toContainText("Four", { timeout: 5000 });
	await page.keyboard.type("and what about 3+3");

	await expect(page.locator(".cm-content")).toContainText("Four, because two plus two.", { timeout: 5000 });
	const md = await docText(page);
	// Both survive, and the draft is below the answer rather than inside it.
	expect(md).toContain("and what about 3+3");
	expect(md.indexOf("Four, because two plus two.")).toBeLessThan(md.indexOf("and what about 3+3"));
	// One prompt, not two: the draft went into the slot the turn opened, and
	// nothing opened a second one underneath it.
	expect(md.match(/<!-- you -->/g) ?? []).toHaveLength(2);
});

test("the answer lands at the prompt that ran, not at the bottom of the page", async ({ page }) => {
	// ADR 0005's positional prompt, as a user meets it: the caret decides which
	// prompt is sent, and the answer belongs under THAT one.
	const midPage = [
		"<!-- you -->",
		"",
		"first question",
		"",
		"<!-- pi -->",
		"",
		"first answer",
		"",
		"<!-- you -->",
		"",
		"second question",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");
	await openApp(page, answerWith([final("answer to the middle one."), settled()]), midPage);

	// Click into the MIDDLE prompt rather than the tail, and send from there.
	await page.locator(".cm-line", { hasText: "second question" }).click();
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("answer to the middle one.", { timeout: 5000 });

	const md = await docText(page);
	// Under the prompt that ran…
	expect(md.indexOf("second question")).toBeLessThan(md.indexOf("answer to the middle one."));
	// …and not at the end: the trailing prompt is still the last thing.
	expect(md.trimEnd().endsWith("<!-- you -->")).toBe(true);
	// The first exchange is untouched above it.
	expect(md.indexOf("first answer")).toBeLessThan(md.indexOf("second question"));
});

test("an event arriving after the turn ended leaves the conversation alone", async ({ page }) => {
	// Before ADR 0017 this destroyed the document: the stream region defaulted to
	// a span that a loaded document grew to the whole buffer, so a late chunk
	// replaced everything. The user-visible version of that regression.
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);
	const before = await docText(page);

	// A chunk from a turn that is over, delivered on the real event channel and
	// to the session that is actually listening — `app/main.ts` filters by sid,
	// so a guessed one is dropped before the canvas ever sees it and the test
	// would pass without proving anything.
	const sid = (await piLog(page)).sent[0].sid;
	await page.evaluate((session) => {
		(window as unknown as { __PI_EMIT__: (name: string, payload: unknown) => void }).__PI_EMIT__("pi-event", [
			session,
			{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "stray chunk" }] } },
		]);
	}, sid);
	await afterFrames(page);

	// What ADR 0017 guarantees is that nothing is DESTROYED, not that nothing is
	// added: with no turn in flight there is no region to splice over, so a late
	// chunk lands after the answer as its own segment. Before that fix the same
	// event replaced the whole document.
	//
	// Honest about what this spec can and cannot show. The old bug is no longer
	// reachable from here: `endTurn` collapses the region onto the document's end,
	// so even a deliberately reintroduced whole-buffer fallback
	// replaces an empty span and this still passes. The two guards are tested
	// directly in `tests/integration/editor.test.ts`; what this asserts is the user-visible
	// promise — a late event never costs you the conversation.
	const after = await docText(page);
	expect(after).toContain("what is 2+2");
	expect(after).toContain("Four.");
	expect(after.length).toBeGreaterThanOrEqual(before.length);
	await expect(page.locator(".cm-content")).toContainText("what is 2+2");
	// And the page still ends in exactly one open prompt, ready to type into.
	expect(after.trimEnd().endsWith("<!-- you -->")).toBe(true);
});

test("after pi goes away, the next send starts it again", async ({ page }) => {
	// The notice promises it (ADR 0019 §5). A send that only wrote to the session
	// it had would reach a pi that is no longer there.
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);

	const starts = () =>
		page.evaluate(
			() =>
				(window as unknown as { __PI_LOG__: { calls: string[] } }).__PI_LOG__.calls.filter(
					(call) => call === "pi_start",
				).length,
		);
	const sid = (await piLog(page)).sent[0].sid;
	await page.evaluate((session) => {
		(window as unknown as { __PI_EMIT__: (name: string, payload: unknown) => void }).__PI_EMIT__("pi-exited", [
			session,
			null,
		]);
	}, sid);
	const before = await starts();

	// The trailing prompt's own line: after a turn, `Control+End` alone can
	// leave the caret in the answer (see the editable-prose flow below).
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("and 3+3");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	expect(await starts()).toBeGreaterThan(before);
});

// ── Stopping a turn ──────────────────────────────────────────────────────────
// `Escape` while an answer streams. The canvas has had the gesture all along —
// it dispatches `doc-stop` and gates eight protections on `streaming` — but the
// app never told it a turn was running, so none of that was reachable.

test("Escape stops a streaming answer and leaves what arrived", async ({ page }) => {
	// Six chunks, well spaced: there is a real middle to interrupt.
	await openApp(
		page,
		answerWith(
			[partial("One"), partial("One two"), partial("One two three"), partial("One two three four"), settled()],
			250,
		),
	);
	await write(page, "count slowly");
	await send(page);

	// Wait for the answer to be under way, then interrupt it.
	await expect(page.locator(".cm-content")).toContainText("One two", { timeout: 5000 });
	await page.keyboard.press("Escape");

	// pi was told to stop, in its own rpc verb.
	await expect.poll(async () => (await piLog(page)).sent.map((s) => s.command.type)).toContain("abort");

	// And what had streamed is still there — stopping is not undoing.
	const md = await docText(page);
	expect(md).toContain("One two");
	expect(md).toContain("count slowly");
	// The page is writable again: the trailing prompt takes a keystroke.
	await page.keyboard.press("Control+End");
	await page.keyboard.type("never mind");
	expect(await docText(page)).toContain("never mind");
});

/** What the page asked pi to do, its reads left out: the chip reads the model
 *  pi runs and what the session has used whenever pi is up (`app/model.ts`,
 *  `app/usage.ts`), and a read changes nothing. */
const READS = new Set(["get_commands", "get_state", "get_session_stats"]);
const acted = (log: Awaited<ReturnType<typeof piLog>>) => log.sent.filter((s) => !READS.has(s.command.type));

test("Escape with no turn running is the editor's own key", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await page.locator(".cm-content").click();
	await page.keyboard.press("Escape");
	await afterFrames(page);
	expect(acted(await piLog(page))).toHaveLength(0);
});

// ── The menu's Conversation and File verbs ─────────────────────────────────
// A page cannot click a native menu item, so the click arrives the way Rust
// delivers it: the `menu` event with the item's id.

const menu = (page: Page, id: string) =>
	page.evaluate((id) => (window as unknown as { __PI_EMIT__(name: string, payload: unknown): void }).__PI_EMIT__("menu", id), id);

test("Send in the menu sends the prompt the caret is in, once", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await menu(page, "send");
	await turnOver(page);
	// As written: every send ends with its time line (ADR 0028), which its own flows assert.
	expect(promptsOf(await piLog(page)).map((sent) => sent.command.message?.replace(/\n\[now: [^\]\n]*\]$/, ""))).toEqual(["what is 2+2"]);
	expect(await docText(page)).toContain("Four.");
});

test("Stop in the menu stops a streaming answer, and does nothing when none runs", async ({ page }) => {
	await openApp(page, answerWith([partial("One"), partial("One two"), partial("One two three"), settled()], 250));
	await menu(page, "stop");
	await afterFrames(page);
	expect(acted(await piLog(page))).toHaveLength(0);
	await write(page, "count slowly");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("One", { timeout: 5000 });
	await menu(page, "stop");
	await expect.poll(async () => (await piLog(page)).sent.map((s) => s.command.type)).toContain("abort");
});

test("Save in the menu writes the document as it stands", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "kept by save");
	// Every edit is already saved as it lands (ADR 0018), so what Save adds is
	// one more write, now, of the same text — counted, or the test passes on the
	// edits' own saves.
	await expect.poll(async () => (await storeLog(page)).writes.at(-1)?.content ?? "").toContain("kept by save");
	const before = (await storeLog(page)).writes.length;
	await menu(page, "save");
	await expect.poll(async () => (await storeLog(page)).writes.length).toBe(before + 1);
	expect((await storeLog(page)).writes.at(-1)?.content).toContain("kept by save");
});

test("the answer being written cannot be edited out from under the agent", async ({ page }) => {
	// Only reachable once the app reports `streaming`: this is the protection the
	// canvas has always had and the app could never engage.
	//
	// What it protects is the MACHINE's region, not the whole page — the point of
	// ADR 0005 is that the rest of the document stays yours while the agent
	// writes. So select-all-and-type mid-turn does replace the writer's own text
	// (their gesture, their document) and leaves the streaming answer standing:
	// the change filter returns the region as a protected range, so CodeMirror
	// clips the change around it rather than dropping the transaction.
	// A long script, so the turn is still live when the edit is attempted. The
	// first version waited 200ms and the turn had already settled — the edit then
	// lands legitimately, and the test was asserting the protection while nothing
	// was protected.
	await openApp(
		page,
		answerWith(
			[partial("One"), partial("One two"), partial("One two three"), partial("One two three four"), settled()],
			600,
		),
	);
	await write(page, "count slowly");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("One two", { timeout: 5000 });
	expect(await page.evaluate(() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming)).toBe(true);

	// Select the whole document and try to replace it while the turn writes.
	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${mod}+a`);
	await page.keyboard.type("gone");

	// Asserted while the turn is STILL running, for the same reason.
	expect(await page.evaluate(() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming)).toBe(true);
	const md = await docText(page);
	// The answer and its marker are untouched…
	expect(md).toContain("One two");
	expect(md).toContain("<!-- pi -->");
	// …the page still ends in a prompt, so the next send has somewhere to go…
	expect(md.trimEnd().endsWith("<!-- you -->")).toBe(true);
	// …and the writer's own edit did land, because that half is theirs.
	expect(md).toContain("gone");
});

// ── A turn that goes quiet ───────────────────────────────────────────────────
// Silence is not evidence that pi is gone, so a quiet turn is asked about, never
// unlocked on a timer (ADR 0019 §4). Written as flows rather than a jsdom row for
// `Turn`: the probe is a round trip through `src/bridge.ts` and the canvas's
// `streaming` flag, and this harness already drives both for real — a jsdom row
// would need a second scripted `piSend` beside this one. The clock is Playwright's
// (`page.clock`), so a bound of seconds is crossed without waiting it out.

/** Longer than the page's silence bound. The rows that probe prove it, since
 *  they wait exactly this long; so the control that streams across it would
 *  have been probed too, had its chunks not counted as proof of life. */
const PAST_THE_BOUND_MS = 60_000;

const streaming = (page: Page) =>
	page.evaluate(() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming);

/** The silence probe's questions: a `get_state` once the prompt has gone. The
 *  ones before it are the page reading the model it runs (`app/model.ts`). */
const probes = async (page: Page) => {
	const { sent } = await piLog(page);
	const prompted = sent.findIndex((s) => s.command.type === "prompt");
	return prompted < 0 ? 0 : sent.slice(prompted).filter((s) => s.command.type === "get_state").length;
};

test("a silent turn whose pi has finished is ended, and the user is told", async ({ page }) => {
	// The `agent_settled` was lost: pi is idle, and only asking can find that out.
	await page.clock.install();
	await openApp(page, answerWith([partial("Half an answer")], 60, { state: { isStreaming: false } }));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half an answer", { timeout: 5000 });
	expect(await streaming(page)).toBe(true);

	await page.clock.fastForward(PAST_THE_BOUND_MS);
	await expect.poll(() => streaming(page), { timeout: 5000 }).toBe(false);
	expect(await probes(page)).toBe(1);
	await expect(page.locator("#status")).toContainText("already finished");
	expect(await docText(page)).toContain("Half an answer");
});

test("a silent turn whose pi is still working stays running", async ({ page }) => {
	// The row that separates a probe from a watchdog: a long `bash` or a model
	// thinking is silent and alive, and unlocking under it is two writers.
	await page.clock.install();
	await openApp(page, answerWith([partial("Half an answer")], 60, { state: { isStreaming: true } }));
	await write(page, "think hard");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half an answer", { timeout: 5000 });

	await page.clock.fastForward(PAST_THE_BOUND_MS);
	await expect.poll(() => probes(page), { timeout: 5000 }).toBe(1);
	expect(await streaming(page)).toBe(true);
	// And it waits again rather than giving up: the next silence asks again.
	await page.clock.fastForward(PAST_THE_BOUND_MS);
	await expect.poll(() => probes(page), { timeout: 5000 }).toBe(2);
	expect(await streaming(page)).toBe(true);
	await expect(page.locator("#status")).toHaveText("");
});

test("a silent turn whose pi does not answer is ended, and pi is not said to have stopped", async ({ page }) => {
	// A wedged pi: `get_state` gets no reply in pi's shape. pi is still running
	// — wedged, not gone — so the probe ends the turn and leaves the process
	// alone, and the notice may not promise the restart a send cannot give:
	// `piStart` is a no-op on a live session (ADR 0019 §4).
	await page.clock.install();
	await openApp(page, answerWith([partial("Half an answer")], 60, { wedged: true }));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half an answer", { timeout: 5000 });

	await page.clock.fastForward(PAST_THE_BOUND_MS);
	await expect.poll(() => streaming(page), { timeout: 5000 }).toBe(false);
	await expect(page.locator("#status")).toContainText("stopped answering");
	await expect(page.locator("#status")).not.toContainText("starts it again");
	expect((await storeLog(page)).calls, "a failed probe never stops pi").not.toContain("pi_stop");
	expect(await docText(page)).toContain("Half an answer");
});

test("a silent turn whose pi is gone is ended as a pi that went away", async ({ page }) => {
	// The same silence, but the session has no pi any more: the exit's notice is
	// true here, because the next send starts a fresh one.
	await page.clock.install();
	await openApp(page, answerWith([partial("Half an answer")], 60, { running: false, wedged: true }));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half an answer", { timeout: 5000 });

	await page.clock.fastForward(PAST_THE_BOUND_MS);
	await expect.poll(() => streaming(page), { timeout: 5000 }).toBe(false);
	await expect(page.locator("#status")).toContainText("The next send starts it again");
});

test("a turn that keeps streaming is never asked whether it is running", async ({ page }) => {
	// The control for the rows above, which `TEST_ARCHITECTURE.md` §4's "a
	// negative with no control" names: chunks a second apart across a span the
	// probing rows prove is past the bound. Without every event re-arming it,
	// this turn would be probed.
	const chunks = PAST_THE_BOUND_MS / 1000;
	const script = Array.from({ length: chunks }, (_, i) => partial(`chunk ${i + 1}`));
	await page.clock.install();
	await openApp(page, answerWith([...script, final(`chunk ${chunks}`), settled()], 1000, { state: { isStreaming: true } }));
	await write(page, "count to sixty");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(1);

	await page.clock.runFor(PAST_THE_BOUND_MS + 3000);
	await expect.poll(() => streaming(page), { timeout: 5000 }).toBe(false);
	expect(await docText(page)).toContain(`chunk ${chunks}`);
	expect(await probes(page)).toBe(0);
});

test("a prompt whose reply timed out is asked about, not unlocked", async ({ page }) => {
	// pi may have taken the prompt and be writing the answer: a late reply is a
	// reason to probe, and the probe says the turn is live (ADR 0019 §4).
	await openApp(
		page,
		answerWith([], 60, {
			promptReply: { success: false, error: "pi did not answer `prompt` within 30s", timedOut: true },
			state: { isStreaming: true },
		}),
	);
	await write(page, "what is 2+2");
	await send(page);
	await expect.poll(() => probes(page), { timeout: 5000 }).toBe(1);
	expect(await streaming(page)).toBe(true);
	expect(await docText(page)).not.toContain("did not answer");
});

test("a refused prompt still unlocks the canvas and says why", async ({ page }) => {
	// The pair to the row above: the same failure without the timeout's mark is
	// a refusal, nothing is running, and the page is the user's again at once.
	await openApp(
		page,
		answerWith([], 60, { promptReply: { success: false, error: "no model is selected" }, state: { isStreaming: true } }),
	);
	await write(page, "what is 2+2");
	await send(page);
	await expect.poll(() => streaming(page), { timeout: 5000 }).toBe(false);
	expect(await probes(page)).toBe(0);
	expect(await docText(page)).toContain("no model is selected");
});

test("a prompt pi handles as a command of its own ends the turn at once, and the next send is a prompt", async ({ page }) => {
	// A `handled` disposition starts no run: no answer and no `agent_settled`
	// follow, so a turn left open would wait out the silence bound, and a send
	// meanwhile would steer a run that does not exist.
	await openApp(page, answerWith([], 60, { promptReply: { success: true, data: { disposition: "handled" } } }));
	await write(page, "/block new");
	await send(page);
	await expect.poll(() => streaming(page), { timeout: 2000 }).toBe(false);
	await write(page, "\n\nthen this");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	expect(await steersOf(page)).toEqual([]);
	await expect(page.locator("#status")).not.toContainText("already finished");
});

// ── A tool runs ──────────────────────────────────────────────────────────────

/** A turn that runs `ls` through `tool` — pi's `bash`, or Piary's `terminal`,
 *  which is the same command shown to the user — printing two lines, then
 *  answers. */
const lsTurn = (tool: "bash" | "terminal") => [
	toolCallAnswer(tool, "t1", { command: "ls" }, "Let me look."),
	...toolRun("t1", tool, ["a.txt\n", "b.txt\n"]),
	toolResultEnd("t1", tool, "a.txt\nb.txt\n"),
	final("Two files."),
	settled(),
];
const LS_TURN = lsTurn("bash");

/** The panel's grid, line by line, read through xterm's buffer after a flush:
 *  Chromium draws the rows to a canvas, so the DOM holds no text. */
const panelLines = (page: Page, id: string) =>
	page.evaluate(async (id) => {
		const chat = document.querySelector("document-chat") as unknown as {
			liveView(id: string): {
				terminal: {
					write(data: string, done: () => void): void;
					buffer: { active: { length: number; getLine(i: number): { translateToString(trim: boolean): string } | undefined } };
				};
			} | null;
		};
		const view = chat.liveView(id);
		if (!view) return [];
		await new Promise<void>((resolve) => view.terminal.write("", resolve));
		const buffer = view.terminal.buffer.active;
		return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? "").filter(Boolean);
	}, id);

test("a tool's result lands under its call", async ({ page }) => {
	await openApp(page, answerWith(LS_TURN));
	await write(page, "list the files here");
	await send(page);
	await turnOver(page);
	const md = await docText(page);
	const call = md.indexOf("<!-- pi:tool bash #t1 -->");
	const result = md.indexOf("<!-- pi:result #t1 -->");
	expect(call, "the call's fence").toBeGreaterThan(-1);
	expect(result, "the result follows its call").toBeGreaterThan(call);
	expect(md.slice(result)).toContain("b.txt");
	expect(md.indexOf("Two files.")).toBeGreaterThan(result);
});

test("a quick bash run opens no panel: its output is the step under its call", async ({ page }) => {
	// A command the agent runs for its own work is not something to show: only
	// one the agent shows on purpose (`terminal`) or one still running long
	// enough to be watched gets a panel.
	await openApp(page, answerWith(LS_TURN));
	await write(page, "list the files here");
	await send(page);
	await turnOver(page);
	const md = await docText(page);
	expect(md.slice(md.indexOf("<!-- pi:result #t1 -->"))).toContain("b.txt");
	expect(md).not.toContain("pi:view terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(0);
});

test("the agent's terminal output streams into a read-only panel", async ({ page }) => {
	await openApp(page, answerWith(lsTurn("terminal")));
	await write(page, "list the files here");
	await send(page);
	await expect(page.locator(".doc-terminal .xterm")).toHaveCount(1, { timeout: 5000 });
	await turnOver(page);
	await expect.poll(() => panelLines(page, "t1")).toEqual(["a.txt", "b.txt"]);

	// Nothing reaches a running tool's stdin (ADR 0013): a keystroke at the
	// panel leaves the grid as it was and sends nothing to a terminal.
	await page.locator(".doc-terminal .xterm-screen").click();
	await page.keyboard.type("rm -rf /");
	expect(await panelLines(page, "t1")).toEqual(["a.txt", "b.txt"]);
	const calls = (await piLog(page)) as unknown as { calls: string[] };
	expect(calls.calls.filter((cmd) => cmd.startsWith("pty_"))).toEqual([]);
});

test("a bash run still going after three seconds opens its panel in the answer, above the prompt below it, and a steer while it runs goes", async ({ page }) => {
	// Written at the document's end, the panel sat below the trailing prompt:
	// the draft typed there was no longer the tail's, so a ⌘⏎ sent nothing.
	// Held three and a half seconds at 250 ms a step: past the long-run bound, so the
	// panel opens with what the command printed so far.
	const run = toolRun("t1", "bash", ["1\n", "2\n"]);
	const end = run.pop() as (typeof run)[number];
	await openApp(
		page,
		answerWith([toolCallAnswer("bash", "t1", { command: "count" }, "Counting."), ...run, ...hold(14), end, toolResultEnd("t1", "bash", "1\n2\n"), final("Counted."), settled()], 250),
	);
	await write(page, "count to two");
	await send(page);
	await expect(page.locator(".doc-terminal .xterm")).toHaveCount(1, { timeout: 8000 });
	await expect.poll(() => panelLines(page, "t1")).toEqual(["1", "2"]);
	await writeAtTail(page, "stop at one");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	await turnOver(page);
	const md = await docText(page);
	const panel = md.indexOf("<!-- pi:view terminal #t1 -->");
	expect(panel).toBeGreaterThan(md.indexOf("<!-- pi:tool bash #t1 -->"));
	expect(panel, "between the call and its result").toBeLessThan(md.indexOf("<!-- pi:result #t1 -->"));
	expect(md.lastIndexOf("<!-- you -->"), "the prompt below the answer is still the tail").toBeGreaterThan(md.indexOf("Counted."));
	expect(count(md, "stop at one")).toBe(1);
});

test("a tool that prints nothing opens no panel", async ({ page }) => {
	await openApp(page, answerWith([toolCallAnswer("bash", "t1", { command: "true" }, "Running it."), ...toolRun("t1", "bash", []), toolResultEnd("t1", "bash", ""), final("Done."), settled()]));
	await write(page, "run true");
	await send(page);
	await turnOver(page);
	expect(await docText(page)).toContain("<!-- pi:result #t1 -->");
	await expect(page.locator(".doc-terminal")).toHaveCount(0);
});

test("a send after a tool turn does not rebuild pi's history", async ({ page }) => {
	// The document must read back as the transcript pi holds — the call, its
	// result, the answer after — or the compare rewrites pi's history from the
	// page and pi loses what the tool returned (ADR 0021).
	const later = [final("Nothing else."), settled()];
	await openApp(
		page,
		answerBy(`(message) => ({ script: message.startsWith("list") ? ${JSON.stringify(LS_TURN)} : ${JSON.stringify(later)}, stepMs: 60 })`),
	);
	await write(page, "list the files here");
	await send(page);
	await turnOver(page);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("anything else?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await turnOver(page);
	const rebuilds = ((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds;
	expect(rebuilds).toHaveLength(0);
});

// ── History is editable, and answers are not dead text ───────────────────────
// The thing chat gets wrong and this app exists to fix (ADR 0005). The document
// IS the transcript (ADR 0002), so what you change is what pi is told next.

test("the agent's own prose is editable, and the next send still goes", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);

	// Edit the answer the agent wrote — click into it and type.
	const answer = page.locator(".cm-line", { hasText: "Four." });
	await answer.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" (in base 10)");
	await expect.poll(() => docText(page)).toContain("Four. (in base 10)");

	// Send again from the tail. `Control+End` is not enough here: the caret is
	// inside the answer, and the keypress left it there — the follow-up landed
	// mid-sentence in the agent's own prose. Click the trailing prompt's own line
	// instead, which is what a writer does.
	//
	// And pi is TOLD about the edit before the next prompt: the document is the
	// history (ADR 0002), so the transcript is rewritten from it first (ADR 0021).
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("and in base 2?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page))).toHaveLength(2);

	const log = await piLog(page);
	const prompts = promptsOf(log);
	expect(prompts[1].command.message).toContain("and in base 2?");
	const rebuilds = (log as unknown as { rebuilds: Array<{ entries: unknown[] }> }).rebuilds;
	expect(rebuilds, "the edited answer was rewritten into pi's history").toHaveLength(1);
	expect(JSON.stringify(rebuilds[0].entries)).toContain("Four. (in base 10)");
});

test("after a rebuild, the next unedited send leaves pi's history alone", async ({ page }) => {
	// A rebuild writes the document's block structure into the transcript; a
	// plain send after it adds a prompt that opens a block with no record of
	// that in the transcript. Compared on structure, the two would disagree on
	// every later send and restart pi each time — the cost the comparison
	// exists to avoid (ADR 0021 §4).
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);

	const answer = page.locator(".cm-line", { hasText: "Four." });
	await answer.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" (in base 10)");
	await expect.poll(() => docText(page)).toContain("Four. (in base 10)");

	const sendAtTail = async (text: string) => {
		await page.locator(".cm-line").last().click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type(text);
		await send(page);
	};
	await sendAtTail("and in base 2?");
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await turnOver(page);
	await sendAtTail("and in base 3?");
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(3);

	const rebuilds = ((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds;
	expect(rebuilds, "only the edit was rewritten; the plain send after it was not").toHaveLength(1);
});

// ── Each send tells pi when it is (ADR 0028) ────────────────────────────────

/** The line a send puts last, in the shape `nowLine` writes it. */
const NOW_LINE = /\n\[now: [A-Z][a-z]+day \d{4}-\d\d-\d\d \d\d:\d\d, [^\]\n]+ \(UTC[+-]\d\d:\d\d\)\]$/;

test("a send tells pi the date and time, and the document never shows it", async ({ page }) => {
	await openApp(page, answerWith([final("Monday."), settled()]));
	await write(page, "what day is it?");
	await send(page);
	await turnOver(page);
	const [prompt] = promptsOf(await piLog(page));
	expect(prompt?.command.message).toMatch(/^what day is it\?\n\[now: /);
	expect(prompt?.command.message).toMatch(NOW_LINE);
	expect(await docText(page)).not.toContain("[now:");
});

test("a second send after the first does not rebuild pi's history over the time line", async ({ page }) => {
	// pi's transcript holds each prompt WITH its time line; the document holds it
	// without. Read as an edit, that difference would rewrite pi's history and
	// restart it before every send after the first.
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("and 3+3?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await turnOver(page);
	const rebuilds = ((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds;
	expect(rebuilds).toHaveLength(0);
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(NOW_LINE);
});

// ── A send tells pi what the user's face did, in words (ADR 0055) ───────────

/** A face that lowers its brows, marked, for the first minute after a prompt's
 *  first key: over everything a flow types. */
const FROWN = JSON.stringify([{ from: 0, to: 60_000, units: [[4, "C"]] }]);
const FACE_ON = { preferences: { cellWorkPulse: true, face: true, faceExplained: true }, faceScript: FROWN };

test("with the face read, a send ends with the block before the time line, and the document never shows it", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, FACE_ON));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	const [prompt] = promptsOf(await piLog(page));
	expect(prompt?.command.message).toMatch(/^what is 2\+2\n\n\[face\]\ntyping "what is 2\+2": brows lowered marked 60\.0s\n\[now: [^\]\n]+\]$/);
	expect(await docText(page)).not.toContain("[face]");
	expect(await docText(page)).not.toContain("brows lowered");

	// pi's transcript holds the prompt WITH its block and the document without:
	// read as an edit, that would rewrite pi's history before every later send.
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("and 3+3?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await turnOver(page);
	expect(((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds).toHaveLength(0);
	// Each prompt carries the face of its own typing, and no other's.
	// (A line for the moment between the answer and the first key may come first: ADR 0060.)
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(/^and 3\+3\?\n\n\[face\]\n(?:read [^\n]+\n)?typing "and 3\+3": brows lowered marked 60\.0s\n\[now: /);
	expect(await docText(page)).not.toContain("[face]");
	// The preferences as first read are no change: no pi was stopped for them.
	expect(((await piLog(page)) as unknown as { calls: string[] }).calls).not.toContain("pi_stop");
});

test("with the face not read, a send carries no block whatever the camera would have seen", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, { faceScript: FROWN }));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message).toMatch(/^what is 2\+2\n\[now: /);
});

test("text that arrived in one piece is tied to no face, and a command of pi's carries no block", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, FACE_ON));
	await page.locator(".cm-content").first().click();
	await page.keyboard.press("Control+End");
	// In one piece, as dictation or a paste arrives: it was not typed, so no
	// moment of the face is tied to any of its words.
	await page.keyboard.insertText("pasted in one piece");
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message).toMatch(/^pasted in one piece\n\[now: /);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("/compact now");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(/^\/compact now\n\[now: /);
});

test("turning the face on or off stops this window's pi once no turn runs, so the next send starts one that knows", async ({ page }) => {
	await openApp(page, answerWith([...hold(20), final("Four."), settled()], 60, { faceScript: FROWN }));
	await write(page, "what is 2+2");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(1);
	const stops = async () => ((await piLog(page)) as unknown as { calls: string[] }).calls.filter((call) => call === "pi_stop").length;
	const streaming = await page.evaluate(() => {
		(window as unknown as { __PI_EMIT__(e: string, p: unknown): void }).__PI_EMIT__("preferences-changed", { cellWorkPulse: true, face: true, faceExplained: true });
		return (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming;
	});
	expect(streaming, "the change arrived under a running turn").toBe(true);
	expect(await stops(), "which is never stopped for it").toBe(0);
	await turnOver(page);
	await expect.poll(stops, { timeout: 5000 }).toBe(1);
});

test("a face given as what a detector saw, frame by frame, is read into the same block", async ({ page }) => {
	// Samples as a camera's source reports them, from the first key: three
	// seconds at rest, then the brows held down. A head at rest is the identity
	// transform; the scores are the model's own names.
	const rest = { browDownLeft: 0.1, browDownRight: 0.1, jawOpen: 0.02 };
	const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -35, 1];
	const samples = Array.from({ length: 300 }, (_, i) => ({ at: i * 133, faces: 1, scores: i * 133 < 3000 ? rest : { ...rest, browDownLeft: 0.6, browDownRight: 0.6 }, matrix }));
	await openApp(page, answerWith([final("ok"), settled()], 60, { preferences: { cellWorkPulse: true, face: true, faceExplained: true }, faceScript: JSON.stringify({ samples }) }));
	await page.locator(".cm-content").first().click();
	await page.keyboard.press("Control+End");
	// Typed across the moment the brows went down: the words before it are tied
	// to nothing, and the ones after it to the frown.
	await page.keyboard.type("first words typed calmly and the rest of it under a frown", { delay: 90 });
	await send(page);
	await turnOver(page);
	const [prompt] = promptsOf(await piLog(page));
	expect(prompt?.command.message).toMatch(/\n\n\[face\]\ntyping "[^"]*frown": brows lowered severe \d+\.\ds\n\[now: /);
	expect(prompt?.command.message, "what was typed before the brows moved is in no anchor").not.toMatch(/typing "first/);
});

test("a page no harness handed a face opens no camera, whatever the preference says", async ({ page }) => {
	await page.addInitScript(() => {
		const calls: unknown[] = [];
		(window as unknown as { __CAMERA_ASKS__: unknown[] }).__CAMERA_ASKS__ = calls;
		Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: (constraints: unknown) => (calls.push(constraints), Promise.reject(new Error("no camera in a test"))) }, configurable: true });
	});
	await openApp(page, answerWith([final("Four."), settled()], 60, { preferences: { cellWorkPulse: true, face: true, faceExplained: true } }));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message).toMatch(/^what is 2\+2\n\[now: /);
	expect(await page.evaluate(() => (window as unknown as { __CAMERA_ASKS__: unknown[] }).__CAMERA_ASKS__)).toEqual([]);
	expect(await page.locator("#status").textContent()).toBe("");
});

/** The face's pill, last in the model chip, and the menu it opens (`app/face/pill.ts`). */
const facePill = (page: Page) => page.locator(".model-chip .face-pill");
/** What the page asked of the host beyond pi: the commands it called, and every write of the preferences. */
const hostLog = async (page: Page) => (await piLog(page)) as unknown as { calls: string[]; preferences: Array<Record<string, unknown>> };
const faceMenu = (page: Page) => page.locator(".doc-block-menu");
const AGREED = { cellWorkPulse: true, face: true, faceExplained: true, faceCamera: "" };
/** What is passed on of a face with nothing set (`app/face/state.ts`). */
const MEASURED = { intensity: "C", minMs: 500, yaw: 12, pitch: 10 };
/** A script of steps that also says what a camera would (`app/face/scripted.ts`). */
const staged = (says: Record<string, unknown>) => ({ preferences: AGREED, faceScript: JSON.stringify({ steps: [], ...says }) });

test("the face is turned on from its pill: the first time, only after reading what is sent and agreeing", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, { faceScript: FROWN }));
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	await expect(facePill(page)).toHaveAttribute("aria-pressed", "false");
	await facePill(page).click();
	await expect(faceMenu(page)).toContainText("Your face is not read.");
	await faceMenu(page).getByRole("button", { name: "Turn on" }).click();

	// What is read, what is sent and to whom, before anything is kept.
	const sheet = page.locator(".doc-face-sheet");
	await expect(sheet).toContainText("Movements, never feelings.");
	await expect(sheet).toContainText("never leaves this window and is never stored");
	await expect(sheet.locator("pre")).toContainText('[face]\ndeleted "this is the second time": brows lowered severe');
	await expect(sheet).toContainText("to the provider of the model that answers");
	expect((await hostLog(page)).preferences, "nothing is turned on by opening it").toEqual([]);
	await sheet.getByRole("button", { name: "Not now" }).click();
	await expect(sheet).toHaveCount(0);
	expect((await hostLog(page)).preferences).toEqual([]);
	await expect(facePill(page)).toHaveAttribute("data-state", "off");

	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "Turn on" }).click();
	await page.locator(".doc-face-sheet").getByRole("button", { name: "Turn on" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await expect(facePill(page)).toHaveAttribute("aria-pressed", "true");
	expect((await hostLog(page)).preferences).toEqual([{ cellWorkPulse: true, face: true, faceExplained: true, faceCamera: "", faceTuning: MEASURED, faceSpeaks: false, updateCheck: true, updateDismissed: "" }]);

	// Agreed to once: off and on again asks nothing.
	await facePill(page).click();
	await expect(faceMenu(page)).toContainText("On. The camera is off until you type.");
	await faceMenu(page).getByRole("button", { name: "Turn off" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "Turn on" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await expect(page.locator(".doc-face-sheet")).toHaveCount(0);
});

test("a face switched on and never agreed to reads nothing, and the window in front shows what is sent; declined, the switch goes off", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, { preferences: { cellWorkPulse: true, face: true }, faceScript: FROWN }));
	const sheet = page.locator(".doc-face-sheet");
	await expect(sheet).toContainText("Movements, never feelings.");
	await expect(facePill(page)).toHaveAttribute("data-state", "ask");
	await write(page, "what is 2+2");
	await expect(facePill(page), "typing starts nothing").toHaveAttribute("data-state", "ask");
	// The pill's menu opens the same sheet.
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "Read what is sent…" }).click();
	await expect(sheet).toHaveCount(1);
	await sheet.getByRole("button", { name: "Not now" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	expect((await hostLog(page)).preferences).toEqual([{ cellWorkPulse: true, face: false, faceExplained: false, faceCamera: "", faceTuning: MEASURED, faceSpeaks: false, updateCheck: true, updateDismissed: "" }]);
	// Off, coming back to the window asks nothing.
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(sheet).toHaveCount(0);
});

test("switched on from the Preferences window, the document in front shows the sheet, and agreeing there turns the reading on", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, { faceScript: FROWN }));
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	// As Rust tells every window of a change made in another.
	await page.evaluate(() => (window as unknown as { __PI_EMIT__(e: string, p: unknown): void }).__PI_EMIT__("preferences-changed", { cellWorkPulse: true, face: true, faceExplained: false, faceCamera: "" }));
	const sheet = page.locator(".doc-face-sheet");
	await expect(sheet).toBeVisible();
	await sheet.getByRole("button", { name: "Turn on" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	expect((await hostLog(page)).preferences).toEqual([{ cellWorkPulse: true, face: true, faceExplained: true, faceCamera: "", faceTuning: MEASURED, faceSpeaks: false, updateCheck: true, updateDismissed: "" }]);
	await write(page, "hello");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
});

test("the pill says when the camera is on: from a key in a prompt until the window is no longer in front", async ({ page }) => {
	// pi says it took the prompt, as a real one does: that is what ends the watch.
	await openApp(page, answerWith([final("Four."), settled()], 60, { ...FACE_ON, promptReply: { success: true } }));
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await write(page, "what");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await expect(facePill(page)).toHaveAttribute("title", "Read my face: the camera is on");
	await page.evaluate(() => window.dispatchEvent(new Event("blur")));
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await page.keyboard.type(" is 2+2");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	// pi took the message, and its answer is read for a few seconds (ADR 0060):
	// then the camera is off until the next key.
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle", { timeout: 10_000 });
});

test("with no key for twenty seconds the camera goes off, and the next key brings it back", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([final("ok"), settled()], 60, FACE_ON));
	await write(page, "what");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(19_000);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(2_000);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await page.keyboard.type(" is 2+2");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
});

for (const [seen, state, says] of [
	["none", "no-face", "no face is in view"],
	["many", "two-faces", "more than one face is in view"],
	["turned", "turned", "Your head is turned away"],
] as const) {
	test(`with the camera on and nothing to read, the pill says why: ${state}`, async ({ page }) => {
		await openApp(page, answerWith([final("ok"), settled()], 60, staged({ seen })));
		await write(page, "hello");
		await expect(facePill(page)).toHaveAttribute("data-state", state);
		await facePill(page).click();
		await expect(faceMenu(page)).toContainText(says);
	});
}

test("a camera the system refused is said on the pill, with the way to System Settings, and never on the status line", async ({ page }) => {
	// A script that would say a frown, had a camera seen it.
	await openApp(page, answerWith([final("Four."), settled()], 60, staged({ steps: JSON.parse(FROWN), state: "refused" })));
	await write(page, "what is 2+2");
	await expect(facePill(page)).toHaveAttribute("data-state", "refused");
	await expect(page.locator("#status")).toHaveText("");
	await facePill(page).click();
	await expect(faceMenu(page)).toContainText("Piary may not use the camera");
	await faceMenu(page).getByRole("button", { name: "Open System Settings" }).click();
	await expect.poll(async () => (await hostLog(page)).calls.filter((call) => call === "open_camera_settings").length).toBe(1);
	// The message goes all the same, with no block.
	await page.locator(".cm-content").first().click();
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message).toMatch(/^what is 2\+2\n\[now: /);
	// Come back to, perhaps with the camera allowed: the next key asks again.
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
});

test("a camera that failed says why, and can be tried again; one that is absent says so", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, staged({ state: { failed: "NotReadableError: the camera is in use" } })));
	await write(page, "hello");
	await expect(facePill(page)).toHaveAttribute("data-state", "failed");
	await facePill(page).click();
	await expect(faceMenu(page)).toContainText("Your face is not read: NotReadableError: the camera is in use");
	// What the pill showed on the way, since the script fails again at once.
	await facePill(page).evaluate((pill) => {
		const shown: (string | null)[] = [];
		(window as unknown as { __FACE_SHOWN__: (string | null)[] }).__FACE_SHOWN__ = shown;
		new MutationObserver((records) => shown.push(...records.map((record) => record.oldValue))).observe(pill, { attributeFilter: ["data-state"], attributeOldValue: true });
	});
	await faceMenu(page).getByRole("button", { name: "Try again" }).click();
	await expect.poll(() => page.evaluate(() => (window as unknown as { __FACE_SHOWN__: (string | null)[] }).__FACE_SHOWN__), { message: "the camera was asked for again" }).toContain("starting");
	await expect(facePill(page)).toHaveAttribute("data-state", "failed");
});

test("with no camera the pill says so", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, staged({ state: "absent" })));
	await write(page, "hello");
	await expect(facePill(page)).toHaveAttribute("data-state", "no-camera");
	await facePill(page).click();
	await expect(faceMenu(page)).toContainText("No camera was found");
});

test("with more than one camera the pill's menu chooses which is read, and the choice is kept", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, staged({ cameras: ["FaceTime HD Camera", "Studio Display Camera"] })));
	await facePill(page).click();
	await expect(faceMenu(page).getByRole("button", { name: "Studio Display Camera" }), "no camera was read yet, so none is known").toHaveCount(0);
	await page.keyboard.press("Escape");
	await write(page, "hello");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "Studio Display Camera" }).click();
	expect((await hostLog(page)).preferences.at(-1)).toEqual({ ...AGREED, faceCamera: "Studio Display Camera", faceTuning: MEASURED, faceSpeaks: false, updateCheck: true, updateDismissed: "" });
	// Read from the chosen camera from the next key on.
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await facePill(page).click();
	await expect(faceMenu(page).getByRole("button", { name: "Studio Display Camera ·" })).toBeDisabled();
});

test("Read My Face in the menu and /face flip the same switch as the pill", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, { preferences: { cellWorkPulse: true, face: false, faceExplained: true }, faceScript: FROWN }));
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	await menu(page, "toggle-face");
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await page.locator(".cm-content").first().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("/face");
	await page.locator(".cm-tooltip-autocomplete li", { hasText: "/face" }).click();
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	expect(await docText(page), "the document keeps no trace of the gesture").not.toContain("/face");
});

test("a prompt pi refused keeps its face: sent again, it carries the block of the same typing", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, { ...FACE_ON, promptReply: { success: false, error: "no model is selected" } }));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator("#status")).toContainText("no model is selected");
	await turnOver(page);
	// The same prompt, run again from its own line: nothing new was typed.
	await page.locator(".cm-line", { hasText: "what is 2+2" }).first().click();
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	for (const sent of promptsOf(await piLog(page))) expect(sent.command.message).toMatch(/^what is 2\+2\n\n\[face\]\ntyping "what is 2\+2": brows lowered marked 60\.0s\n\[now: /);
});

test("a prompt whose own last lines look like a face block rebuilds pi's history once, not on every send", async ({ page }) => {
	// The transcript side drops a trailing face block; the document side must
	// read the same way, or after one rebuild the two never agree again.
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, 'what is 2+2\n\n[face]\ntyping "2+2": brows lowered marked 1.0s');
	await send(page);
	await turnOver(page);
	const answer = page.locator(".cm-line", { hasText: "Four." });
	await answer.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" (edited)");
	const sendAtTail = async (text: string, count: number) => {
		await page.locator(".cm-line").last().click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type(text);
		await send(page);
		await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(count);
		await turnOver(page);
	};
	await sendAtTail("and 3+3?", 2);
	await sendAtTail("and 4+4?", 3);
	const rebuilds = ((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds;
	expect(rebuilds, "the edit is rewritten once; the send after it finds pi's history in step").toHaveLength(1);
});

test("a prompt whose own last line looks like the time line rebuilds pi's history once, not on every send", async ({ page }) => {
	// The transcript side drops trailing [now: …] lines; the document side must
	// read the same way, or after one rebuild the two never agree again.
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2\n[now: my own words]");
	await send(page);
	await turnOver(page);
	const answer = page.locator(".cm-line", { hasText: "Four." });
	await answer.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" (edited)");
	const sendAtTail = async (text: string, count: number) => {
		await page.locator(".cm-line").last().click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type(text);
		await send(page);
		await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(count);
		await turnOver(page);
	};
	await sendAtTail("and 3+3?", 2);
	await sendAtTail("and 4+4?", 3);
	const rebuilds = ((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds;
	expect(rebuilds, "the edit is rewritten once; the send after it finds pi's history in step").toHaveLength(1);
});

test("re-running a prompt replaces its answer instead of stacking a second one", async ({ page }) => {
	const page1 = [
		"<!-- you -->",
		"",
		"first question",
		"",
		"<!-- pi -->",
		"",
		"the old answer",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");
	await openApp(page, answerWith([final("the new answer."), settled()]), page1);

	// Put the caret in the prompt that already has an answer, and run it again.
	await page.locator(".cm-line", { hasText: "first question" }).click();
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("the new answer.", { timeout: 5000 });

	const md = await docText(page);
	// Replaced, not appended: the old answer is gone and there is one reply.
	expect(md).not.toContain("the old answer");
	expect(md.match(/<!-- pi -->/g) ?? []).toHaveLength(1);
	expect(md).toContain("first question");
});

test("re-sending an edited prompt from the middle of its text keeps the prompt whole above the new answer", async ({ page }) => {
	const page1 = [
		"<!-- you -->",
		"",
		"There are syntax issues in your chart, fix them",
		"",
		"<!-- pi -->",
		"",
		"the old answer",
		"",
		"<!-- you -->",
		"",
		"",
	].join("\n");
	await openApp(page, answerWith([final("the new answer."), settled()]), page1);

	// Edit the sent prompt, leaving the caret inside its text, and send from there.
	await page.locator(".cm-line", { hasText: "There are syntax issues" }).click();
	await page.keyboard.press("Home");
	for (let i = 0; i < "There are ".length; i++) await page.keyboard.press("ArrowRight");
	await page.keyboard.type("still ");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("the new answer.", { timeout: 5000 });
	await turnOver(page);

	const md = await docText(page);
	const sent = md.indexOf("There are still syntax issues in your chart, fix them");
	expect(sent, "the edited prompt is still one sentence").toBeGreaterThan(md.indexOf("<!-- you -->"));
	// The prompt is a user block, and the answer is the pi block under it.
	expect(md.indexOf("<!-- pi -->")).toBeGreaterThan(sent);
	expect(md.indexOf("the new answer.")).toBeGreaterThan(md.indexOf("<!-- pi -->"));
	// Nothing of the prompt is stranded below the answer, inside pi's block.
	expect(md.slice(md.indexOf("the new answer."))).not.toContain("fix them");
	expect(md).not.toContain("the old answer");
});

test("a run past its tool-call limit is stopped, and the document says why", async ({ page }) => {
	// A model looping on a tool: the app stops it, whatever the model thinks.
	const looping = Array.from({ length: 61 }, (_, i) => ({ type: "tool_execution_start", toolCallId: `t${i}`, toolName: "bash", args: {} }));
	await openApp(page, answerWith([partial("Working"), ...looping, ...hold(40), final("never"), settled()], 20, { onAbort: [final("Working, stopped."), settled()] }));
	await write(page, "loop forever");
	await send(page);
	await expect.poll(async () => (await piLog(page)).sent.some((s) => s.command.type === "abort"), { timeout: 8000 }).toBe(true);
	await turnOver(page);
	const md = await docText(page);
	expect(md).toContain("limit of 60 tool calls");
	expect(md).not.toContain("never");
});

test("a run past pi's own estimate is steered once to stop, report and ask", async ({ page }) => {
	// The estimate is pi's; the clock and the steer are the app's (ADR 0031).
	await page.clock.install();
	const estimate = { type: "tool_execution_start", toolCallId: "b1", toolName: "budget", args: { minutes: 1, reason: "one chart" } };
	await openApp(page, answerWith([partial("Working"), estimate], 60, { state: { isStreaming: true } }));
	await write(page, "make a chart");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Working", { timeout: 5000 });
	await page.clock.fastForward(30_000);
	expect(await steersOf(page)).toEqual([]);
	await page.clock.fastForward(31_000);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toEqual([expect.stringMatching(/^\[budget\] 1 min reached — stop here/)]);
	await page.clock.fastForward(5 * 60_000);
	expect(await steersOf(page), "once per run").toHaveLength(1);
});

test("a run with no estimate is steered at the default", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([partial("Working")], 60, { state: { isStreaming: true } }));
	await write(page, "do something long");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Working", { timeout: 5000 });
	await page.clock.fastForward(4 * 60_000);
	expect(await steersOf(page)).toEqual([]);
	await page.clock.fastForward(61_000);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toEqual([expect.stringMatching(/^\[budget\] 5 min reached/)]);
});

test("the run badge says what the turn is doing, and done when it is over", async ({ page }) => {
	const bash = { type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } };
	await openApp(page, answerWith([partial("Looking"), bash, ...hold(12), final("Found it."), settled()], 100));
	const badge = page.locator(".doc-run-badge");
	await expect(badge).toHaveCount(0);
	await write(page, "look around");
	await send(page);
	await expect(badge.locator(".doc-run-label")).toHaveText(/^running bash · \d+s$/, { timeout: 5000 });
	await expect(badge.locator(".doc-run-budget")).toHaveText("max time: 5m");
	await turnOver(page);
	await expect(badge.locator(".doc-run-label")).toHaveText(/^done · \d+s$/);
	// Inside the answer block, at its top: above its label and its words.
	const at = await page.evaluate(() => {
		const top = (el: Element | null | undefined) => el?.getBoundingClientRect().top ?? -1;
		const lines = [...document.querySelectorAll(".cm-line")];
		return {
			label: top(lines.find((l) => l.textContent?.trim().toLowerCase().startsWith("agent"))),
			badge: top(document.querySelector(".doc-run-badge")),
			answer: top(lines.find((l) => l.textContent?.includes("Found it."))),
		};
	});
	expect(at.badge).toBeGreaterThan(0);
	expect(at.badge).toBeLessThan(at.label);
	expect(at.label).toBeLessThan(at.answer);
	await expect(page.locator(".doc-overlays")).not.toContainText("done");
});

test("pi's estimate shows as the max time beside the badge, and never in the conversation", async ({ page }) => {
	const call = {
		role: "assistant",
		content: [{ type: "toolCall", id: "toolu_bud001", name: "budget", arguments: { minutes: 1, reason: "one chart" } }],
	};
	const estimate = { type: "tool_execution_start", toolCallId: "toolu_bud001", toolName: "budget", args: { minutes: 1, reason: "one chart" } };
	await openApp(page, answerWith([{ type: "message_end", message: call }, estimate, ...hold(6), final("Done."), settled()], 100));
	await write(page, "make a chart");
	await send(page);
	await expect(page.locator(".doc-run-budget")).toHaveText("max time: 1m", { timeout: 5000 });
	await turnOver(page);
	expect(await docText(page), "the call is still in the file").toContain("<!-- pi:tool budget #toolu_bud001 -->");
	await expect(page.locator(".cm-content")).not.toContainText("one chart");
});

test("a cell's own status shows at the top of its artifact: blue all the run, green once it is over", async ({ page }) => {
	allowThrowingCells(page);
	const redefine = (source: string) => [
		{ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "toolu_again", name: "cell", arguments: { source, id: "bx" } }] } },
		{ type: "tool_execution_start", toolCallId: "toolu_again", toolName: "cell", args: { source, id: "bx" } },
	];
	await openApp(
		page,
		answerWith(
			[
				...cellAnswer(THROWS, "bx"),
				{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: THROWS, id: "bx" } },
				verdictAsked("bx", "q1"),
				...hold(16),
				...redefine("1 + 1"),
				verdictAsked("bx", "q2"),
				...hold(16),
				final("Fixed."),
				settled(),
			],
			150,
		),
	);
	await write(page, "make a cell");
	await send(page);
	const chip = page.locator("pi-artifact .artifact-activity");
	const frame = page.locator("pi-artifact .artifact");
	await expect(chip).toHaveAttribute("data-tone", "working", { timeout: 8000 });
	await expect(frame, "the cell being worked on pulses (cellWorkPulse)").toHaveAttribute("data-pulse", "");
	await expect(page.locator("pi-artifact .artifact-output"), "and is locked").toHaveAttribute("inert", "");
	// A failure pi goes on to fix is still the run's work: blue, not red.
	await expect(chip).toContainText("cell #bx · failed (1/3)", { timeout: 8000 });
	await expect(chip).toHaveAttribute("data-tone", "working");
	await expect(chip).toContainText("cell #bx · ran", { timeout: 8000 });
	await expect(chip, "not green while the run still runs").toHaveAttribute("data-tone", "working");
	await turnOver(page);
	await expect(chip).toHaveAttribute("data-tone", "done");
	await expect(frame).not.toHaveAttribute("data-pulse", "");
	await expect(lockedParts(page)).toHaveCount(0);
	await expect(page.locator(".doc-run-label")).not.toContainText("#bx");
});

test("the pulse over a cell being worked on is a preference: turned off mid-run it stops at once, and back on it returns", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(page, answerWith([...cellAnswer(THROWS, "bx"), { type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: THROWS, id: "bx" } }, verdictAsked("bx", "q1"), ...hold(60), final("Done."), settled()], 150));
	await write(page, "make a cell");
	await send(page);
	const chip = page.locator("pi-artifact .artifact-activity");
	const frame = page.locator("pi-artifact .artifact");
	await expect(chip).toHaveAttribute("data-tone", "working", { timeout: 8000 });
	await expect(frame, "on with nothing kept").toHaveAttribute("data-pulse", "");
	// The Preferences window changed it: Rust tells every window (ADR 0048).
	// Read within the task that delivered the change, one Lit render later, so
	// neither the run's next event nor its clock's tick can be what redrew it.
	const pulsesAfter = (cellWorkPulse: boolean) =>
		page.evaluate(async (payload) => {
			(window as unknown as { __PI_EMIT__(e: string, p: unknown): void }).__PI_EMIT__("preferences-changed", payload);
			const artifact = document.querySelector("pi-artifact") as HTMLElement & { updateComplete: Promise<unknown> };
			await artifact.updateComplete;
			return artifact.querySelector(".artifact")!.hasAttribute("data-pulse");
		}, { cellWorkPulse });
	expect(await pulsesAfter(false), "off stops the pulse at once").toBe(false);
	await expect(chip, "the run is still working: the chip alone says so").toHaveAttribute("data-tone", "working");
	await expect(page.locator("pi-artifact .artifact-output"), "and the lock was never the preference's").toHaveAttribute("inert", "");
	expect(await pulsesAfter(true), "and on brings it back").toBe(true);
});

/** A cell that draws a button counting its own clicks. */
const COUNTER =
	'const button = document.createElement("button");\nlet clicks = 0;\nbutton.textContent = "clicks: 0";\nbutton.onclick = () => (button.textContent = `clicks: ${++clicks}`);\ndisplay(button);';

/** A run that writes the counter cell and goes on working for `holds` beats. */
const counterRun = (holds: number, ...ending: PiEvent[]): PiEvent[] => [
	...cellAnswer(COUNTER, "bx"),
	{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: COUNTER, id: "bx" } },
	verdictAsked("bx", "q1"),
	...hold(holds),
	...ending,
];

/** Clicks where the counter's button is drawn, as a pointer does: a locator's
 *  click would wait for the button to take it, and a locked one never does. */
async function clickCounter(page: Page) {
	const box = await page.locator("pi-cell button").boundingBox();
	await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

const lockedParts = (page: Page) => page.locator("pi-artifact [inert]");

test("a cell the run is working on takes no click, and the same click after the run does", { tag: "@smoke" }, async ({ page }) => {
	await openApp(page, answerWith(counterRun(16, final("Done."), settled()), 150));
	await write(page, "make a counter");
	await send(page);
	const counter = page.locator("pi-cell button");
	const chip = page.locator("pi-artifact .artifact-activity");
	await expect(counter).toHaveText("clicks: 0", { timeout: 8000 });
	await expect(chip).toHaveAttribute("data-tone", "working", { timeout: 8000 });
	const before = await docText(page);
	await clickCounter(page);
	await clickCounter(page);
	await expect(chip, "the run is still working on it").toHaveAttribute("data-tone", "working");
	await expect(counter, "the widget heard neither click").toHaveText("clicks: 0");
	expect(await docText(page), "and the document is as it was").toBe(before);
	await expect(page.locator("pi-artifact .artifact-source-head"), "its controls are locked with it").toHaveAttribute("inert", "");
	await expect(chip, "the chip is outside the lock").toBeVisible();
	await turnOver(page);
	await expect(chip).toHaveAttribute("data-tone", "done");
	await expect(lockedParts(page)).toHaveCount(0);
	await clickCounter(page);
	await expect(counter).toHaveText("clicks: 1");
});

test("the lock leaves the document's text alone: prose takes typing and the caret passes the artifact", async ({ page }) => {
	await openApp(page, answerWith(counterRun(60, final("Done."), settled()), 150));
	await write(page, "make a counter");
	await send(page);
	await expect(page.locator("pi-artifact .artifact-activity")).toHaveAttribute("data-tone", "working", { timeout: 8000 });
	await expect(lockedParts(page)).not.toHaveCount(0);
	await page.locator(".cm-content").first().getByText("make a counter").click();
	await page.keyboard.press("End");
	await page.keyboard.type(" please");
	expect(await docText(page)).toContain("make a counter please");
	// Down from the prompt, through the answer and its artifact, to the end.
	const head = () => page.evaluate(() => (document.querySelector("document-chat") as unknown as { view: { state: { selection: { main: { head: number } } } } }).view.state.selection.main.head);
	for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowDown");
	expect(await head(), "the caret came out below the cell").toBeGreaterThan((await docText(page)).indexOf("```js"));
	await expect(lockedParts(page), "still locked: none of it was the run's").not.toHaveCount(0);
});

test("Escape opens the lock: a stopped run leaves its cell to the user", async ({ page }) => {
	await openApp(page, answerWith(counterRun(200, final("never"), settled()), 150, { onAbort: [final("Stopped."), settled()] }));
	await write(page, "make a counter");
	await send(page);
	const counter = page.locator("pi-cell button");
	await expect(page.locator("pi-artifact .artifact-activity")).toHaveAttribute("data-tone", "working", { timeout: 8000 });
	await clickCounter(page);
	await expect(counter).toHaveText("clicks: 0");
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await piLog(page)).sent.map((s) => s.command.type)).toContain("abort");
	await turnOver(page);
	await expect(lockedParts(page)).toHaveCount(0);
	await clickCounter(page);
	await expect(counter).toHaveText("clicks: 1");
});

test("a lock that lands while the user types in the cell's source pane leaves Escape stopping the run, with no click", async ({ page }) => {
	// A cell from an earlier turn, and a run that thinks for a while before it
	// redefines it: time for the user to open its source and start typing. The
	// redefinition moves the artifact under the new answer, which is a second
	// way for the pane to lose its focus before the lock arrives.
	const doc = "<!-- you -->\n\nmake a cell\n\n<!-- pi -->\n\n<!-- pi:cell js #bx -->\n\n```js\n1 + 1\n```\n\n<!-- you -->\n\n";
	const REDEFINED = "2 + 2";
	const run: PiEvent[] = [
		...hold(40),
		...cellAnswer(REDEFINED, "bx"),
		{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: REDEFINED, id: "bx" } },
		verdictAsked("bx", "q1"),
		...hold(200),
		final("never"),
		settled(),
	];
	await openApp(page, answerWith(run, 150, { onAbort: [final("Stopped."), settled()] }), doc);
	await expect(page.locator("pi-cell .cell-frame")).toContainText("2", { timeout: 8000 });
	await writeAtTail(page, "double it");
	await send(page);
	await page.locator("pi-artifact .doc-role-menu").click();
	await page.locator("pi-artifact .artifact-edit").click();
	const pane = page.locator("pi-artifact .artifact-code .cm-content");
	await pane.click();
	await page.keyboard.press("End");
	await page.keyboard.type(" + 40");
	await expect(pane).toContainText("1 + 1 + 40");
	expect(await page.evaluate(() => document.activeElement?.closest("pi-artifact") !== null), "the pane has the focus").toBe(true);

	await expect(page.locator("pi-artifact .artifact-activity")).toHaveAttribute("data-tone", "working", { timeout: 10_000 });
	await expect(lockedParts(page)).not.toHaveCount(0);
	expect(
		await page.evaluate(() => document.activeElement === (document.querySelector("document-chat") as unknown as { view: { contentDOM: HTMLElement } }).view.contentDOM),
		"the document has the focus the locked pane held",
	).toBe(true);
	await page.keyboard.press("Escape");
	await expect.poll(async () => (await piLog(page)).sent.map((s) => s.command.type), "Escape stopped the run").toContain("abort");
	await turnOver(page);
	await expect(lockedParts(page)).toHaveCount(0);
	await expect(pane, "and what was typed is still in the pane, to Apply or Discard").toContainText("1 + 1 + 40");
});

test("a run the provider refuses part-way leaves its cell unlocked", async ({ page }) => {
	await openApp(page, answerWith(counterRun(8, ...providerRefused("You have hit your usage limit."), settled()), 150));
	await write(page, "make a counter");
	await send(page);
	const counter = page.locator("pi-cell button");
	await expect(lockedParts(page)).not.toHaveCount(0, { timeout: 8000 });
	await turnOver(page);
	await expect(page.locator(".cm-content")).toContainText("usage limit");
	await expect(lockedParts(page)).toHaveCount(0);
	await clickCounter(page);
	await expect(counter).toHaveText("clicks: 1");
});

test("a cell redefined during a run is one fence once the run is over", async ({ page }) => {
	const answer = (source: string, callId: string) =>
		cellAnswer(source, "bx").map((event) => JSON.parse(JSON.stringify(event).replaceAll("toolu_bx", callId)) as typeof event);
	await openApp(page, answerWith([...answer("1 + 1", "toolu_first"), ...hold(25), ...answer("2 + 2", "toolu_second"), final("Done."), settled()], 40));
	await write(page, "make a cell");
	await send(page);
	// The first definition has run and shown its value before the second arrives.
	await expect(page.locator("pi-cell .cell-frame")).toContainText("2", { timeout: 5000 });
	await expect(page.locator(".cm-content")).toContainText("Done.", { timeout: 5000 });
	await turnOver(page);

	await expect.poll(async () => (await docText(page)).split("<!-- pi:cell js #bx -->").length - 1, { timeout: 5000 }).toBe(1);
	const md = await docText(page);
	expect(md).toContain("2 + 2");
	expect(md).not.toContain("1 + 1");
	await expect(page.locator("pi-cell .cell-frame"), "and what it shows is the new definition's value").toContainText("4");
	const lastWrite = () =>
		page.evaluate(() => (window as unknown as { __PI_LOG__: { writes: Array<{ content: string }> } }).__PI_LOG__.writes.at(-1)?.content);
	await expect.poll(async () => (await lastWrite())?.includes("2 + 2") && !(await lastWrite())?.includes("1 + 1"), { timeout: 5000 }).toBe(true);
});

test("a cell whose last attempt failed ends red", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(
		page,
		answerWith(
			[
				...cellAnswer(THROWS, "bx"),
				{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: THROWS, id: "bx" } },
				verdictAsked("bx", "q1"),
				...hold(16),
				final("I could not fix it."),
				settled(),
			],
			150,
		),
	);
	await write(page, "make a cell");
	await send(page);
	const chip = page.locator("pi-artifact .artifact-activity");
	await expect(chip).toContainText("failed (1/3)", { timeout: 8000 });
	await expect(chip).toHaveAttribute("data-tone", "working");
	await expect(lockedParts(page), "locked through the failure, while the run may yet fix it").not.toHaveCount(0);
	await turnOver(page);
	await expect(chip).toHaveAttribute("data-tone", "error");
	await expect(lockedParts(page), "a run that ends on a failure leaves nothing locked").toHaveCount(0);
});

test("a chart with no data is not a green ran: the chip ends amber and names what is empty", async ({ page }) => {
	// A parsed date compared with a string keeps no row, so the chart draws its
	// limit line and nothing else.
	const source =
		'const rows = [{lot: "B-1", date: new Date("2026-08-03"), purity: 99.4}];\nconst inScope = rows.filter((r) => r.date >= "2026-08-01");\ndisplay(Plot.plot({marks: [Plot.ruleY([99.0]), Plot.dot(inScope, {x: "lot", y: "purity"})]}));';
	await openApp(
		page,
		answerWith(
			[
				...cellAnswer(source, "bx"),
				{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source, id: "bx" } },
				verdictAsked("bx", "q1"),
				...hold(16),
				final("No batch is in scope."),
				settled(),
			],
			150,
		),
	);
	await write(page, "chart the lots");
	await send(page);
	const chip = page.locator("pi-artifact .artifact-activity");
	await expect(chip).toContainText("cell #bx · ran · no data: inScope has no rows", { timeout: 8000 });
	await expect(chip, "still the run's while it runs").toHaveAttribute("data-tone", "working");
	await turnOver(page);
	await expect(chip).toHaveAttribute("data-tone", "warning");
	expect((await verdictsOf(page))["q1"], "pi is told, as a write that counts").toMatchObject({ verdict: "empty", cell: "bx", names: ["inScope"], attempt: 1 });
});

test("a chart with no data stays amber when the run goes on to write another cell", async ({ page }) => {
	const chart = 'const inScope = [{lot: "B-1"}].filter(() => false);\ndisplay(Plot.plot({marks: [Plot.ruleY([99.0]), Plot.dot(inScope, {x: "lot", y: "lot"})]}));';
	const next = [
		{ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", id: "toolu_by", name: "cell", arguments: { source: "1 + 1", id: "by" } }] } },
		{ type: "tool_execution_start", toolCallId: "toolu_by", toolName: "cell", args: { source: "1 + 1", id: "by" } },
	];
	await openApp(
		page,
		answerWith(
			[
				...cellAnswer(chart, "bx"),
				{ type: "tool_execution_start", toolCallId: "toolu_bx", toolName: "cell", args: { source: chart, id: "bx" } },
				verdictAsked("bx", "q1"),
				...hold(16),
				...next,
				verdictAsked("by", "q2"),
				...hold(16),
				final("Done."),
				settled(),
			],
			150,
		),
	);
	await write(page, "chart the lots");
	await send(page);
	const chip = page.locator("pi-artifact .artifact-activity");
	await expect(chip).toContainText("cell #by · ran", { timeout: 10000 });
	await turnOver(page);
	// The later cell ran, and that is not the chart's verdict.
	await expect(chip).toHaveCount(1);
	await expect(chip).toContainText("cell #bx · ran · no data: inScope has no rows");
	await expect(chip).toHaveAttribute("data-tone", "warning");
	expect((await verdictsOf(page))["q2"]).toMatchObject({ verdict: "ok" });
});

test("one undo takes an edit back whole", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);
	const before = await docText(page);

	await page.locator(".cm-line", { hasText: "Four." }).click();
	await page.keyboard.press("End");
	await page.keyboard.type(" and a bit");
	await expect.poll(() => docText(page)).toContain("Four. and a bit");

	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${mod}+z`);
	// Back to exactly what the turn left.
	await expect.poll(() => docText(page)).toBe(before);

	// And a SECOND press does not step into the machine's writes — they are kept
	// out of the history on purpose, so ⌘Z mid-conversation undoes your own
	// typing and never un-writes the answer. One press alone cannot show this:
	// it passes whether or not the splices are in the history, which is why the
	// first version of this flow survived putting them back in.
	await page.keyboard.press(`${mod}+z`);
	await afterFrames(page);
	const twice = await docText(page);
	expect(twice).toContain("Four.");
	expect(twice).toContain("<!-- pi -->");
});

// ── The document survives ────────────────────────────────────────────────────
// The file is the truth (ADR 0001), so an edit that is not saved is a lie the
// page tells until it is reloaded.

test("an edit is handed to the store, and a reload shows it", { tag: "@smoke" }, async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()]));
	await write(page, "remember this");
	// The save is debounced: wait for it to land rather than past it.
	const writes = () =>
		page.evaluate(() => (window as unknown as { __PI_LOG__: { writes: Array<{ id: string; content: string }> } }).__PI_LOG__.writes);
	await expect.poll(async () => (await writes()).at(-1)?.content).toContain("remember this");
	const saved = await writes();

	// The other half, and the one a user actually experiences: reopen the window
	// and the text is there. The store answers `docs_read` from what was written
	// rather than from the seed, which is what a real reload does.
	const stored = saved[saved.length - 1].content;
	await page.addInitScript({ content: answerWith([settled()]) });
	await page.addInitScript(
		`(() => {
			const real = window.__TAURI_INTERNALS__.invoke;
			window.__TAURI_INTERNALS__.invoke = (command, args) =>
				command === "docs_read" ? Promise.resolve(${JSON.stringify(stored)}) : real(command, args);
		})();`,
	);
	await page.goto("/");
	await expect(page.locator(".cm-content")).toContainText("remember this", { timeout: 5000 });
});

test("a save that fails says so, and the next one that lands takes the notice down", async ({ page }) => {
	// Losing work quietly is worse than saying so (ADR 0011) — and a "Not saved"
	// still showing after a save landed would be the opposite lie.
	await openApp(page, answerWith([settled()], 60, { writeFailures: { 0: "the disk is full" } }));
	await write(page, "first");
	await expect(page.locator("#status")).toHaveText("Not saved: the disk is full", { timeout: 5000 });
	await expect(page.locator("#status")).toBeVisible();

	await page.keyboard.type(" and second");
	await expect.poll(async () => (await storeLog(page)).landed.length, { timeout: 5000 }).toBe(1);
	await expect(page.locator("#status")).toHaveText("");
});

/** What the store was handed, and every command in order — the order is the
 *  assertion when the claim is "written, then answered". */
const storeLog = (page: Page) =>
	page.evaluate(
		() =>
			(
				window as unknown as {
					__PI_LOG__: {
						writes: Array<{ id: string; content: string }>;
						landed: Array<{ id: string; content: string }>;
						calls: string[];
					};
				}
			).__PI_LOG__,
	);

/** The host asking this window to end its turn and flush, as Rust does before
 *  a quit or a window close (ADR 0019 §2). */
const askToFlush = (page: Page, turnBoundMs: number) =>
	page.evaluate(
		(bound) =>
			(window as unknown as { __PI_EMIT__: (name: string, payload: unknown) => void }).__PI_EMIT__("exit-flush", {
				turnBoundMs: bound,
			}),
		turnBoundMs,
	);

/** The last document the store was handed before the page answered the flush
 *  — a debounced save landing afterwards must not be what passes the test. */
function writtenBeforeAnswer(log: { writes: Array<{ content: string }>; calls: string[] }): string | undefined {
	const answeredAt = log.calls.indexOf("exit_flushed");
	const count = log.calls.slice(0, answeredAt).filter((call) => call === "docs_write").length;
	return answeredAt < 0 ? undefined : log.writes[count - 1]?.content;
}

/** The page has answered the flush request. */
const flushAnswered = (page: Page) =>
	page.waitForFunction(
		() => (window as unknown as { __PI_LOG__: { calls: string[] } }).__PI_LOG__.calls.includes("exit_flushed"),
		undefined,
		{ timeout: 5000 },
	);

test("quitting mid-answer ends the turn, saves what it finalized, then answers", async ({ page }) => {
	// A long answer pi is still writing when the quit comes. The abort is
	// honoured: pi finalizes the answer so far and settles. What must reach the
	// store is that finalized text — written AFTER the abort, because a flush
	// taken first would be a snapshot of half an answer.
	await openApp(
		page,
		answerWith([partial("One"), partial("One two"), partial("One two three"), final("never sent"), settled()], 400, {
			onAbort: [final("One, stopped."), settled()],
		}),
	);
	await write(page, "count");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("One", { timeout: 5000 });

	await askToFlush(page, 2000);
	await flushAnswered(page);

	expect((await piLog(page)).sent.map((sent) => sent.command.type)).toContain("abort");
	const flushed = writtenBeforeAnswer(await storeLog(page));
	expect(flushed, "the buffer was written before the host was answered").toBeDefined();
	expect(flushed).toContain("One, stopped.");
	expect(flushed).not.toContain("never sent");
});

test("a pi that ignores the abort cannot hold the flush hostage", async ({ page }) => {
	// No `onAbort`: the abort is recorded and nothing follows. The page still
	// writes what it has once its bound passes, and still answers — a quit must
	// cost at most the bound, never a hang.
	await openApp(page, answerWith([partial("Half"), partial("Half an"), final("Half an answer."), settled()], 3000));
	await write(page, "go");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half", { timeout: 5000 });

	await askToFlush(page, 300);
	await flushAnswered(page);

	expect(writtenBeforeAnswer(await storeLog(page))).toContain("Half");
});

test("with no turn running, a flush writes the buffer and answers", async ({ page }) => {
	await openApp(page, answerWith([settled()]));
	await write(page, "typed just before quitting");
	// Asked before the save debounce could have fired: the flush is the save.
	await askToFlush(page, 2000);
	await flushAnswered(page);

	expect(acted(await piLog(page)), "no turn, so nothing to abort").toHaveLength(0);
	expect(writtenBeforeAnswer(await storeLog(page))).toContain("typed just before quitting");
});

test("typing while the stored document loads cannot replace it", async ({ page }) => {
	// The boot race (ADR 0018 §2): the store answers a beat after the window is
	// up, and a reader starts typing at once. The stored conversation is the
	// base; whatever is typed lands in it, and nothing written afterwards can
	// lose it.
	const STORED = "<!-- you -->\n\nthe question from yesterday\n\n<!-- pi -->\n\nThe answer from yesterday.\n\n<!-- you -->\n\n";
	await page.addInitScript({ content: answerWith([settled()], 60, { stored: { content: STORED, delayMs: 400 } }) });
	await page.goto("/");
	await page.locator(".cm-content").click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type("and today");

	await expect(page.locator(".cm-content")).toContainText("The answer from yesterday.");
	await expect(page.locator(".cm-content")).toContainText("and today");
	await expect.poll(async () => (await storeLog(page)).writes.length).toBeGreaterThan(0);
	const log = await storeLog(page);
	expect(log.writes.at(-1)!.content).toContain("The answer from yesterday.");
	expect(log.writes.at(-1)!.content).toContain("and today");
});

test("a slow save cannot land after the flush that followed it", async ({ page }) => {
	// The first save syncs slowly; the flush asked for meanwhile carries newer
	// text. Writes finishing out of order would leave the older document as the
	// file, and the quit that followed would make it final.
	await openApp(page, answerWith([settled()], 60, { writeDelaysMs: [800] }));
	await write(page, "first");
	// Past the debounce, so the slow save is in flight.
	await expect.poll(async () => (await storeLog(page)).writes.length).toBeGreaterThan(0);
	await page.keyboard.type(" and second");
	await askToFlush(page, 2000);
	await flushAnswered(page);

	const atAnswer = await storeLog(page);
	const madeBeforeAnswer = atAnswer.writes.length;
	// Wait for every write made before the answer to land. The page is still
	// running here, so a debounced save may follow the flush; a quitting app
	// has exited by then, so only the writes made before the answer count.
	const lastToLand = () =>
		page.evaluate((made) => {
			const log = (
				window as unknown as {
					__PI_LOG__: { writes: Array<{ content: string }>; landed: Array<{ content: string }> };
				}
			).__PI_LOG__;
			const before = log.writes.slice(0, made);
			const landed = log.landed.filter((write) => before.includes(write));
			return landed.length === made ? landed.at(-1)?.content : undefined;
		}, madeBeforeAnswer);
	await expect
		.poll(lastToLand, { message: "the newest save made before the answer is the one the file keeps", timeout: 5000 })
		.toContain("first and second");
});

// ── Someone else edits the file ──────────────────────────────────────────────
// A conversation is a file anyone may edit (ADR 0001), so another editor or a
// `git checkout` can change it while a window has it open. The watcher says so
// and the page reconciles the buffer to the file, in place (ADR 0018 §3).
//
// These are the rows that prove the PAGE subscribes. The probe in `app/main.ts`
// listens for the same event with a listener of its own, so it proves the
// event crosses into a real webview and nothing about what the page does with
// it (TEST_ARCHITECTURE.md §4, "a test that supplies the consumer"). Here the
// harness only changes the file and raises the event, as the store and the
// watcher would; everything after that is the page's own wiring.

/** The id the page's document is stored under when booted with `?doc=`. */
const DOC_ID = "scratch";

/** Another program writes the file; the watcher then reports it. */
const editOutside = (page: Page, content: string, id = DOC_ID) =>
	page.evaluate(
		([docId, text]) =>
			(window as unknown as { __PI_EXTERNAL_EDIT__: (id: string, content: string) => void }).__PI_EXTERNAL_EDIT__(
				docId,
				text,
			),
		[id, content] as const,
	);

/** The watcher reporting a document, with no change of its own — which is
 *  what the page's own save looks like by the time it comes back. */
const watcherReports = (page: Page, id = DOC_ID) =>
	page.evaluate(
		(docId) =>
			(window as unknown as { __PI_EMIT__: (name: string, payload: unknown) => void }).__PI_EMIT__(
				"doc-changed",
				docId,
			),
		id,
	);

/** How many times the page has read the store. A report is handled by
 *  reading the file, so a new read is the page having taken the report up. */
const reads = async (page: Page) => (await storeLog(page)).calls.filter((call) => call === "docs_read").length;

/** Raise a report and wait until the page has read the file in answer, plus a
 *  beat for what it does with the text. Without the read to wait on, a "nothing
 *  changed" assertion could run before the page had looked at all. */
async function reported(page: Page, raise: () => Promise<unknown>) {
	const before = await reads(page);
	await raise();
	await expect.poll(() => reads(page), { timeout: 5000 }).toBeGreaterThan(before);
	await afterFrames(page);
}

const landedCount = async (page: Page) =>
	page.evaluate(() => (window as unknown as { __PI_LOG__: { landed: unknown[] } }).__PI_LOG__.landed.length);

const NOTES = "# Notes\n\nFirst line.\n\nSecond line.\n";

test("the page's own save coming back from the watcher changes nothing", async ({ page }) => {
	// The row a naive subscriber fails. The store's rename lands on the
	// document's own name, so the watcher reports every save this page makes.
	// By the time that report is read, the writer has typed on: the file holds
	// the save, the buffer holds more. Applying the file would take the newer
	// keystrokes back out; refusing it as an outside edit would tell the writer
	// someone else changed a file nobody else touched.
	await openApp(page, answerWith([settled()]));
	await write(page, "saved part");
	await expect.poll(() => landedCount(page), { timeout: 5000 }).toBe(1);
	await page.keyboard.type(" and unsaved part");

	await reported(page, () => watcherReports(page));

	expect(await docText(page)).toContain("saved part and unsaved part");
	await expect(page.locator("#status")).toHaveText("");
});

test("a save that lands while the next is still syncing is still the page's own", async ({ page }) => {
	// Two saves, the second queued behind a first that has landed. The report
	// for the first arrives while the second is still syncing: the file holds
	// the first, the buffer is the second, and nothing has been typed since.
	// Remembering only the LATEST write calls the first an outside edit and
	// winds the buffer back to it.
	await openApp(page, answerWith([settled()], 60, { writeDelaysMs: [0, 2000] }));
	await write(page, "one");
	await expect.poll(() => landedCount(page), { timeout: 5000 }).toBe(1);
	await page.keyboard.type(" two");
	await expect.poll(async () => (await storeLog(page)).writes.length, { timeout: 5000 }).toBe(2);
	expect(await landedCount(page), "the second save is still syncing").toBe(1);

	await reported(page, () => watcherReports(page));

	expect(await docText(page)).toContain("one two");
	await expect(page.locator("#status")).toHaveText("");
});

test("an edit made in another editor reaches the open document, and the caret stays", async ({ page }) => {
	await openApp(page, answerWith([settled()]), NOTES);
	await page.locator(".cm-line", { hasText: "First line." }).click();
	await page.keyboard.press("End");

	await editOutside(page, `${NOTES}\nEdited from the shell.\n`);
	await expect(page.locator(".cm-content")).toContainText("Edited from the shell.", { timeout: 5000 });

	// The caret is where the writer left it — a reload would have put it at the
	// end of the page, under the edit.
	await page.keyboard.type(" Typed.");
	const md = await docText(page);
	expect(md).toContain("First line. Typed.");
	expect(md).toContain("Edited from the shell.");
});

test("a report for another document leaves this one alone", async ({ page }) => {
	await openApp(page, answerWith([settled()]), NOTES);
	// This document's file changes WITHOUT a report of its own, and another
	// document's report follows. A page that read its own file on any report
	// would pick the change up here.
	await page.evaluate(
		([id, text]) => {
			const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => unknown } })
				.__TAURI_INTERNALS__;
			const real = internals.invoke;
			internals.invoke = (command, args) =>
				command === "docs_read" && (args as { id: string }).id === id ? Promise.resolve(text) : real(command, args);
		},
		[DOC_ID, `${NOTES}\nChanged quietly.\n`] as const,
	);
	await editOutside(page, "Another conversation.\n", "another-conversation");
	await afterFrames(page);
	expect(await docText(page)).not.toContain("Changed quietly.");

	// The control: the same page, this document's own report, picks it up.
	await watcherReports(page);
	await expect(page.locator(".cm-content")).toContainText("Changed quietly.", { timeout: 5000 });
});

test("an outside edit does not take back keystrokes the page has not saved yet", async ({ page }) => {
	// The writer is mid-sentence — typed, not yet saved — when the file changes
	// underneath. The keystrokes exist nowhere but this window; the outside
	// edit is still in whatever made it. So the window keeps its copy, says so,
	// and its next save is what the file holds.
	await openApp(page, answerWith([settled()]));
	await write(page, "kept here");
	await reported(page, () => editOutside(page, `${EMPTY}from elsewhere\n`));

	let md = await docText(page);
	expect(md).toContain("kept here");
	expect(md).not.toContain("from elsewhere");
	await expect(page.locator("#status")).toContainText("changed outside");

	await expect.poll(async () => (await storeLog(page)).landed.at(-1)?.content ?? "", { timeout: 5000 }).toContain(
		"kept here",
	);
	md = await docText(page);
	expect(md).not.toContain("from elsewhere");
});

test("an outside edit does not land under an answer being written", async ({ page }) => {
	// The buffer is saved — the first chunk's save has landed and nothing has
	// been typed since — but a turn is still writing into it. Splicing the file
	// in now would move text under the agent's pen.
	await openApp(page, answerWith([partial("Half"), final("Half an answer."), settled()], 2500));
	await write(page, "go");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Half", { timeout: 5000 });
	await expect
		.poll(async () => (await storeLog(page)).landed.at(-1)?.content ?? "", { timeout: 5000 })
		.toContain("Half");
	expect(await streaming(page), "the turn is still running").toBe(true);

	await reported(page, () => editOutside(page, `${EMPTY}from elsewhere\n`));

	expect(await docText(page)).not.toContain("from elsewhere");
	await expect(page.locator("#status")).toContainText("changed outside");
	await expect(page.locator(".cm-content")).toContainText("Half an answer.", { timeout: 5000 });
	await turnOver(page);
	expect(await docText(page)).not.toContain("from elsewhere");
});

/** A document in a format version this build does not know. */
const FUTURE = "---\npi: v9\n---\n\n<!-- you -->\n\nwritten by a newer Piary\n";

test("an outside edit to a newer format version is shown and never written back", async ({ page }) => {
	await openApp(page, answerWith([settled()]), NOTES);
	await editOutside(page, FUTURE);
	await expect(page.locator(".cm-content")).toContainText("written by a newer Piary", { timeout: 5000 });

	// Past the save that the reconcile itself schedules: the page refuses it.
	await page.waitForTimeout(PAST_THE_SAVE_DEBOUNCE_MS);
	expect((await storeLog(page)).writes, "a newer version may be rendered, not rewritten").toHaveLength(0);
	await expect(page.locator("#status")).toContainText("pi: v9");
});

test("unsaved keystrokes are not saved over a newer format version", async ({ page }) => {
	// The two rules meet: the writer's keystrokes are kept, AND the file the
	// outside edit left is one this build must not rewrite (document-format.md
	// §Frontmatter). Keeping the keystrokes may not cost the newer file.
	await openApp(page, answerWith([settled()]));
	await write(page, "kept here");
	await reported(page, () => editOutside(page, FUTURE));
	expect(await docText(page)).toContain("kept here");

	await page.waitForTimeout(PAST_THE_SAVE_DEBOUNCE_MS);
	expect((await storeLog(page)).writes, "nothing written over the newer file").toHaveLength(0);
	await expect(page.locator("#status")).toContainText("pi: v9");
});

// ── What pi delivers mid-turn ────────────────────────────────────────────────
// A steer is a user message in pi's transcript, between two answers. The page
// writes it where it arrived, folded into the block, or the next send's history
// compare sees it only on pi's side and rebuilds it away (`notebook-cells.md`
// §Policy: nothing is said to the agent unseen).

/** Delivers a user message on pi's stream, as pi does a steer it took. */
const deliver = (page: Page, text: string) =>
	page.evaluate((text) => {
		(window as unknown as { __PI_EMIT__: (name: string, payload: unknown) => void }).__PI_EMIT__("pi-event", [
			"scratch",
			{ type: "message_start", message: { role: "user", content: [{ type: "text", text }] } },
		]);
	}, text);

test("a message pi delivers mid-turn is written where it arrived, folded into the block", async ({ page }) => {
	await openApp(
		page,
		answerWith([partial("First part."), final("First part."), { type: "noop" }, { type: "noop" }, partial("Then the rest."), final("Then the rest."), settled()], 250),
	);
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await deliver(page, "STEERED mid-turn");
	await expect(page.locator(".cm-content")).toContainText("Then the rest.", { timeout: 5000 });
	await turnOver(page);
	const md = await docText(page);
	const at = (needle: string) => md.indexOf(needle);
	expect(at("First part.")).toBeGreaterThan(-1);
	expect(md).toContain("<!-- pi:block -->\n\n<!-- you -->\n\nSTEERED mid-turn");
	expect(at("First part.")).toBeLessThan(at("STEERED mid-turn"));
	expect(at("STEERED mid-turn")).toBeLessThan(at("Then the rest."));
});

test("the prompt's own echo is not written twice", async ({ page }) => {
	// A negative: the old page ignored every user message, so this passed
	// before the echo was handled. The row above is its control — the same
	// stream, a delivered message written.
	await openApp(page, answerWith([partial("Four"), final("Four."), settled()]));
	await write(page, "what is 2+2");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);
	expect((await docText(page)).split("what is 2+2").length - 1).toBe(1);
});

test("a user message before the prompt is sent is not written", async ({ page }) => {
	await openApp(page, answerWith([partial("Four"), final("Four."), settled()], 60, { entriesDelayMs: 800 }));
	await write(page, "what is 2+2");
	await send(page);
	// The preflight's `get_entries` is still out: nothing has been prompted.
	await expect.poll(async () => (await piLog(page)).sent.some((s) => s.command.type === "get_entries")).toBe(true);
	expect(promptsOf(await piLog(page))).toHaveLength(0);
	await deliver(page, "NOT the user");
	await expect(page.locator(".cm-content")).toContainText("Four.", { timeout: 5000 });
	await turnOver(page);
	expect(await docText(page)).not.toContain("NOT the user");
});

// ── The user steers a running turn, or queues a follow-up ────────────────────
// A send while a turn runs is handed to it: ⌘⏎ steers, ⇧⌘⏎ queues a follow-up.
// What goes is the tail's draft alone, carried as a prompt is. It leaves the
// tail once pi takes it, and comes back once, where pi delivers it.

/** ⇧⌘⏎ on macOS, Shift+Ctrl+⏎ elsewhere: a follow-up, mid-turn. */
async function queue(page: Page) {
	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`Shift+${mod}+Enter`);
}

/** The follow-ups pi was sent, by message. */
const followUpsOf = async (page: Page) =>
	(await piLog(page)).sent.filter((s) => s.command.type === "follow_up").map((s) => s.command.message ?? "");

/** An answer, a pause to act in, then the rest of it. */
const LONG_TURN = [
	partial("First part."),
	final("First part."),
	{ type: "noop" },
	{ type: "noop" },
	{ type: "noop" },
	partial("Then the rest."),
	final("Then the rest."),
	settled(),
];

/** How many times `needle` is in `md`. */
const count = (md: string, needle: string) => md.split(needle).length - 1;

test("⌘⏎ mid-turn steers: the draft leaves the tail and lands once, folded, where pi delivered it", async ({ page }) => {
	await openApp(page, answerWith(LONG_TURN, 250));
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await write(page, "stop at ten");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	expect((await steersOf(page))[0]).toMatch(/^stop at ten\n\[now: /);
	await turnOver(page);
	const md = await docText(page);
	expect(count(md, "stop at ten"), "written once, not left in the tail too").toBe(1);
	expect(md).toContain("<!-- pi:block -->\n\n<!-- you -->\n\nstop at ten");
	expect(md.indexOf("First part.")).toBeLessThan(md.indexOf("stop at ten"));
	expect(md.indexOf("stop at ten")).toBeLessThan(md.indexOf("Then the rest."));
	expect(md).not.toContain("[now:");
});

test("⇧⌘⏎ mid-turn queues a follow-up, written after the first answer", async ({ page }) => {
	// pi delivers a follow-up in the same tick as the answer it waited for, so
	// its echo and its answer must each open after that answer, not over it.
	await openApp(page, answerWith([partial("First part."), { type: "noop" }, { type: "noop" }, { type: "noop" }, final("First part, whole."), settled()], 250));
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await write(page, "then summarise");
	await queue(page);
	await expect.poll(() => followUpsOf(page), { timeout: 5000 }).toHaveLength(1);
	expect((await followUpsOf(page))[0]).toMatch(/^then summarise\n\[now: /);
	expect(await steersOf(page), "queued, not steered").toEqual([]);
	await expect.poll(async () => count(await docText(page), "then summarise"), { message: "out of the tail while it waits" }).toBe(0);
	await expect(page.locator(".cm-content")).toContainText(FOLLOW_UP_ANSWER, { timeout: 5000 });
	await turnOver(page);
	const md = await docText(page);
	expect(count(md, "First part, whole."), "the first answer is kept whole").toBe(1);
	expect(count(md, "then summarise")).toBe(1);
	expect(count(md, FOLLOW_UP_ANSWER)).toBe(1);
	expect(md).toContain("<!-- pi:block -->\n\n<!-- you -->\n\nthen summarise");
	expect(md.indexOf("First part, whole.")).toBeLessThan(md.indexOf("then summarise"));
	expect(md.indexOf("then summarise")).toBeLessThan(md.indexOf(FOLLOW_UP_ANSWER));
});

test("the run badge says 1 queued while a follow-up waits, and drops it once pi delivers it", async ({ page }) => {
	// A steer is delivered on the next tick, so its count is gone before it
	// can be read; a follow-up waits for the answer.
	await openApp(page, answerWith([partial("First part."), { type: "noop" }, { type: "noop" }, { type: "noop" }, final("First part, whole."), settled()], 250));
	const label = page.locator(".doc-run-badge .doc-run-label");
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await expect(label).not.toContainText("queued");
	await write(page, "then summarise");
	await queue(page);
	await expect(label).toHaveText(/^\w[\w ]* · \d+s · 1 queued$/, { timeout: 5000 });
	await expect(page.locator(".cm-content")).toContainText(FOLLOW_UP_ANSWER, { timeout: 5000 });
	await expect(label).not.toContainText("queued");
	await turnOver(page);
	await expect(label).toHaveText(/^done · \d+s$/);
});

test("a refused steer keeps the draft and says why", async ({ page }) => {
	await openApp(page, answerWith(LONG_TURN, 250, { steerReply: { success: false, error: "pi is compacting" } }));
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await write(page, "stop at ten");
	await send(page);
	await expect(page.locator("#status")).toContainText("pi is compacting", { timeout: 5000 });
	await turnOver(page);
	const md = await docText(page);
	expect(count(md, "stop at ten")).toBe(1);
	expect(md.trimEnd().endsWith("<!-- you -->\n\nstop at ten"), "still the tail's draft").toBe(true);
});

test("with the caret in a mid-page prompt, a mid-turn send steers with the tail draft, and the mid-page prompt is untouched", async ({ page }) => {
	// Steering with the caret's prompt and clearing the tail would hand pi old
	// text and lose the draft.
	const EARLIER = "<!-- you -->\n\nan earlier ask\n\n<!-- pi -->\n\nAn earlier answer.\n\n";
	await openApp(page, answerWith(LONG_TURN, 250), `${EARLIER}<!-- you -->\n\n`);
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await writeAtTail(page, "the tail draft");
	await page.locator(".cm-line", { hasText: "an earlier ask" }).click();
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	expect((await steersOf(page))[0]).toMatch(/^the tail draft\n\[now: /);
	await turnOver(page);
	const md = await docText(page);
	expect(md.startsWith(EARLIER), "the mid-page prompt and its answer are as they were").toBe(true);
	expect(count(md, "the tail draft")).toBe(1);
	expect(promptsOf(await piLog(page))).toHaveLength(1);
});

test("a mid-turn send with no draft sends nothing", async ({ page }) => {
	await openApp(page, answerWith(LONG_TURN, 250));
	await write(page, "go on");
	await send(page);
	await expect(page.locator(".cm-content")).toContainText("First part.", { timeout: 5000 });
	await write(page, "");
	await send(page);
	await queue(page);
	// An empty draft is not refused, it is nothing to send: no notice either.
	await afterFrames(page);
	await expect(page.locator("#status")).not.toContainText("A turn is already running.");
	await turnOver(page);
	expect(await steersOf(page)).toEqual([]);
	expect(await followUpsOf(page)).toEqual([]);
	expect(promptsOf(await piLog(page))).toHaveLength(1);
});

// ── A failing cell steers the turn ───────────────────────────────────────────
// `notebook-cells.md` §Policy: a cell the turn wrote that fails is reported to
// pi while the turn runs, at most three times a run, once per failure, and never
// once the run is over.

/** The steers pi was sent, by message. */
const steersOf = async (page: Page) =>
	(await piLog(page)).sent.filter((s) => s.command.type === "steer").map((s) => s.command.message ?? "");

/** Steps that keep a turn open after its cells have run. */
const hold = (n: number) => Array.from({ length: n }, () => ({ type: "noop" }));

const THROWS = 'throw new Error("boom")';

/** Types into the trailing prompt itself. Once a turn has written cells, a
 *  click on the editor's middle can land on one, and keys typed there are the
 *  cell's. */
async function writeAtTail(page: Page, text: string) {
	await page.locator(".cm-content").first().locator(".cm-line").last().click();
	await page.keyboard.type(text);
}

/** The `cell` tool asking how cell `id` ran, as rpc mode puts an `input`
 *  dialog on the wire (`pi-extension/cell.ts`). */
const verdictAsked = (id: string, requestId = `q_${id}`) => ({
	type: "extension_ui_request",
	id: requestId,
	method: "input",
	title: "piary:cell-verdict",
	placeholder: JSON.stringify({ id }),
});

/** The page's answers to verdict requests, by request id. */
const verdictsOf = async (page: Page) =>
	Object.fromEntries(
		(await piLog(page)).sent
			.filter((s) => s.command.type === "extension_ui_response")
			.map((s) => {
				const command = s.command as unknown as { id: string; value: string };
				return [command.id, JSON.parse(command.value) as { verdict: string; error?: string; attempt?: number }];
			}),
	);

test("the cell tool is answered with how the cell ran, so pi fixes it in the same turn", async ({ page }) => {
	allowThrowingCells(page);
	// The last cell of the turn, the one the sweep's report used to miss: pi
	// asks before it writes another word, and the answer is the failure.
	await openApp(page, answerWith([...cellAnswer(THROWS, "bx"), verdictAsked("bx"), ...hold(10), final("Fixed."), settled()], 250));
	await write(page, "make a cell");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["q_bx"], { timeout: 8000 }).toMatchObject({ verdict: "failed", attempt: 1 });
	expect((await verdictsOf(page))["q_bx"]!.error).toMatch(/boom/);
	await turnOver(page);
	// Told once: the sweep does not steer the same failure again.
	expect(await steersOf(page)).toEqual([]);
});

/** The `canvas_edit` tool asking the page to change prose already in the
 *  document (`pi-extension/canvas-edit.ts`, ADR 0033). */
const editAsked = (oldText: string, newText: string, requestId = "e1") => ({
	type: "extension_ui_request",
	id: requestId,
	method: "input",
	title: "piary:canvas-edit",
	placeholder: JSON.stringify({ oldText, newText }),
});

const TYPO = "<!-- you -->\n\n# Teh plan\n\nShip on Friday.\n\n<!-- pi -->\n\nFriday works.\n\n<!-- you -->\n\n";

test("pi fixes an earlier block through its canvas tool: the block changes in place, and the tool is told", async ({ page }) => {
	await openApp(page, answerWith([editAsked("# Teh plan", "# The plan"), ...hold(6), final("Fixed the heading."), settled()], 150), TYPO);
	await write(page, "fix the heading's typo");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toEqual({ ok: true });
	// In view, the changed text is lit where it is, and no link is offered.
	await expect(page.locator(".doc-edit-lit", { hasText: "The plan" })).toBeVisible();
	await expect(page.locator(".doc-edit-jump-above")).toBeHidden();
	await turnOver(page);
	const md = await docText(page);
	expect(md).toMatch(/^<!-- you -->\n\n# The plan\n\nShip on Friday\./);
	expect(md).not.toContain("Teh plan");
	// The answer still lands under the prompt, past the edit above it.
	expect(md.indexOf("Fixed the heading.")).toBeGreaterThan(md.indexOf("fix the heading's typo"));
	// The user's ⌘Z takes pi's edit back like any edit to their text.
	await page.locator(".cm-line", { hasText: "The plan" }).click();
	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${mod}+z`);
	await expect.poll(() => docText(page)).toContain("# Teh plan");
});

/** `TYPO`, with more plan under the heading than a window shows. */
const TALL_TYPO = `<!-- you -->\n\n# Teh plan\n\n${Array.from({ length: 60 }, (_, i) => `Step ${i + 1} of the plan.\n\n`).join("")}<!-- pi -->\n\nNoted.\n\n<!-- you -->\n\n`;

test("a canvas edit out of view is one click away: a link goes to it, the changed text is lit, then fades (ADR 0067)", async ({ page }) => {
	await openApp(page, answerWith([editAsked("# Teh plan", "# The plan"), ...hold(6), final("Fixed the heading."), settled()], 150), TALL_TYPO);
	// The reader is at the foot of the page, writing the next prompt.
	await page.locator(".cm-scroller").first().hover();
	await page.mouse.wheel(0, 20000);
	await expect(page.locator(".cm-line", { hasText: "Noted." })).toBeInViewport();
	await writeAtTail(page, "fix the heading's typo");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toEqual({ ok: true });
	const link = page.locator(".doc-edit-jump-above");
	await expect(link).toBeVisible();
	await expect(link).toHaveText("changed above ↑");
	await expect(link).toBeInViewport();
	await expect(page.locator(".doc-edit-jump-below")).toBeHidden();
	// Nothing is lit where nobody is looking: the fade is kept for the reader.
	await expect(page.locator(".doc-edit-lit")).toHaveCount(0);
	await turnOver(page);
	const md = await docText(page);
	await link.click();
	const lit = page.locator(".doc-edit-lit", { hasText: "The plan" });
	await expect(lit).toBeInViewport();
	await expect(link).toBeHidden();
	await expect(page.locator(".doc-edit-lit")).toHaveCount(0, { timeout: 6000 });
	// Neither the link nor the light is document text, and the caret is still
	// in the trailing prompt: what is typed next is the next prompt.
	expect(await docText(page)).toBe(md);
	await page.keyboard.type("thanks");
	expect(await docText(page)).toMatch(/<!-- you -->\n\nthanks\n*$/);
});

test("a click on the link while the run goes on keeps the reader at the change when the answer lands", async ({ page }) => {
	await openApp(page, answerWith([editAsked("# Teh plan", "# The plan"), ...hold(12), final("Fixed the heading."), settled()], 150), TALL_TYPO);
	await page.locator(".cm-scroller").first().hover();
	await page.mouse.wheel(0, 20000);
	await expect(page.locator(".cm-line", { hasText: "Noted." })).toBeInViewport();
	await writeAtTail(page, "fix the heading's typo");
	await send(page);
	const link = page.locator(".doc-edit-jump-above");
	await expect(link).toBeVisible();
	await link.click();
	const heading = page.locator(".cm-line", { hasText: /The plan$/ });
	await expect(heading).toBeInViewport();
	expect(await page.evaluate(() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming)).toBe(true);
	await turnOver(page);
	expect(await docText(page)).toContain("Fixed the heading.");
	// The answer was written at the foot of the page, and the page did not go there.
	await expect(heading).toBeInViewport();
});

test("a canvas edit whose quote the document does not hold changes nothing, and the tool is told why", async ({ page }) => {
	await openApp(page, answerWith([editAsked("# Tah plan", "# The plan"), ...hold(6), final("Could not."), settled()], 150), TYPO);
	await write(page, "fix the heading's typo");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toMatchObject({ error: expect.stringMatching(/not found/) });
	await turnOver(page);
	expect(await docText(page)).toContain("# Teh plan");
});

test("a canvas edit that empties an earlier block removes it, marker included, and ⌘Z brings it back", async ({ page }) => {
	await openApp(page, answerWith([editAsked("Friday works.", ""), ...hold(6), final("Removed it."), settled()], 150), TYPO);
	await write(page, "remove your answer");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toEqual({ ok: true });
	await turnOver(page);
	const md = await docText(page);
	// No marker is left over nothing: the prompt above is followed by the next one.
	expect(md).toMatch(/Ship on Friday\.\n\n<!-- you -->\n\nremove your answer/);
	expect(md).toContain("Removed it.");
	await page.locator(".cm-line", { hasText: "Ship on Friday." }).click();
	const mod = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${mod}+z`);
	await expect.poll(() => docText(page)).toMatch(/<!-- pi -->\n\nFriday works\./);
});

test("a canvas edit may not empty the prompt it is answering: nothing changes, and the tool is told why", async ({ page }) => {
	await openApp(page, answerWith([editAsked("remove this question", ""), ...hold(6), final("Could not."), settled()], 150), TYPO);
	await write(page, "remove this question");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toMatchObject({ error: expect.stringMatching(/prompt you are answering/) });
	await turnOver(page);
	expect(await docText(page)).toContain("remove this question");
});

test("a canvas edit may not write the answer into the prompt it is answering: nothing changes, and the tool is told where the answer goes", async ({ page }) => {
	// A sent prompt, edited and sent again, with its old answer under it.
	const asked = "Give me five names for a houseplant.";
	const names = "1. Fernanda\n2. Leaf Erikson";
	const doc = "<!-- you -->\n\nGive me three names for a houseplant.\n\n<!-- pi -->\n\n1. Spike\n\n<!-- you -->\n\n";
	await openApp(page, answerWith([editAsked(asked, `${asked}\n\n${names}`), ...hold(6), final(names), settled()], 150), doc);
	await page.locator(".cm-line", { hasText: "Give me three names" }).click();
	await page.keyboard.press("Home");
	for (let i = 0; i < "Give me ".length; i++) await page.keyboard.press("ArrowRight");
	for (let i = 0; i < "three".length; i++) await page.keyboard.press("Delete");
	await page.keyboard.type("five");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["e1"], { timeout: 8000 }).toMatchObject({ error: expect.stringMatching(/prompt you are answering.*your reply/) });
	await turnOver(page);
	// The prompt is as the user wrote it, and the answer is under it in a block of its own, in place of the old one.
	const md = await docText(page);
	expect(md).toMatch(/^<!-- you -->\n\nGive me five names for a houseplant\.\n\n<!-- pi -->\n\n1\. Fernanda\n2\. Leaf Erikson/);
	expect(md).not.toContain("Spike");
});

test("a cell that runs is answered ok", async ({ page }) => {
	await openApp(page, answerWith([...cellAnswer("1 + 1", "ok1"), verdictAsked("ok1"), ...hold(10), final("Done."), settled()], 250));
	await write(page, "make a cell");
	await send(page);
	await expect.poll(async () => (await verdictsOf(page))["q_ok1"], { timeout: 8000 }).toEqual({ verdict: "ok" });
});

test("fix on a failing artifact sends pi the cell and its error, as a prompt under it that names the artifact", async ({ page }) => {
	allowThrowingCells(page);
	const doc = `<!-- you -->\n\nmake a chart\n\n<!-- pi -->\n\n<!-- pi:cell js #bx -->\n\n\`\`\`js\n${THROWS}\n\`\`\`\n\n<!-- pi -->\n\nDone.\n\n<!-- you -->\n\n`;
	await openApp(page, answerWith([final("Fixed it."), settled()]), doc);
	await page.locator("pi-artifact .artifact-fix").click();
	await expect.poll(async () => promptsOf(await piLog(page)).map((sent) => sent.command.message), { timeout: 8000 }).toEqual([expect.stringMatching(/^\[artifact\] the one above — edit by id\n\nFix cell #bx — .*boom/)]);
	await turnOver(page);
	const md = await docText(page);
	expect(md.indexOf("Fix cell #bx")).toBeGreaterThan(md.indexOf("<!-- pi:cell js #bx -->"));
	expect(md).toContain("Fixed it.");
});

test("a cell the turn wrote that fails is reported to pi while the turn runs", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(page, answerWith([...cellAnswer(THROWS, "bx"), ...hold(6), partial("Fixed."), final("Fixed."), settled()], 250));
	await write(page, "make a cell");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	expect((await steersOf(page))[0]).toMatch(/^\[cell report\] #bx failed: .*boom/);
	await turnOver(page);
	// pi delivered it, and the document shows what the agent was told.
	expect(await docText(page)).toMatch(/<!-- pi:block -->\n\n<!-- you -->\n\n\[cell report\] #bx failed: .*boom/);
});

test("the same failure is reported once, however often the canvas re-sweeps", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(
		page,
		answerWith([...cellAnswer(THROWS, "bx"), ...hold(4), partial("more"), partial("more text"), partial("more text still"), final("more text still"), settled()], 250),
	);
	await write(page, "make a cell");
	await send(page);
	await expect.poll(() => docText(page), { timeout: 8000 }).toContain("more text still");
	await turnOver(page);
	expect(await steersOf(page)).toHaveLength(1);
});

test("at most three reports in one run", async ({ page }) => {
	allowThrowingCells(page);
	const cells = ["c1", "c2", "c3", "c4"].flatMap((id) => cellAnswer(`throw new Error("${id} broke")`, id));
	await openApp(page, answerWith([...cells, ...hold(8), settled()], 200));
	await write(page, "make four cells");
	await send(page);
	await turnOver(page);
	await expect.poll(() => steersOf(page), { timeout: 8000 }).toHaveLength(3);
	// The fourth is the one the budget refuses: wait until it HAS failed, so
	// "still three" is the cap holding and not the fourth not having run yet.
	await expect(page.locator('pi-cell .cell-frame[data-status="rejected"]')).toHaveCount(4, { timeout: 8000 });
	await afterFrames(page);
	expect(await steersOf(page)).toHaveLength(3);
});

test("a cell the writer wrote is not reported; the turn's own is", async ({ page }) => {
	allowThrowingCells(page);
	// The writer's cell fails in the same page, during the same turn, beside
	// the turn's: only the turn's is pi's news.
	const doc = `<!-- pi:cell js #mine -->\n\n\`\`\`js\nthrow new Error("writer broke this")\n\`\`\`\n\n<!-- you -->\n\n`;
	await openApp(page, answerWith([...cellAnswer(THROWS, "bx"), ...hold(6), settled()], 250), doc);
	await write(page, "make a cell");
	await send(page);
	await turnOver(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	expect((await steersOf(page))[0]).toContain("#bx");
	expect((await steersOf(page)).join("\n")).not.toContain("#mine");
});

test("a failure after the turn ended sends nothing", async ({ page }) => {
	// The canvas's report, raised by hand: once while the turn runs — the
	// control, which reaches pi — and once after it ended, which must not.
	const raise = (id: string) =>
		page.evaluate((id) => {
			document
				.querySelector("document-chat")!
				.dispatchEvent(new CustomEvent("cell-failure", { detail: { id, error: "broke", key: id }, bubbles: true }));
		}, id);
	await openApp(page, answerWith([partial("Working."), ...hold(4), final("Working."), settled()], 250));
	await write(page, "go");
	await send(page);
	await expect.poll(() => docText(page), { timeout: 5000 }).toContain("Working.");
	await raise("during");
	await expect.poll(() => steersOf(page)).toEqual(["[cell report] #during failed: broke"]);
	await turnOver(page);
	await raise("after");
	await afterFrames(page);
	expect(await steersOf(page)).toEqual(["[cell report] #during failed: broke"]);
});

test("a fresh prompt gets a fresh budget", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(
		page,
		answerBy(`(prompt) => ({
			stepMs: 200,
			script: prompt.includes("first")
				? [${["a1", "a2", "a3"].map((id) => `...${JSON.stringify(cellAnswer(`throw new Error("${id}")`, id))}`).join(", ")}, ...${JSON.stringify(hold(8))}, { type: "agent_settled" }]
				: [...${JSON.stringify(cellAnswer('throw new Error("b1")', "b1"))}, ...${JSON.stringify(hold(6))}, { type: "agent_settled" }],
		})`),
	);
	await write(page, "first turn");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 8000 }).toHaveLength(3);
	await turnOver(page);
	await writeAtTail(page, "second turn");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 8000 }).toHaveLength(4);
	expect((await steersOf(page))[3]).toContain("#b1");
});

test("the next send keeps the report in pi's history and does not rebuild", async ({ page }) => {
	allowThrowingCells(page);
	await openApp(
		page,
		answerBy(`(prompt) => ({
			stepMs: 250,
			script: prompt.includes("make")
				? [...${JSON.stringify(cellAnswer(THROWS, "bx"))}, ...${JSON.stringify(hold(6))}, ${JSON.stringify(partial("Fixed."))}, ${JSON.stringify(final("Fixed."))}, { type: "agent_settled" }]
				: [${JSON.stringify(partial("Sure."))}, ${JSON.stringify(final("Sure."))}, { type: "agent_settled" }],
		})`),
	);
	await write(page, "make a cell");
	await send(page);
	await expect.poll(() => steersOf(page), { timeout: 5000 }).toHaveLength(1);
	await expect.poll(() => docText(page), { timeout: 8000 }).toContain("Fixed.");
	await turnOver(page);
	await writeAtTail(page, "thanks");
	await send(page);
	await expect.poll(() => docText(page), { timeout: 5000 }).toContain("Sure.");
	const log = await page.evaluate(() => (window as unknown as { __PI_LOG__: { rebuilds: unknown[] } }).__PI_LOG__);
	expect(log.rebuilds, "pi's history already held the report").toEqual([]);
});

// ── A child's window while its run is written elsewhere ─────────────────────
// A subsession's run is written by the window that started it, through the
// store; a window showing the child takes each save in as an outside edit
// (ADR 0018 §3), and follows the same rules any outside edit does.

const CHILD_ID = "web-c0ffee00";
const CHILD_DOC = "---\npi: v1\nsession: web-c0ffee00\n---\n\n<!-- you -->\n\nsay hi\n\n";

/** Boots a child's own window, as `open_document` does: `?id=`. */
async function openChild(page: Page, script: string) {
	await page.addInitScript({ content: script });
	await page.goto(`/?id=${CHILD_ID}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
}

test("a child's window shows each write of a run made elsewhere", async ({ page }) => {
	await openChild(page, answerWith([settled()], 60, { stored: { content: CHILD_DOC, delayMs: 0 } }));
	await expect(page.locator(".cm-content").first()).toContainText("say hi");
	await reported(page, () => editOutside(page, `${CHILD_DOC}<!-- pi -->\n\nFirst part.\n\n<!-- you -->\n\n`, CHILD_ID));
	await expect(page.locator(".cm-content").first()).toContainText("First part.", { timeout: 5000 });
	await reported(page, () => editOutside(page, `${CHILD_DOC}<!-- pi -->\n\nFirst part. And the rest.\n\n<!-- you -->\n\n`, CHILD_ID));
	await expect(page.locator(".cm-content").first()).toContainText("And the rest.", { timeout: 5000 });
	await expect(page.locator("#status")).toHaveText("");
});

test("a keystroke in a child's window during its run keeps the window's copy, and says so", async ({ page }) => {
	await openChild(page, answerWith([settled()], 60, { stored: { content: CHILD_DOC, delayMs: 0 } }));
	await expect(page.locator(".cm-content").first()).toContainText("say hi");
	await page.locator(".cm-content").first().locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("my own note");
	await reported(page, () => editOutside(page, `${CHILD_DOC}<!-- pi -->\n\nFirst part.\n\n<!-- you -->\n\n`, CHILD_ID));
	const md = await docText(page);
	expect(md).toContain("my own note");
	expect(md).not.toContain("First part.");
	await expect(page.locator("#status")).toContainText("changed outside");
});

test("a send from a child's window while pi still answers leaves its run alone", async ({ page }) => {
	// pi refuses a prompt while it streams; what must not happen first is a
	// rebuild, which stops pi — and with it the run the parent is writing.
	const answered = `${CHILD_DOC}<!-- pi -->\n\nHalf done.\n\n<!-- you -->\n\n`;
	await openChild(page, answerWith([settled()], 60, { stored: { content: answered, delayMs: 0 }, state: { isStreaming: true } }));
	await expect(page.locator(".cm-content").first()).toContainText("Half done.");
	await page.locator(".cm-content").first().locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("and then?");
	await send(page);
	await expect(page.locator("#status")).toContainText("still answering", { timeout: 5000 });
	const log = await page.evaluate(() => (window as unknown as { __PI_LOG__: { rebuilds: unknown[]; sent: Array<{ command: { type: string } }> } }).__PI_LOG__);
	expect(log.rebuilds, "nothing stopped pi").toEqual([]);
	expect(log.sent.filter((s) => s.command.type === "prompt")).toEqual([]);
	expect(await docText(page), "the document is as it was").toBe(`${answered}and then?`);
});

test("a request the provider refused says why under the prompt, instead of an empty answer", async ({ page }) => {
	const refusal = "400 Third-party apps now draw from your extra usage, not your plan limits.";
	await openApp(page, answerWith([...providerRefused(refusal), settled()]));
	await write(page, "hello");
	await send(page);
	await turnOver(page);
	const md = await docText(page);
	expect(md).toContain(`**Error:** ${refusal}`);
	expect(md.indexOf("Third-party apps")).toBeGreaterThan(md.indexOf("hello"));
	// One reply block for the failure, not an empty one above it.
	expect(md.match(/<!-- pi -->/g)).toHaveLength(1);
});

test("a provider's JSON refusal reads as its message, not as the raw body", async ({ page }) => {
	const body = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your extra usage."},"request_id":"req_1"}';
	await openApp(page, answerWith([...providerRefused(body), settled()]));
	await write(page, "hello");
	await send(page);
	await turnOver(page);
	const md = await docText(page);
	expect(md).toContain("**Error:** Third-party apps now draw from your extra usage. (400, request req_1)");
	expect(md).not.toContain("invalid_request_error");
});

test("a refusal names the provider and model that gave it", async ({ page }) => {
	// The error alone does not say where the request went, and a request that
	// went to a model the user did not expect is the thing they need to see.
	const refusal = "Your authentication token has expired. Please try refreshing it.";
	await openApp(page, answerWith([...providerRefused(refusal, false, { provider: "openai-codex", model: "gpt-5.6-luna" }), settled()]));
	await write(page, "hello");
	await send(page);
	await turnOver(page);
	expect(await docText(page)).toContain(`**Error:** openai-codex/gpt-5.6-luna: ${refusal}`);
});

test("a refusal pi will retry is not written: the retry's answer is", async ({ page }) => {
	await openApp(page, answerWith([...providerRefused("529 overloaded", true), final("Hi."), settled()]));
	await write(page, "hello");
	await send(page);
	await turnOver(page);
	const md = await docText(page);
	expect(md).toContain("Hi.");
	expect(md).not.toContain("overloaded");
});

// ── What is read and what was sent can be looked at (ADR 0059) ───────────────

const inspector = (page: Page) => page.locator(".face-inspector");
/** A frown worth passing on and a smile that is not, over everything a flow types. */
const FROWN_AND_SMILE = JSON.stringify([
	{ from: 0, to: 60_000, units: [[4, "C"]] },
	{ from: 0, to: 60_000, units: [[12, "B"]] },
]);

test("what the camera reads is shown while the user types: what was found, what is dropped and why, and what the message would carry", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, { preferences: AGREED, faceScript: FROWN_AND_SMILE }));
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	await expect(inspector(page)).toContainText("On. The camera is off until you type.");
	await expect(inspector(page).locator(".face-draft")).toHaveText("Nothing, as it stands.");
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");

	// The panel is no menu: the document takes the keys while it is open.
	await write(page, "what is 2+2");
	await expect(inspector(page)).toContainText("The camera is on, and your face is being read.");
	await expect(inspector(page).locator(".face-draft")).toHaveText(/^\[face\]\ntyping "what is 2\+2": brows lowered marked 60\.0s$/);
	await expect(facePill(page), "the pill marks a draft that would carry something").toHaveAttribute("data-lines", "true");
	const found = inspector(page).locator(".face-recent li");
	await expect(found.filter({ hasText: "brows lowered marked" }).locator("s")).toHaveCount(0);
	await expect(found.filter({ hasText: "lip corners pulled up slight" }).locator("s")).toHaveCount(1);
	await expect(found.filter({ hasText: "lip corners pulled up slight" })).toContainText("too weak");
	// A script has no picture to show.
	await expect(inspector(page).getByRole("button", { name: "Show camera" })).toBeHidden();
	expect(await docText(page)).not.toContain("[face]");

	await page.keyboard.press("Escape");
	await expect(inspector(page), "Escape in the document is the document's").toBeVisible();
	await inspector(page).getByRole("button", { name: "Close" }).click();
	await expect(inspector(page)).toHaveCount(0);
});

test("a command typed key by key would carry nothing and is marked as nothing, and a pill switched off marks no draft", async ({ page }) => {
	await openApp(page, answerWith([final("ok"), settled()], 60, FACE_ON));
	await write(page, "/compact now");
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	await expect(inspector(page).locator(".face-recent")).toContainText("brows lowered marked");
	await expect(inspector(page).locator(".face-draft")).toHaveText("Nothing, as it stands.");
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");

	// Words in its place would carry the face, and the mark goes with the switch.
	await page.locator(".cm-content").first().click();
	await page.keyboard.press("Control+End");
	for (let i = 0; i < "/compact now".length; i++) await page.keyboard.press("Backspace");
	await page.keyboard.type("what is 2+2");
	await expect(facePill(page)).toHaveAttribute("data-lines", "true");
	await page.evaluate(() => window.dispatchEvent(new Event("blur")));
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await expect(facePill(page), "the camera off, the draft still carries it").toHaveAttribute("data-lines", "true");
	await page.evaluate(() => (window as unknown as { __PI_EMIT__(e: string, p: unknown): void }).__PI_EMIT__("preferences-changed", { cellWorkPulse: true, face: false, faceExplained: true, faceCamera: "" }));
	await expect(facePill(page)).toHaveAttribute("data-state", "off");
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");
	await expect(inspector(page)).toHaveCount(0);
});

test("what is passed on is set where it is shown, applies at once, is kept, and goes back to what was measured", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, { preferences: AGREED, faceScript: FROWN_AND_SMILE }));
	await write(page, "what is 2+2");
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	const least = inspector(page).getByRole("group", { name: "Pass on what is at least" });
	await expect(least.getByRole("button", { name: "marked" })).toHaveAttribute("aria-pressed", "true");
	await expect(inspector(page).getByRole("button", { name: "Reset" })).toBeDisabled();

	await least.getByRole("button", { name: "slight" }).click();
	await expect(least.getByRole("button", { name: "slight" })).toHaveAttribute("aria-pressed", "true");
	expect((await hostLog(page)).preferences).toEqual([{ ...AGREED, faceTuning: { ...MEASURED, intensity: "B" }, faceSpeaks: false, updateCheck: true, updateDismissed: "" }]);
	await expect(inspector(page).locator(".face-draft")).toContainText("lip corners pulled up slight");
	await expect(inspector(page).locator(".face-recent s")).toHaveCount(0);

	// And the message goes as the panel said it would.
	await inspector(page).getByRole("group", { name: "and held for" }).getByRole("button", { name: "2 s" }).click();
	await page.locator(".cm-content").first().click();
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message).toMatch(/\n\n\[face\]\ntyping "what is 2\+2": [^\n]*lip corners pulled up slight 60\.0s[^\n]*\n\[now: /);

	await inspector(page).getByRole("button", { name: "Reset" }).click();
	await expect(least.getByRole("button", { name: "marked" })).toHaveAttribute("aria-pressed", "true");
	expect((await hostLog(page)).preferences.at(-1)).toEqual({ ...AGREED, faceTuning: MEASURED, faceSpeaks: false, updateCheck: true, updateDismissed: "" });
});

test("a block's menu says what its message carried, as pi's transcript holds it", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, FACE_ON));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	const head = page.locator(".doc-role-menu").first();
	await head.hover();
	await head.click();
	await faceMenu(page).getByRole("button", { name: "face: what was sent" }).click();
	await expect(faceMenu(page)).toContainText("Sent to the agent at the end of this message:");
	await expect(faceMenu(page).locator(".doc-menu-verbatim")).toHaveText('[face]\ntyping "what is 2+2": brows lowered marked 60.0s');
	expect(await docText(page)).not.toContain("[face]");
});

test("a message that carried nothing says so, and a face never agreed to adds no row to a block's menu", async ({ page }) => {
	// Agreed to, and no script: nothing reads a face, so nothing is sent.
	await openApp(page, answerWith([final("Four."), settled()], 60, { preferences: AGREED }));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	const head = page.locator(".doc-role-menu").first();
	await head.hover();
	await head.click();
	await faceMenu(page).getByRole("button", { name: "face: what was sent" }).click();
	await expect(faceMenu(page)).toContainText("none was sent with it, or the history was rewritten since");
	await page.keyboard.press("Escape");

	await page.evaluate(() => (window as unknown as { __PI_EMIT__(e: string, p: unknown): void }).__PI_EMIT__("preferences-changed", { cellWorkPulse: true, face: false, faceExplained: false, faceCamera: "" }));
	await head.hover();
	await head.click();
	await expect(faceMenu(page).getByRole("button", { name: "rename block" })).toBeVisible();
	await expect(faceMenu(page).getByRole("button", { name: "face: what was sent" })).toHaveCount(0);
});

// ── What the face did reading an answer goes with the next message (ADR 0060) ──

/** pi says it took the prompt, as a real one does: the script's clock then starts over when
 *  the answer appears, so the frown is there from the reading's first moment. */
const READING = { ...FACE_ON, promptReply: { success: true } };

/** Writes the next prompt under an answer and sends it. */
async function sendNext(page: Page, text: string, sent = 2) {
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type(text);
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(sent);
}

test("for a few seconds after an answer appears the camera is on, and the next message says what the face did reading it", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([final("Four."), settled()], 60, READING));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	expect(promptsOf(await piLog(page))[0]?.command.message, "the first message has no answer before it").not.toContain("read ");
	// No key, and the camera is on: the answer is being read.
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(4500);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(2000);
	await expect(facePill(page), "and off again with nothing typed").toHaveAttribute("data-state", "idle");
	await expect(facePill(page), "a message would carry the reading").toHaveAttribute("data-lines", "true");

	await sendNext(page, "and why?");
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(/^and why\?\n\n\[face\]\nread 0\.0s: brows lowered marked 4\.0s\ntyping "and why": brows lowered marked [^\n]+\n\[now: /);
	expect(await docText(page)).not.toContain("read 0.0s");
});

test("a turn that ended with no answer opens no reading: the camera stays off, and the answer before it is not read again", async ({ page }) => {
	await page.clock.install();
	const resolver = `(prompt) => ({ stepMs: 60, script: prompt.includes("fail") ? [{ type: "error", message: "boom" }, { type: "agent_settled" }] : ${JSON.stringify([final("Four."), settled()])} })`;
	await openApp(page, answerBy(resolver, READING));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(7000);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	// The next turn fails. Its message took the reading with it, and there is no new answer.
	await sendNext(page, "now fail");
	await turnOver(page);
	await expect(page.locator(".cm-content").first()).toContainText("boom");
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await page.clock.fastForward(7000);
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");
});

test("a turn that wrote nothing opens no reading on the answer before it", async ({ page }) => {
	await page.clock.install();
	const resolver = `(prompt) => ({ stepMs: 60, script: prompt.includes("nothing") ? [{ type: "agent_settled" }] : ${JSON.stringify([final("Four."), settled()])} })`;
	await openApp(page, answerBy(resolver, READING));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(7000);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await sendNext(page, "say nothing");
	await turnOver(page);
	// Long enough for a camera to have come on, and short of the window's end.
	await page.clock.fastForward(1000);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");
});

test("a key while the answer was still coming is writing, not reading: the next message carries no reading", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([...hold(8), final("Four."), settled()], 60, READING));
	await write(page, "what is 2+2");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(1);
	await page.keyboard.type("and");
	await turnOver(page);
	await page.clock.fastForward(7000);
	await page.keyboard.type(" why?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	const message = promptsOf(await piLog(page))[1]?.command.message;
	expect(message).toMatch(/^and why\?\n/);
	expect(message).not.toContain("read ");
});

test("a message that arrived in one piece is tied to no words, and still says what the face did reading the answer", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([final("Four."), settled()], 60, READING));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(7000);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("Control+End");
	await page.keyboard.insertText("and why is that so?");
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(/^and why is that so\?\n\n\[face\]\nread 0\.0s: brows lowered marked 4\.0s\n\[now: /);
});

test("a reading two minutes old is about an answer the user has left, and is not sent", async ({ page }) => {
	await page.clock.install();
	await openApp(page, answerWith([final("Four."), settled()], 60, READING));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(7000);
	await expect(facePill(page)).toHaveAttribute("data-lines", "true");
	await page.clock.fastForward(125_000);
	await sendNext(page, "and why?");
	const message = promptsOf(await piLog(page))[1]?.command.message;
	expect(message).not.toContain("read ");
	// The script's frown is over by now: nothing of the typing either.
	expect(message).toMatch(/^and why\?\n\[now: /);
});

test("an answer scrolled out of sight is not being read: no camera comes on for it", async ({ page }) => {
	await page.clock.install();
	const above = Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n\n");
	await openApp(page, answerWith([...hold(20), final("Four."), settled()], 60, READING), `<!-- pi:note -->\n\n${above}\n\n<!-- you -->\n\n`);
	await write(page, "what is 2+2");
	await send(page);
	// Up to the top while pi is still at it, and left there.
	await page.locator(".cm-scroller").first().evaluate((scroller) => (scroller.scrollTop = 0));
	await turnOver(page);
	const shown = await page.evaluate(() => {
		const chat = document.querySelector("document-chat") as unknown as { getDocument(): string; shows(from: number, to: number): boolean };
		const at = chat.getDocument().indexOf("Four.");
		return at >= 0 && chat.shows(at, at + 5);
	});
	expect(shown, "the answer stayed out of sight when the turn ended").toBe(false);
	await expect(facePill(page)).toHaveAttribute("data-state", "idle");
	await page.clock.fastForward(7000);
	await expect(facePill(page)).toHaveAttribute("data-lines", "false");
});

// ── The agent speaks first (ADR 0061) ────────────────────────────────────────

const SPEAKS = { ...READING, preferences: { ...AGREED, faceSpeaks: true } };
/** A pi that answers a prompt with "Four.", and a face shown alone with `words`. */
const speaking = (words: string, options: Parameters<typeof answerBy>[1] = SPEAKS) =>
	answerBy(`(prompt) => ({ stepMs: 60, script: prompt.startsWith("[face]") ? ${JSON.stringify([final(words), settled()])} : ${JSON.stringify([final("Four."), settled()])} })`, options);
const ASIDE = "Four is two and two, counted once.";
/** The lines of what the agent said unasked, its label's line aside. */
const aside = (page: Page) => page.locator(".cm-line.doc-line-aside:not(.doc-line-marker):not(.doc-line-blank)");

/** Sends the first prompt and reads its answer with a frown and no key, for as long as it takes to be asked. */
async function readQuietly(page: Page) {
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(4500);
	await page.clock.fastForward(2000);
}

test("a face that moved at an answer, and no key: the agent is shown it with no message, and what it adds stands under the answer as unasked", async ({ page }) => {
	await page.clock.install();
	await openApp(page, speaking(ASIDE));
	await readQuietly(page);
	await expect(aside(page)).toContainText(ASIDE);
	await expect(page.locator(".doc-role", { hasText: "agent · unasked" })).toBeVisible();
	// What pi was handed: the reading alone, with not a word of the user's.
	expect(promptsOf(await piLog(page))[1]?.command.message).toMatch(/^\[face\]\nread 0\.0s: brows lowered marked 4\.0s\n\[now: [^\n]+\]$/);
	const doc = await docText(page);
	expect(doc).toMatch(/<!-- pi -->\n\nFour\.\n\n<!-- pi:aside -->\n\nFour is two and two, counted once\.\n\n<!-- you -->/);
	expect(doc).not.toContain("[face]");
	// The reader's place was left alone: the caret is still in the prompt below.
	await page.keyboard.type("ok");
	expect(await docText(page)).toMatch(/<!-- you -->\n\nok\s*$/);

	// Once for an answer, and the next message neither repeats the reading nor rewrites pi's history.
	await page.clock.fastForward(20_000);
	expect(promptsOf(await piLog(page))).toHaveLength(2);
	await send(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(3);
	expect(promptsOf(await piLog(page))[2]?.command.message).not.toContain("read ");
	expect(((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds).toHaveLength(0);
});

test("an agent that chooses silence draws nothing, and the exchange does not make the next send rewrite its history", async ({ page }) => {
	await page.clock.install();
	await openApp(page, speaking("[silent]"));
	await readQuietly(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	await expect(inspector(page)).toContainText("Shown your face with no message 1 time this session, the agent spoke 0 and stayed silent 1.");
	const doc = await docText(page);
	expect(doc).not.toContain("pi:aside");
	expect(doc).not.toContain("[silent]");
	await sendNext(page, "and why?", 3);
	expect(((await piLog(page)) as unknown as { rebuilds: unknown[] }).rebuilds).toHaveLength(0);
});

test("Not helpful removes what the agent said unasked, and it is not asked again in this conversation", async ({ page }) => {
	await page.clock.install();
	await openApp(page, speaking(ASIDE));
	await readQuietly(page);
	await expect(aside(page)).toContainText(ASIDE);
	await page.getByRole("button", { name: "Not helpful" }).click();
	await expect(aside(page)).toHaveCount(0);
	expect(await docText(page)).not.toContain("pi:aside");
	// The next answer is read with the same frown, and nobody is asked about it.
	await sendNext(page, "and 3+3?", 3);
	await turnOver(page);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
	await page.clock.fastForward(4500);
	await page.clock.fastForward(20_000);
	expect(promptsOf(await piLog(page))).toHaveLength(3);
	await expect(aside(page)).toHaveCount(0);
});

test("the agent is not asked with the switch off, after a key, or when it is a model known never to speak", async ({ page }) => {
	await page.clock.install();
	// Off, which is how it starts.
	await openApp(page, speaking(ASIDE, READING));
	await readQuietly(page);
	await page.clock.fastForward(20_000);
	expect(promptsOf(await piLog(page))).toHaveLength(1);

	// On from the pill's menu, and a key inside the six seconds is the user answering for themselves.
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "Let the agent speak first" }).click();
	expect((await hostLog(page)).preferences.at(-1)).toMatchObject({ faceSpeaks: true });
	await sendNext(page, "and 3+3?");
	await turnOver(page);
	await page.clock.fastForward(3000);
	await page.locator(".cm-line").last().click();
	await page.keyboard.type("hm");
	await page.clock.fastForward(20_000);
	expect(promptsOf(await piLog(page))).toHaveLength(2);
	await expect(aside(page)).toHaveCount(0);
});

test("a model known never to speak is not asked at all", async ({ page }) => {
	await page.clock.install();
	await openApp(page, speaking(ASIDE, { ...SPEAKS, state: { isStreaming: false, model: { provider: "anthropic", id: "claude-haiku-5-5", name: "Haiku" } } }));
	await readQuietly(page);
	await page.clock.fastForward(20_000);
	expect(promptsOf(await piLog(page))).toHaveLength(1);
	await expect(aside(page)).toHaveCount(0);
});

test("an asking that reaches for a tool is stopped: nothing is drawn, and nothing acts with nothing on the page to show it", async ({ page }) => {
	await page.clock.install();
	const reaching = [toolCallAnswer("bash", "t1", { command: "ls" }, "Let me look."), ...hold(40), final("Here is what I found."), settled()];
	await openApp(
		page,
		answerBy(`(prompt) => ({ stepMs: 60, script: prompt.startsWith("[face]") ? ${JSON.stringify([...reaching.slice(0, 1), { type: "tool_execution_start", toolCallId: "t1", toolName: "bash", args: { command: "ls" } }, ...reaching.slice(1)])} : ${JSON.stringify([final("Four."), settled()])} })`, { ...SPEAKS, onAbort: [settled()] }),
	);
	await readQuietly(page);
	await expect.poll(async () => (await piLog(page)).sent.map((s) => s.command.type)).toContain("abort");
	await expect(aside(page)).toHaveCount(0);
	const doc = await docText(page);
	expect(doc).not.toContain("Let me look.");
	expect(doc).not.toContain("pi:tool");
	// And the page is the user's: the next message runs as any other.
	await sendNext(page, "and why?", 3);
	await turnOver(page);
	expect((await docText(page)).match(/Four\./g)).toHaveLength(2);
});

test("a message sent while the agent is being asked comes first: the asking is cut off, and the answer drawn is the message's", async ({ page }) => {
	await page.clock.install();
	await openApp(
		page,
		answerBy(`(prompt) => ({ stepMs: 60, script: prompt.startsWith("[face]") ? ${JSON.stringify([...hold(60), final(ASIDE), settled()])} : ${JSON.stringify([final("Four."), settled()])} })`, { ...SPEAKS, onAbort: [settled()] }),
	);
	await readQuietly(page);
	await expect.poll(async () => promptsOf(await piLog(page)).length, { timeout: 5000 }).toBe(2);
	await sendNext(page, "never mind, and 3+3?", 3);
	await turnOver(page);
	expect((await piLog(page)).sent.map((s) => s.command.type)).toContain("abort");
	await expect(aside(page)).toHaveCount(0);
	const doc = await docText(page);
	expect(doc).not.toContain(ASIDE);
	expect(doc).toMatch(/never mind, and 3\+3\?\n\n<!-- pi -->\n\nFour\./);
});

// ── Hardening (ADR 0059, ADR 0058) ───────────────────────────────────────────

test("whether a sent block was right about the user is counted, by their word, and shown where the reading is", async ({ page }) => {
	await openApp(page, answerWith([final("Four."), settled()], 60, FACE_ON));
	await write(page, "what is 2+2");
	await send(page);
	await turnOver(page);
	const head = page.locator(".doc-role-menu").first();
	for (const verdict of ["It was right", "It was right", "It was not"]) {
		await head.hover();
		await head.click();
		await faceMenu(page).getByRole("button", { name: "face: what was sent" }).click();
		await faceMenu(page).getByRole("button", { name: verdict }).click();
	}
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	await expect(inspector(page)).toContainText("Of the sent blocks you judged, 2 were right about you and 1 were not.");
	// A count and nothing else is kept: no block, no words.
	expect(await page.evaluate(() => localStorage.getItem("piary.face.judged"))).toBe('{"right":2,"wrong":1}');
});

test("a face read thirty times a second drops no key: what was typed is what the document holds", async ({ page }) => {
	const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -35, 1];
	const rest = { browDownLeft: 0.09, browDownRight: 0.09, jawOpen: 0.02 };
	// A minute of samples at 30 Hz, four times what the camera is read at.
	const samples = Array.from({ length: 1800 }, (_, i) => ({ at: i * 33, faces: 1, scores: i % 90 < 45 ? rest : { ...rest, browDownLeft: 0.6, browDownRight: 0.6 }, matrix }));
	await openApp(page, answerWith([final("ok"), settled()], 60, { preferences: AGREED, faceScript: JSON.stringify({ samples }) }));
	// The panel open as well: every key then also works out what the draft would carry.
	await facePill(page).click();
	await faceMenu(page).getByRole("button", { name: "What is read and sent…" }).click();
	const typed = "the quick brown fox jumps over the lazy dog, twice over, and then once more for good measure while the camera watches every frame";
	await write(page, typed);
	expect(await docText(page)).toContain(typed);
	await expect(facePill(page)).toHaveAttribute("data-state", "watching");
});

