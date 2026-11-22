// The app's page in a real engine, with no app behind it — layer 3 of the
// testing strategy (docs/TEST_ARCHITECTURE.md).
//
// This is where most of the canvas's behaviour is asserted, because it is the
// cheapest layer that has a real engine: real CodeMirror, real layout, real
// focus, and a real keyboard. The layer above it drives the actual window and
// is deliberately small, since WebDriver's macOS keyboard cannot type reliably
// — which is the whole reason this one carries the load.
//
// `src/bridge.ts` is the only module that talks to Rust, so stubbing
// `window.__TAURI_INTERNALS__` is all it takes to boot the page without an app.
// That is the seam working as designed: one place to replace.
import { allowConsoleError, expect, test } from "./helpers/console-guard.ts";
import { KNOWN_COMMANDS, refusal } from "./helpers/ipc-surface.ts";
import { final, partial, settled, toolCallAnswer, toolResultEnd, toolRun, usageOf } from "./helpers/scripted-pi.ts";
import { afterFrames } from "./helpers/frames.ts";
import { RECORDED_ANSWER, RECORDED_QUESTION } from "../app/onboarding-steps.ts";
import { TOUR } from "../app/tour.ts";
import { rebindDocument } from "../src/document/format.ts";

/** One IPC call the page made, as `invoke` received it. A raw body is recorded
 *  by its length, which is what crosses the Playwright boundary intact. */
type IpcCall = { cmd: string; args: unknown; headers?: Record<string, string> };

/**
 * What the stubbed `invoke` answers, by command — `pi_send` keyed by the type of
 * the command it carries (`"pi_send:get_entries"`). A command not named here
 * answers `undefined`. `{ reject }` refuses the call; `{ emit, value }` delivers
 * an event to the page's listeners first, the way Rust reports a side effect;
 * `{ png: [width, height] }` answers the raw bytes of a PNG that size, drawn in
 * the page, since an ArrayBuffer does not survive the Playwright boundary.
 * A command about one document can be answered for that id alone:
 * `"docs_read@child-1"` wins over `"docs_read"`.
 * A command to one session's pi likewise: `"pi_send:get_session_stats@child-1"`
 * wins over `"pi_send:get_session_stats"`.
 * The answers stay the page's to change: `answerFrom` replaces one mid-test, as
 * pi's own answer changes after a command.
 * `{ afterCall, before, after }` is an answer that changes by itself: `before`
 * until the command keyed `afterCall` has been called, `after` from then on,
 * either of which may be another such answer — what a pi restarted by a
 * rewrite answers, inside one send, where a spec cannot step in.
 */
type Answers = Record<string, unknown>;

/** Boots the app page with the IPC calls answered rather than absent. */
async function openApp(page: import("@playwright/test").Page, doc?: string, answers: Answers = {}) {
	await openAppAt(page, doc === undefined ? "/" : `/?doc=${encodeURIComponent(doc)}`, answers);
}

/** Boots the app page at `path`, with the IPC calls answered rather than absent.
 *  `ready` is what the page shows once it has booted: a document's first line. */
async function openAppAt(page: import("@playwright/test").Page, path: string, answers: Answers = {}, ready = ".cm-line") {
	// Installed before any module runs, so `inApp()` is already true and the
	// console forwarder's first call does not reject on an import-time throw.
	await page.addInitScript(({ given, known, refused }: { given: Answers; known: readonly string[]; refused: string }) => {
		type Handler = (event: { event: string; id: number; payload: unknown }) => void;
		const listeners: Record<string, Handler[]> = {};
		/** The keys of every command called so far, for `afterCall`. */
		const called = new Set<string>();
		const emit = (event: string, payload: unknown) => {
			for (const handler of listeners[event] ?? []) handler({ event, id: 0, payload });
		};
		(window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
			// What `getCurrentWebviewWindow()` reads when the page scopes its
			// exit-flush listener to its own window.
			metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
			// Every call is recorded, so a spec can assert what the page asked
			// Rust to do — a save, a prompt — without an app behind it.
			invoke: (
				cmd: string,
				args: { event?: string; handler?: Handler; command?: { type?: string } } | undefined,
				options?: { headers?: Record<string, string> },
			) => {
				const recorded = args instanceof Uint8Array ? { byteLength: args.byteLength } : args;
				(window as unknown as { __calls: IpcCall[] }).__calls.push({ cmd, args: recorded, headers: options?.headers });
				// A spec that follows the page across a reload exposes this sink;
				// `__calls` starts empty on every page.
				const sink = (window as unknown as { __ipcSink?: (cmd: string, args: string) => void }).__ipcSink;
				if (sink && cmd !== "plugin:event|listen") sink(cmd, JSON.stringify(recorded ?? null));
				// `transformCallback` below hands the handler itself over, so a
				// listener can be kept and called.
				if (cmd === "plugin:event|listen" && args?.event && args.handler) {
					(listeners[args.event] ??= []).push(args.handler);
					return Promise.resolve(listeners[args.event]!.length);
				}
				// A command the real app does not register is refused, as the real
				// runtime refuses it (helpers/ipc-surface.ts).
				if (!known.includes(cmd)) return Promise.reject(new Error(refused.replace("<cmd>", cmd)));
				const type = args?.command?.type;
				const { id, sid } = (args ?? {}) as { id?: string; sid?: string };
				const key = type ? `${cmd}:${type}` : cmd;
				let answer =
					(id !== undefined ? given[`${cmd}@${id}`] : undefined) ?? (sid !== undefined ? given[`${key}@${sid}`] : undefined) ?? given[key];
				while (answer && typeof answer === "object" && "afterCall" in answer) {
					const staged = answer as { afterCall: string; before: unknown; after: unknown };
					answer = called.has(staged.afterCall) ? staged.after : staged.before;
				}
				called.add(key);
				if (answer && typeof answer === "object" && "reject" in answer) return Promise.reject((answer as { reject: string }).reject);
				if (answer && typeof answer === "object" && "png" in answer) {
					const [width, height] = (answer as { png: [number, number] }).png;
					const canvas = new OffscreenCanvas(width, height);
					const context = canvas.getContext("2d")!;
					context.fillStyle = "#c33";
					context.fillRect(0, 0, width, height);
					return canvas.convertToBlob({ type: "image/png" }).then((blob) => blob.arrayBuffer());
				}
				// An answer that arrives late, as a real round trip may.
				if (answer && typeof answer === "object" && "delayMs" in answer) {
					const { delayMs, value } = answer as { delayMs: number; value: unknown };
					return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
				}
				if (answer && typeof answer === "object" && "emit" in answer) {
					const { emit: [event, payload], value } = answer as { emit: [string, unknown]; value?: unknown };
					emit(event, payload);
					return Promise.resolve(value);
				}
				return Promise.resolve(answer);
			},
			transformCallback: (callback: unknown) => callback,
		};
		// What `listen`'s unlisten reaches for before it asks Rust to forget a
		// listener; the real app's event plugin installs it.
		(window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: unknown }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
			unregisterListener: () => {},
		};
		(window as unknown as { __calls: IpcCall[] }).__calls = [];
		(window as unknown as { __emit: typeof emit }).__emit = emit;
		(window as unknown as { __answers: Answers }).__answers = given;
	}, { given: answers, known: KNOWN_COMMANDS, refused: refusal("<cmd>") });
	await page.goto(path);
	await expect(page.locator(ready).first()).toBeVisible();
}

test("the page has its own status line, and a notice on it is seen", { tag: "@smoke" }, async ({ page }) => {
	// The notices `app/main.ts` and `app/turn.ts` give are the user's only word
	// that a save was refused or a turn ended (ADR 0011). A line the page lacks,
	// or one the canvas paints over, is the same silence.
	// Long enough that, scrolled to its end, text fills the window behind the
	// line — without that, "on top of the canvas" has nothing to be on top of.
	const filler = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of the conversation.`).join("\n\n");
	await openApp(page, `---\npi: v9\n---\n\n<!-- you -->\n\n${filler}\n\nwritten by a newer Piary\n`);
	const status = page.locator("#status");
	await expect(status).toHaveAttribute("role", "status");
	await expect(status).toHaveAttribute("aria-live", "polite");
	await expect(status).toHaveText("");

	// A document in a version this build does not know is refused on save
	// (document-format.md §Frontmatter): a notice the page raises by itself.
	await page.locator(".cm-content").click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type(" Typed.");
	await expect(status).toContainText("Not saved", { timeout: 5000 });
	await expect(status).toBeVisible();
	// Scrolled, so the conversation's own lines pass under where the line is drawn.
	await page.mouse.move(400, 400);
	await page.mouse.wheel(0, 600);
	await expect(page.locator(".cm-line", { hasText: "Paragraph 1 of" })).not.toBeInViewport();
	// On top of the canvas, not under it: what is at the line's centre is the line.
	const onTop = await status.evaluate((line) => {
		const box = line.getBoundingClientRect();
		const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
		return !!hit && line.contains(hit);
	});
	expect(onTop, "the notice is the topmost thing where it is drawn").toBe(true);

	await page.getByRole("button", { name: "dismiss" }).click();
	await expect(status).toHaveText("");
	await expect(page.getByRole("button", { name: "dismiss" })).toBeHidden();
});

/** The tour as a stored `welcome`, as finishing or quitting the walk leaves
 *  it: a document like any other, behind no splash (ADR 0038). */
const TOUR_STORED: Answers = { "docs_read@welcome": TOUR };

test("the first run is a tour: a cell that runs, an answer to re-run, and a prompt to type in", async ({ page }) => {
	await openApp(page, undefined, { ...piHolding(transcriptOf()), ...TOUR_STORED });
	const editor = page.locator(".cm-editor");
	await expect(editor).toContainText("This page is one markdown document");
	await expect(editor).toContainText("⌘⏎");
	await expect(editor).toContainText("Sign in** button appears");
	// The tour's prose is page material; its seeded exchange is a real turn pi
	// inherits (ADR 0037). What the user types in the tail is what pi is sent.
	await sendAtTail(page, "hi");
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(["hi"]);
	const said = (await rebuildsAsked(page)).flatMap(({ entries }) =>
		entries.flatMap((entry) => {
			const message = (entry as { message?: { role?: string; content?: unknown } }).message;
			return message?.role === "user" ? [JSON.stringify(message.content)] : [];
		}),
	);
	expect(said.some((text) => text.includes("Give me three names for a houseplant.")), "the seeded prompt is history pi holds").toBe(true);
	expect(said.some((text) => text.includes("This page is one markdown document")), "a note is never something the user said").toBe(false);
});

test("the tour's slider changes its sentence with no pi started", async ({ page }) => {
	await openApp(page, undefined, { cell_state_read: { state: null }, ...TOUR_STORED });
	const sentence = page.locator("p.tour-coffee");
	await expect(sentence).toHaveText("3 cups is about 285 mg of caffeine.", { timeout: 10_000 });
	await page.locator('input[type="range"]').fill("5");
	await expect(sentence).toHaveText("5 cups is about 475 mg of caffeine.");
	expect((await ipcCalls(page)).filter((call) => call.cmd === "pi_start"), "the cell needs no pi").toEqual([]);
});

test("editing the tour's example prompt and sending runs it again in place", async ({ page }) => {
	await openApp(page, undefined, { ...piHolding(transcriptOf()), ...TOUR_STORED });
	const question = page.locator(".cm-line", { hasText: "Give me three names for a houseplant." });
	await question.click();
	await page.keyboard.press("End");
	for (let i = 0; i < " names for a houseplant.".length; i++) await page.keyboard.press("ArrowLeft");
	for (let i = 0; i < "three".length; i++) await page.keyboard.press("Backspace");
	await page.keyboard.type("five");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(["Give me five names for a houseplant."]);
	const md = await page.evaluate(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());
	expect(md, "the old answer is cut where the new one will land").not.toContain("Leaf Erikson");
	expect(md).toContain("## Your turn");
});

test("a seeded document reaches the canvas", async ({ page }) => {
	await openApp(page, "# Seeded\n\nFrom the query string.\n");
	await expect(page.locator(".cm-editor")).toContainText("From the query string.");
});

test("the canvas takes a caret and an edit", async ({ page }) => {
	await openApp(page, "# Title\n\nFirst line.\n");
	const line = page.locator(".cm-line", { hasText: "First line." });
	await line.click();
	// The real input path, which is what this layer is for: the key goes
	// through the engine rather than being a synthesised event.
	await page.keyboard.type(" Typed.");
	await expect(page.locator(".cm-editor")).toContainText("First line. Typed.");
});

test("lines stack down the page with real height", async ({ page }) => {
	await openApp(page, "# Title\n\nFirst line.\n\nSecond line.\n");
	const first = await page.locator(".cm-line", { hasText: "First line." }).boundingBox();
	const second = await page.locator(".cm-line", { hasText: "Second line." }).boundingBox();
	expect(first).not.toBeNull();
	expect(second).not.toBeNull();
	// Geometry stated relative to the other line, never as an absolute offset:
	// an absolute number rots the moment anyone tunes whitespace (docs/HANDBOOK.md).
	expect(first!.height).toBeGreaterThan(0);
	expect(second!.y).toBeGreaterThan(first!.y);
});

// ── Cells, by their chrome ──────────────────────────────────────────────────
// The gutter `+` and the grip are the canvas's; what they DO is the page's —
// the canvas raises `cell-insert` / `cell-move` and the page performs the edit
// (app/canvas-events.ts). So these drive the real gesture through the real
// engine and read what the page made of it.

const TWO_CELLS = "<!-- pi:note -->\n\nFIRST cell\n\n<!-- pi:note -->\n\nSECOND cell\n\n<!-- you -->\n\n";

/** Where each text sits among the rendered lines: order, never line numbers. */
async function lineOrder(page: import("@playwright/test").Page, ...texts: string[]): Promise<number[]> {
	const lines = await page.locator(".cm-line").allTextContents();
	return texts.map((text) => lines.findIndex((line) => line.includes(text)));
}

/** The grip of the cell holding `text` in `md`. It sits on the cell's marker
 *  line, keyed by the marker's offset, not on the line the text is on. */
function gripOf(page: import("@playwright/test").Page, md: string, text: string) {
	const at = md.lastIndexOf("<!--", md.indexOf(text));
	return page.locator(`.doc-cell-handle[data-at="${at}"]`);
}

/** Drags the cell holding `text` by its grip and drops it on the page's last gap. */
async function dragToEnd(page: import("@playwright/test").Page, md: string, text: string) {
	const grip = gripOf(page, md, text);
	// The grip shows on its line's hover, as it does for a reader.
	await grip.locator("xpath=ancestor::*[contains(@class,'cm-line')][1]").hover();
	const from = (await grip.boundingBox())!;
	// The gap rows are zero-height, so their position is read off the layout
	// rather than asked of a locator that would call them invisible.
	const toY = await page.evaluate(() => {
		const gaps = document.querySelectorAll(".doc-cell-gap");
		return gaps[gaps.length - 1]!.getBoundingClientRect().top;
	});
	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	// In steps: the grip treats a first move under two pixels as a trembling
	// click, not a drag (`cellDragHandle`).
	await page.mouse.move(from.x + from.width / 2, toY, { steps: 8 });
	await page.mouse.up();
}

test("dragging a cell by its grip moves it to the gap it lands on, and undo puts it back", async ({ page }) => {
	await openApp(page, TWO_CELLS);
	// The editor has the keyboard, so the undo below reaches it.
	await page.locator(".cm-line", { hasText: "SECOND cell" }).click();
	const [first, second] = await lineOrder(page, "FIRST cell", "SECOND cell");
	expect(first).toBeLessThan(second!);

	await dragToEnd(page, TWO_CELLS, "FIRST cell");
	await expect.poll(async () => {
		const [a, b] = await lineOrder(page, "FIRST cell", "SECOND cell");
		return a! > b!;
	}, { message: "the dragged cell now sits below the other" }).toBe(true);

	await page.keyboard.press("ControlOrMeta+z");
	await expect.poll(async () => {
		const [a, b] = await lineOrder(page, "FIRST cell", "SECOND cell");
		return a! < b!;
	}, { message: "undo restores the order" }).toBe(true);
});

test("a dragged cell's new order is what the page saves", async ({ page }) => {
	await openApp(page, TWO_CELLS);
	await dragToEnd(page, TWO_CELLS, "FIRST cell");
	// The save is the canvas's debounced `doc-change`, answered by `docs_write`.
	await expect.poll(async () => {
		const calls = await page.evaluate(() => (window as unknown as { __calls: IpcCall[] }).__calls);
		const written = calls.filter((call) => call.cmd === "docs_write").at(-1)?.args as { content?: string } | undefined;
		const content = written?.content ?? "";
		return content.indexOf("SECOND cell") >= 0 && content.indexOf("SECOND cell") < content.indexOf("FIRST cell");
	}, { message: "the last write holds the moved order", timeout: 5000 }).toBe(true);
});



/** The document the canvas holds, as the page would save it. */
function documentOf(page: import("@playwright/test").Page): Promise<string> {
	return page.evaluate(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());
}

/** Opens the `+` in the gap above the cell holding `text`. */
async function openInsertAbove(page: import("@playwright/test").Page, md: string, text: string) {
	const at = md.lastIndexOf("<!--", md.indexOf(text));
	const plus = page.locator(`.doc-cell-gap[data-at="${at}"] .doc-cell-gap-plus`);
	// The `+` shows on hover, as it does for a reader.
	await plus.hover();
	await plus.click();
}

/** What sits between the two seeded cells' texts. */
function between(md: string): string {
	return md.slice(md.indexOf("FIRST cell") + "FIRST cell".length, md.indexOf("SECOND cell"));
}

test("the gutter + offers the three cell kinds and inserts the one chosen", async ({ page }) => {
	await openApp(page, TWO_CELLS);
	await openInsertAbove(page, TWO_CELLS, "SECOND cell");
	const menu = page.locator(".doc-block-menu");
	await expect(menu.getByRole("button")).toHaveText(["Markdown", "Prompt", "JavaScript"]);
	// The menu takes the keyboard when it opens, or arrow keys reach the
	// document behind it.
	await expect(menu.getByRole("button", { name: "Markdown" })).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect(menu.getByRole("button", { name: "Prompt" })).toBeFocused();

	await menu.getByRole("button", { name: "JavaScript" }).click();
	await expect(menu).toHaveCount(0);
	expect(between(await documentOf(page))).toContain("<!-- pi:cell js");
});

for (const [label, marker] of [
	["Markdown", "<!-- pi:note -->"],
	["Prompt", "<!-- you -->"],
] as const) {
	test(`the gutter + inserts a ${label} cell where it was clicked`, async ({ page }) => {
		await openApp(page, TWO_CELLS);
		await openInsertAbove(page, TWO_CELLS, "SECOND cell");
		await page.locator(".doc-block-menu").getByRole("button", { name: label }).click();
		expect(between(await documentOf(page))).toContain(marker);
	});
}

test("typing after an insert lands in the new cell", async ({ page }) => {
	await openApp(page, TWO_CELLS);
	await openInsertAbove(page, TWO_CELLS, "SECOND cell");
	await page.locator(".doc-block-menu").getByRole("button", { name: "Markdown" }).click();
	await page.keyboard.type("hello");
	expect(between(await documentOf(page))).toMatch(/<!-- pi:note -->\n\nhello/);
});

test("Escape and the backdrop both close the insert menu without inserting", async ({ page }) => {
	await openApp(page, TWO_CELLS);
	const before = await documentOf(page);

	await openInsertAbove(page, TWO_CELLS, "SECOND cell");
	await expect(page.locator(".doc-block-menu")).toHaveCount(1);
	await page.keyboard.press("Escape");
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	expect(await documentOf(page)).toBe(before);

	await openInsertAbove(page, TWO_CELLS, "SECOND cell");
	await page.locator(".doc-menu-backdrop").click({ position: { x: 5, y: 5 } });
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	expect(await documentOf(page)).toBe(before);
});

// ── The cell menu ───────────────────────────────────────────────────────────
// A click on a cell's grip (not a drag) raises `cell-menu`; the page opens the
// menu and performs whatever is chosen. Labels and order are the interaction's
// (ADR 0010), as `app/menus.ts` gives them.

const CELLS = [
	"<!-- pi:note -->\n\nNOTE cell\n\n",
	"<!-- you -->\n\nASKED prompt\n\n<!-- pi -->\n\nANSWER text\n\n",
	"<!-- you -->\n\nOPEN prompt\n\n",
	"<!-- you -->\n\n",
].join("");

/** Opens the cell menu of the cell holding `text`, by a click on its grip. */
async function openCellMenu(page: import("@playwright/test").Page, md: string, text: string) {
	const grip = gripOf(page, md, text);
	await grip.locator("xpath=ancestor::*[contains(@class,'cm-line')][1]").hover();
	await grip.click();
	await expect(page.locator(".doc-block-menu")).toHaveCount(1);
}

/** Every row of the open menu, section labels included, in order. */
function menuRows(page: import("@playwright/test").Page) {
	return page.locator(".doc-block-menu > button, .doc-block-menu > .doc-menu-label");
}

/** A prompt as the user wrote it: without the `[now: …]` line every send ends
 *  with (ADR 0028), which `e2e/flows.spec.ts` asserts on its own. */
const asWritten = (message?: string) => message?.replace(/\n\[now: [^\]\n]*\]$/, "");

/** Recorded IPC calls the page made. */
function ipcCalls(page: import("@playwright/test").Page): Promise<IpcCall[]> {
	return page.evaluate(() => (window as unknown as { __calls: IpcCall[] }).__calls);
}

test("a markdown cell's menu: run disabled, its own mode marked, and the cell ops", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "NOTE cell");
	await expect(menuRows(page)).toHaveText(["run", "mode", "Markdown ·", "Prompt", "JavaScript", "cell", "duplicate", "delete"]);
	const menu = page.locator(".doc-block-menu");
	await expect(menu.getByRole("button", { name: "run" })).toBeDisabled();
	await expect(menu.getByRole("button", { name: "Markdown ·" })).toBeDisabled();
	// The keyboard lands on the first item that can be chosen.
	await expect(menu.getByRole("button", { name: "Prompt" })).toBeFocused();
});

test("an answered prompt's menu offers run again and both deletes", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "ASKED prompt");
	await expect(menuRows(page)).toHaveText([
		"run again",
		"mode",
		"Markdown",
		"Prompt ·",
		"JavaScript",
		"cell",
		"duplicate",
		"delete (with answer)",
		"delete (keep the answer)",
	]);
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "run again" })).toBeEnabled();
});

test("an unanswered prompt's menu offers run and one delete", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "OPEN prompt");
	await expect(menuRows(page)).toHaveText(["run", "mode", "Markdown", "Prompt ·", "JavaScript", "cell", "duplicate", "delete"]);
});

test("changing a cell's mode rewrites its marker and nothing else", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "NOTE cell");
	await page.locator(".doc-block-menu").getByRole("button", { name: "Prompt" }).click();
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	const md = await documentOf(page);
	expect(md.startsWith("<!-- you -->\n\nNOTE cell")).toBe(true);
	expect(md.slice(md.indexOf("NOTE cell"))).toBe(CELLS.slice(CELLS.indexOf("NOTE cell")));
});

test("duplicate puts a copy of the cell directly below it", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "NOTE cell");
	await page.locator(".doc-block-menu").getByRole("button", { name: "duplicate" }).click();
	const md = await documentOf(page);
	const first = md.indexOf("NOTE cell");
	const second = md.indexOf("NOTE cell", first + 1);
	expect(second).toBeGreaterThan(first);
	expect(second).toBeLessThan(md.indexOf("ASKED prompt"));
});

test("deleting an answered prompt takes its answer too, and undo brings both back", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "ASKED prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete (with answer)" }).click();
	let md = await documentOf(page);
	expect(md).not.toContain("ASKED prompt");
	expect(md).not.toContain("ANSWER text");
	await page.keyboard.press("ControlOrMeta+z");
	md = await documentOf(page);
	expect(md).toContain("ASKED prompt");
	expect(md).toContain("ANSWER text");
});

test("delete (keep the answer) removes the prompt and leaves its answer standing", async ({ page }) => {
	await openApp(page, CELLS);
	await openCellMenu(page, CELLS, "ASKED prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete (keep the answer)" }).click();
	const md = await documentOf(page);
	expect(md).not.toContain("ASKED prompt");
	expect(md).toContain("ANSWER text");
});

test("run sends the cell's own text to pi", async ({ page }) => {
	// A pi that answers what it holds — nothing yet — so the send can bring it
	// up to date before prompting (ADR 0021).
	await openApp(page, CELLS, piHolding(transcriptOf()));
	await openCellMenu(page, CELLS, "OPEN prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "run", exact: true }).click();
	await expect
		.poll(async () =>
			(await ipcCalls(page)).some((call) => {
				const command = (call.args as { command?: { type?: string; message?: string } }).command;
				return call.cmd === "pi_send" && command?.type === "prompt" && asWritten(command.message) === "OPEN prompt";
			}),
		)
		.toBe(true);
});

test("Escape closes the cell menu without an edit", async ({ page }) => {
	await openApp(page, CELLS);
	const before = await documentOf(page);
	await openCellMenu(page, CELLS, "NOTE cell");
	await page.keyboard.press("Escape");
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	expect(await documentOf(page)).toBe(before);
});

// ── The step menu and the selection quote ───────────────────────────────────
// A step's own `⋯` (a reply, a follow-up prompt inside a block) raises
// `segment-menu`; a right-click inside a selection raises `selection-menu`.

const STEPS = [
	"<!-- you -->\n\nASKED prompt\n\n<!-- pi -->\n\nANSWER text\n\n",
	"<!-- pi:block -->\n\n<!-- you -->\n\nFOLLOW prompt\n\n",
	"<!-- you -->\n\n",
].join("");

/** Opens the step menu whose head sits just above the line holding `text`. */
async function openStepMenu(page: import("@playwright/test").Page, text: string) {
	// Step dots carry no offset of their own to select by, so take the last pair
	// that comes before the line holding the text, in document order.
	const index = await page.evaluate((needle) => {
		const target = [...document.querySelectorAll(".cm-line")].find((line) => line.textContent?.includes(needle));
		const dots = [...document.querySelectorAll(".doc-seg-dots")];
		let found = -1;
		dots.forEach((dot, i) => {
			if (target && dot.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) found = i;
		});
		return found;
	}, text);
	expect(index, `a step ⋯ above "${text}"`).toBeGreaterThanOrEqual(0);
	const dots = page.locator(".doc-seg-dots").nth(index);
	await dots.hover();
	await dots.click();
}

test("a reply's ⋯ offers run again and delete, under its role", async ({ page }) => {
	await openApp(page, STEPS);
	await openStepMenu(page, "ANSWER text");
	await expect(menuRows(page)).toHaveText(["run again", "agent", "delete"]);
	await expect(page.locator(".doc-block-menu .doc-menu-destructive")).toHaveText("delete");
});

test("a follow-up prompt's ⋯ offers delete only", async ({ page }) => {
	await openApp(page, STEPS);
	await openStepMenu(page, "FOLLOW prompt");
	await expect(menuRows(page)).toHaveText(["you", "delete"]);
});

test("a step's delete removes just that step, and undo restores it", async ({ page }) => {
	await openApp(page, STEPS);
	await openStepMenu(page, "ANSWER text");
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete" }).click();
	let md = await documentOf(page);
	expect(md).not.toContain("ANSWER text");
	expect(md).toContain("ASKED prompt");
	expect(md).toContain("FOLLOW prompt");
	await page.keyboard.press("ControlOrMeta+z");
	md = await documentOf(page);
	expect(md).toContain("ANSWER text");
});

test("a reply's run again re-sends the prompt above it", async ({ page }) => {
	await openApp(page, STEPS, piHolding(transcriptOf()));
	await openStepMenu(page, "ANSWER text");
	await page.locator(".doc-block-menu").getByRole("button", { name: "run again" }).click();
	await expect
		.poll(async () =>
			(await ipcCalls(page)).some((call) => {
				const command = (call.args as { command?: { type?: string; message?: string } }).command;
				return call.cmd === "pi_send" && command?.type === "prompt" && asWritten(command.message) === "ASKED prompt";
			}),
		)
		.toBe(true);
});

test("the step menu does not open while a turn writes into the page", async ({ page }) => {
	await openApp(page, STEPS);
	// The page's own state for "a turn is running" is the canvas's `streaming`.
	await page.evaluate(() => {
		(document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming = true;
	});
	await openStepMenu(page, "ANSWER text");
	await afterFrames(page);
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	// The control: the same gesture, idle, does open it — or the refusal above
	// would pass on a page that listens to nothing.
	await page.evaluate(() => {
		(document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming = false;
	});
	await openStepMenu(page, "ANSWER text");
	await expect(page.locator(".doc-block-menu")).toHaveCount(1);
});

// A press on the outer half of a head's first or last glyph is, to the engine,
// a press beside it: it places a caret there, the head's line is drawn again
// for the new caret and the release finds another element, so no click is
// sent. `locator.click()` presses the exact centre, which always worked.

/** How long a press is held. A hand's lasts longer; this is enough for the
 *  page to draw the line again between the press and the release, which a
 *  release sent in the same instant gives it no time for. */
const PRESS_HELD_MS = 40;

for (const [what, selector, across] of [
	["the left half of a step's ⋯", ".doc-seg-dots", 0.25],
	["the right half of a step's ⋯", ".doc-seg-dots", 0.75],
	["the left half of a block's ⋯", ".doc-role-menu > .doc-role-dots:not(.doc-seg-dots)", 0.25],
	["the right half of a block's ⋯", ".doc-role-menu > .doc-role-dots:not(.doc-seg-dots)", 0.75],
	["the left edge of a block's head", ".doc-role-menu:has(> .doc-role-dots:not(.doc-seg-dots))", 0.1],
] as const) {
	test(`a press on ${what} opens its menu`, async ({ page }) => {
		await openApp(page, STEPS);
		// The last on the page: a caret the engine places at the very start of
		// the document, just after the canvas took the focus, CodeMirror puts
		// back, so the first block's head loses no click for a moment after a load.
		const target = page.locator(selector).last();
		await target.hover();
		const box = (await target.boundingBox())!;
		// Not rounded: half a pixel decides which side of the glyph is pressed.
		await page.mouse.click(box.x + box.width * across, box.y + box.height / 2, { delay: PRESS_HELD_MS });
		await expect(page.locator(".doc-block-menu")).toHaveCount(1);
	});
}

/** Selects the whole line holding `text` and right-clicks inside the selection. */
async function rightClickSelection(page: import("@playwright/test").Page, text: string) {
	const line = page.locator(".cm-line", { hasText: text });
	await line.click();
	await page.keyboard.press("Home");
	await page.keyboard.press("Shift+End");
	const box = (await line.boundingBox())!;
	await page.mouse.click(box.x + 10, box.y + box.height / 2, { button: "right" });
}

test("right-clicking a selection quotes it into its block's reply slot", async ({ page }) => {
	// Two blocks, the selection in the first: the quote must land at that
	// block's end, above the second.
	await openApp(page, CELLS);
	await rightClickSelection(page, "ANSWER text");
	const menu = page.locator(".doc-block-menu");
	await expect(menu.getByRole("button")).toHaveText(["quote for follow-up"]);
	await menu.getByRole("button", { name: "quote for follow-up" }).click();
	const md = await documentOf(page);
	// The quote lands under the block it came from, not at the foot of the page.
	const quote = md.indexOf("> [!snippet]\n> ANSWER text");
	expect(quote).toBeGreaterThan(md.indexOf("ANSWER text"));
	expect(quote).toBeLessThan(md.indexOf("OPEN prompt"));
});

test("right-clicking with no selection opens the block menu instead", async ({ page }) => {
	await openApp(page, STEPS);
	const box = (await page.locator(".cm-line", { hasText: "ASKED prompt" }).boundingBox())!;
	await page.mouse.click(box.x + 10, box.y + box.height / 2, { button: "right" });
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "answer this block" })).toBeVisible();
});

// ── The block menu ──────────────────────────────────────────────────────────
// The ⋯ on a block's head, or a right-click on the block, raises `block-menu`.

const TOOL_BLOCK = [
	"<!-- you -->\n\nEDIT prompt\n\n",
	'<!-- pi:tool edit #c1 -->\n\n```json\n{ "path": "a.ts", "edits": [{ "oldText": "x", "newText": "y" }] }\n```\n\n',
	"<!-- pi:result #c1 -->\n\n```\nok\n```\n\n",
	"<!-- pi -->\n\nEDITED text\n\n",
	"<!-- you -->\n\n",
].join("");

const KEEPS_ARTIFACT = [
	"<!-- you -->\n\nCHART prompt\n\n<!-- pi -->\n\nhere it is\n\n",
	"<!-- pi:cell js #keep1 -->\n\n```js\n1\n```\n\n",
	"<!-- you -->\n\nOPEN prompt\n\n<!-- you -->\n\n",
].join("");

const IS_ARTIFACT = [
	"<!-- you -->\n\nFIRST prompt\n\n<!-- pi -->\n\nfirst answer\n\n",
	"<!-- pi:artifact @app -->\n\n<!-- pi:cell js #art1 -->\n\n```js\n2\n```\n\n",
	"<!-- you -->\n\n",
].join("");

/** Opens the block menu from the head of the block whose prompt holds `text`. */
async function openBlockMenu(page: import("@playwright/test").Page, text: string) {
	// The head is the last block-menu target before the prompt's own line.
	const index = await page.evaluate((needle) => {
		const target = [...document.querySelectorAll(".cm-line")].find((line) => line.textContent?.includes(needle));
		const heads = [...document.querySelectorAll(".doc-role-menu")];
		let found = -1;
		heads.forEach((head, i) => {
			if (target && head.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) found = i;
		});
		return found;
	}, text);
	expect(index, `a block head above "${text}"`).toBeGreaterThanOrEqual(0);
	const head = page.locator(".doc-role-menu").nth(index);
	await head.hover();
	await head.click();
}

const BLOCK_ROWS = ["answer this block", "insert view over artifact", "rename block", "collapse / expand block", "block"];

test("a block's head opens its menu, with the block's operations", async ({ page }) => {
	await openApp(page, CELLS);
	await openBlockMenu(page, "ASKED prompt");
	await expect(menuRows(page)).toHaveText([...BLOCK_ROWS, "delete block"]);
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "answer this block" })).toBeFocused();
});

test("answer this block stages a reply slot under the block, with the caret in it", async ({ page }) => {
	await openApp(page, CELLS);
	await openBlockMenu(page, "ASKED prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "answer this block" }).click();
	await page.keyboard.type("REPLY here");
	const md = await documentOf(page);
	const reply = md.indexOf("REPLY here");
	expect(reply).toBeGreaterThan(md.indexOf("ANSWER text"));
	expect(reply).toBeLessThan(md.indexOf("OPEN prompt"));
});

test("insert view over artifact is offered only where a view fits", async ({ page }) => {
	await openApp(page, CELLS);
	await openBlockMenu(page, "ASKED prompt");
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "insert view over artifact" })).toBeDisabled();
});

test("insert view over artifact puts a rendered view below the result", async ({ page }) => {
	await openApp(page, TOOL_BLOCK);
	await openBlockMenu(page, "EDIT prompt");
	const item = page.locator(".doc-block-menu").getByRole("button", { name: "insert view over artifact" });
	await expect(item).toBeEnabled();
	await item.click();
	const md = await documentOf(page);
	const view = md.indexOf("<!-- pi:view diff");
	expect(view).toBeGreaterThan(md.indexOf("<!-- pi:result #c1"));
});

test("collapse / expand folds the block away and back", async ({ page }) => {
	await openApp(page, CELLS);
	const answer = page.locator(".cm-line", { hasText: "ANSWER text" });
	await expect(answer).toHaveCount(1);
	await openBlockMenu(page, "ASKED prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "collapse / expand block" }).click();
	await expect(answer).toHaveCount(0);
	// Folded, the block is one line with no head of its own; a right-click on
	// it opens the same menu.
	await page.locator(".doc-block-collapsed").click({ button: "right" });
	await page.locator(".doc-block-menu").getByRole("button", { name: "collapse / expand block" }).click();
	await expect(answer).toHaveCount(1);
});

test("delete block takes the prompt, its reply and everything under it; undo restores them", async ({ page }) => {
	await openApp(page, CELLS);
	await openBlockMenu(page, "ASKED prompt");
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete block" }).click();
	let md = await documentOf(page);
	expect(md).not.toContain("ASKED prompt");
	expect(md).not.toContain("ANSWER text");
	expect(md).toContain("OPEN prompt");
	await page.keyboard.press("ControlOrMeta+z");
	md = await documentOf(page);
	expect(md).toContain("ASKED prompt");
	expect(md).toContain("ANSWER text");
});

test("a block that made an artifact says so, and its delete keeps the artifact", async ({ page }) => {
	await openApp(page, KEEPS_ARTIFACT);
	await openBlockMenu(page, "CHART prompt");
	await expect(menuRows(page)).toHaveText([...BLOCK_ROWS, "delete block (keeps the artifact)"]);
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete block (keeps the artifact)" }).click();
	const md = await documentOf(page);
	expect(md).not.toContain("CHART prompt");
	expect(md).toContain("#keep1");
});

test("an artifact's own head offers delete artifact, which takes it whole", async ({ page }) => {
	await openApp(page, IS_ARTIFACT);
	const head = page.locator(".doc-block-head").first();
	await head.hover();
	await head.click();
	await expect(menuRows(page)).toHaveText([...BLOCK_ROWS, "delete artifact"]);
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete artifact" }).click();
	const md = await documentOf(page);
	expect(md).not.toContain("@app");
	expect(md).not.toContain("#art1");
	expect(md).toContain("FIRST prompt");
});

test("the block menu does not open while a turn writes into the page", async ({ page }) => {
	await openApp(page, CELLS);
	const setStreaming = (on: boolean) =>
		page.evaluate((value) => {
			(document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming = value;
		}, on);
	await setStreaming(true);
	await openBlockMenu(page, "ASKED prompt");
	await afterFrames(page);
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	// The control, as for the step menu.
	await setStreaming(false);
	await openBlockMenu(page, "ASKED prompt");
	await expect(page.locator(".doc-block-menu")).toHaveCount(1);
});

// ── Rename, through a question asked inside the document ────────────────────

const NAMED = [
	"<!-- you -->\n\n## Old name\n\nNAMED prompt\n\n<!-- pi -->\n\nits answer\n\n",
	"<!-- you -->\n\nOTHER prompt\n\n<!-- you -->\n\n",
].join("");

/** Opens rename on the block whose prompt holds `text`; returns its field. */
async function openRename(page: import("@playwright/test").Page, text: string) {
	await openBlockMenu(page, text);
	await page.locator(".doc-block-menu").getByRole("button", { name: "rename block" }).click();
	const field = page.locator(".cm-editor .doc-ui-request .doc-ui-request-input");
	await expect(field).toBeVisible();
	return field;
}

test("rename asks inside the document, focused, with the current name in it", async ({ page }) => {
	await openApp(page, NAMED);
	const field = await openRename(page, "NAMED prompt");
	await expect(page.locator(".doc-ui-request-title")).toHaveText("Block name");
	await expect(field).toBeFocused();
	await expect(field).toHaveValue("Old name");
});

test("a new name replaces the block's heading", async ({ page }) => {
	await openApp(page, NAMED);
	const field = await openRename(page, "NAMED prompt");
	await field.fill("New name");
	await field.press("Enter");
	await expect(page.locator(".doc-ui-request")).toHaveCount(0);
	const md = await documentOf(page);
	expect(md).toContain("## New name\n\nNAMED prompt");
	expect(md).not.toContain("Old name");
});

test("an empty name removes the heading", async ({ page }) => {
	await openApp(page, NAMED);
	const field = await openRename(page, "NAMED prompt");
	await field.fill("");
	await field.press("Enter");
	const md = await documentOf(page);
	expect(md).not.toContain("##");
	expect(md).toContain("NAMED prompt");
});

test("a block with no heading gains one", async ({ page }) => {
	await openApp(page, NAMED);
	const field = await openRename(page, "OTHER prompt");
	await expect(field).toHaveValue("");
	await field.fill("Fresh");
	await page.locator(".doc-ui-request").getByRole("button", { name: "send" }).click();
	const md = await documentOf(page);
	expect(md.indexOf("## Fresh")).toBeGreaterThan(md.indexOf("its answer"));
	expect(md.indexOf("## Fresh")).toBeLessThan(md.indexOf("OTHER prompt"));
});

test("Escape cancels a rename and changes nothing", async ({ page }) => {
	await openApp(page, NAMED);
	const before = await documentOf(page);
	const field = await openRename(page, "NAMED prompt");
	await field.fill("Not this");
	await field.press("Escape");
	await expect(page.locator(".doc-ui-request")).toHaveCount(0);
	expect(await documentOf(page)).toBe(before);
});

test("an edit made while the question is open does not misplace the rename", async ({ page }) => {
	await openApp(page, NAMED);
	const field = await openRename(page, "NAMED prompt");
	// Text added ABOVE the block shifts every offset the question was asked at.
	await page.evaluate(() => {
		const chat = document.querySelector("document-chat") as unknown as {
			edit(fn: () => { changes: { from: number; insert: string } }): void;
		};
		chat.edit(() => ({ changes: { from: 0, insert: "<!-- pi:note -->\n\nADDED above\n\n" } }));
	});
	await field.fill("Renamed");
	await field.press("Enter");
	const md = await documentOf(page);
	expect(md).toContain("ADDED above");
	expect(md).toContain("## Renamed\n\nNAMED prompt");
	expect(md).not.toContain("Old name");
});

// ── The history pi is sent with ─────────────────────────────────────────────
// Before a prompt goes, pi's transcript must hold what the document says above
// it (ADR 0002, ADR 0021): read with `get_entries`, rewritten through
// `pi_rebuild` when it differs, left alone when it does not.

const SESSION_FILE = "/tmp/piary-sessions/2026-01-01T00-00-00-000Z_scratch.jsonl";

/** pi's answer to `get_entries` for a transcript of question/answer turns. */
function transcriptOf(...turns: [string, string][]) {
	const entries: Record<string, unknown>[] = [];
	let parentId: string | null = null;
	const add = (message: Record<string, unknown>) => {
		const id = `t${entries.length}`;
		entries.push({ type: "message", id, parentId, timestamp: "2026-01-01T00:00:00.000Z", message });
		parentId = id;
	};
	for (const [question, answer] of turns) {
		add({ role: "user", content: [{ type: "text", text: question }], timestamp: 1 });
		add({
			role: "assistant",
			content: [{ type: "text", text: answer }],
			api: "openai-responses",
			provider: "openai",
			model: "gpt-x",
			stopReason: "stop",
			timestamp: 2,
		});
	}
	return { success: true, data: { entries, leafId: parentId } };
}

/** The answers a send needs, around the transcript pi holds. */
function piHolding(transcript: ReturnType<typeof transcriptOf>, extra: Answers = {}): Answers {
	return {
		"pi_send:get_entries": transcript,
		"pi_send:get_state": { success: true, data: { sessionFile: SESSION_FILE } },
		...extra,
	};
}

/** Types `text` into the trailing prompt and sends it with ⌘⏎. */
async function sendAtTail(page: import("@playwright/test").Page, text: string) {
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type(text);
	await page.keyboard.press("ControlOrMeta+Enter");
}

/** The prompts pi was sent, in order, with each call's index among all calls. */
async function promptsSent(page: import("@playwright/test").Page) {
	return (await ipcCalls(page)).flatMap((call, index) => {
		const command = (call.args as { command?: { type?: string; message?: string } }).command;
		return call.cmd === "pi_send" && command?.type === "prompt" ? [{ index, message: asWritten(command.message) }] : [];
	});
}

/** Every `pi_rebuild` the page asked for, with its index among all calls. */
async function rebuildsAsked(page: import("@playwright/test").Page) {
	return (await ipcCalls(page)).flatMap((call, index) =>
		call.cmd === "pi_rebuild" ? [{ index, ...(call.args as { sessionFile: string; entries: unknown[] }) }] : [],
	);
}

const ASKED = "<!-- you -->\n\nWhat is 2+2?\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\n";

test("an unedited document sends without rewriting pi's history", async ({ page }) => {
	// No frontmatter: the app's documents need none, and the comparison must not
	// read its absence as an edit (ADR 0021 §4).
	await openApp(page, ASKED, piHolding(transcriptOf(["What is 2+2?", "Four."])));
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(["And 3+3?"]);
	expect(await rebuildsAsked(page)).toEqual([]);
});

test("an edited answer is rewritten into pi's history before the prompt goes", async ({ page }) => {
	await openApp(page, ASKED.replace("Four.", "Five."), piHolding(transcriptOf(["What is 2+2?", "Four."])));
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	expect(rebuild, "the history was rewritten").toBeTruthy();
	expect(rebuild!.sessionFile, "at the path pi named").toBe(SESSION_FILE);
	const written = JSON.stringify(rebuild!.entries);
	expect(written).toContain("Five.");
	expect(written).not.toContain("Four.");
	expect(rebuild!.index, "before the prompt").toBeLessThan((await promptsSent(page))[0]!.index);
});

test("run again rewrites pi's history to what stands above the prompt", async ({ page }) => {
	const md = "<!-- you -->\n\nFIRST question\n\n<!-- pi -->\n\nfirst answer\n\n<!-- you -->\n\nSECOND question\n\n<!-- pi -->\n\nsecond answer\n\n<!-- you -->\n\n";
	await openApp(page, md, piHolding(transcriptOf(["FIRST question", "first answer"], ["SECOND question", "second answer"])));
	await openCellMenu(page, md, "FIRST question");
	await page.locator(".doc-block-menu").getByRole("button", { name: "run again" }).click();
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(["FIRST question"]);
	const [rebuild] = await rebuildsAsked(page);
	expect(rebuild, "pi forgot what came after the prompt being run").toBeTruthy();
	const written = JSON.stringify(rebuild!.entries);
	expect(written).not.toContain("first answer");
	expect(written).not.toContain("SECOND question");
});

test("a refused rewrite takes the turn back out and says why", async ({ page }) => {
	await openApp(
		page,
		ASKED.replace("Four.", "Five."),
		piHolding(transcriptOf(["What is 2+2?", "Four."]), { pi_rebuild: { reject: "the disk is full" } }),
	);
	await sendAtTail(page, "Are you sure?");
	await expect(page.locator("#status")).toContainText("the disk is full");
	// What the user was told is in the app's log too, for a bug report to hold.
	const logged = (await ipcCalls(page)).filter((call) => call.cmd === "log_line").map((call) => call.args as { level: string; message: string });
	expect(logged.some((line) => line.level === "notice" && line.message.includes("the disk is full"))).toBe(true);
	expect(await promptsSent(page)).toEqual([]);
	const md = await documentOf(page);
	expect(md).toContain("Five.");
	expect(md).toContain("Are you sure?");
	expect(md, "no answer region is left behind").not.toContain("<!-- pi -->\n\n\n");
	expect(md.match(/<!-- pi -->/g)?.length, "only the one answer the page started with").toBe(1);
});

test("the stop a rewrite causes is not reported as pi going away", async ({ page }) => {
	await openApp(
		page,
		ASKED.replace("Four.", "Five."),
		piHolding(transcriptOf(["What is 2+2?", "Four."]), { pi_rebuild: { emit: ["pi-exited", ["scratch", 0]] } }),
	);
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	expect(await rebuildsAsked(page), "a rewrite happened, and stopped pi").toHaveLength(1);
	await expect(page.locator("#status")).not.toContainText("pi stopped");
	const streaming = () =>
		page.evaluate(() => (document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming);
	expect(await streaming(), "the turn is still waiting for its answer").toBe(true);
	// The control: an exit nobody caused still ends the turn and says so.
	await page.evaluate(() => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit("pi-exited", ["scratch", 1]));
	await expect(page.locator("#status")).toContainText("pi stopped");
	expect(await streaming()).toBe(false);
});


// ── Collapsed blocks are remembered ─────────────────────────────────────────
// Folds are presentation state the canvas raises (`block-folds`) and the page
// keeps per session in `localStorage`, so a reload brings them back.

/** Collapses or expands the block whose prompt holds `text`, from its menu. */
async function toggleBlock(page: import("@playwright/test").Page, text: string) {
	await openBlockMenu(page, text);
	await page.locator(".doc-block-menu").getByRole("button", { name: "collapse / expand block" }).click();
}

/** The text of every collapsed block on the page. */
function collapsed(page: import("@playwright/test").Page) {
	return page.locator(".doc-block-collapsed").allTextContents();
}

/** Reloads the page and waits for the canvas, the folds' restore included. */
async function reload(page: import("@playwright/test").Page) {
	await page.reload();
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await afterFrames(page);
}

test("a collapsed block is still collapsed after a reload", async ({ page }) => {
	await openApp(page, CELLS);
	await toggleBlock(page, "ASKED prompt");
	await expect.poll(() => collapsed(page)).toEqual([expect.stringContaining("ASKED prompt")]);
	await reload(page);
	await expect.poll(() => collapsed(page)).toEqual([expect.stringContaining("ASKED prompt")]);
});

test("a reload with nothing collapsed collapses nothing", async ({ page }) => {
	// The control for the row above: a page that collapsed everything on load
	// would pass it.
	await openApp(page, CELLS);
	await reload(page);
	expect(await collapsed(page)).toEqual([]);
});

test("expanding a block again is remembered too", async ({ page }) => {
	await openApp(page, CELLS);
	await toggleBlock(page, "ASKED prompt");
	await expect.poll(() => collapsed(page)).toHaveLength(1);
	await page.locator(".doc-block-collapsed").click({ button: "right" });
	await page.locator(".doc-block-menu").getByRole("button", { name: "collapse / expand block" }).click();
	await expect.poll(() => collapsed(page)).toEqual([]);
	await reload(page);
	expect(await collapsed(page)).toEqual([]);
});

test("a send does not reopen a collapsed block", async ({ page }) => {
	await openApp(page, CELLS, piHolding(transcriptOf()));
	await toggleBlock(page, "ASKED prompt");
	await expect.poll(() => collapsed(page)).toHaveLength(1);
	await sendAtTail(page, "a new question");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	expect(await collapsed(page)).toEqual([expect.stringContaining("ASKED prompt")]);
});

test("deleting a collapsed block leaves its fold to no other block", async ({ page }) => {
	await openApp(page, CELLS);
	await toggleBlock(page, "ASKED prompt");
	await expect.poll(() => collapsed(page)).toHaveLength(1);
	await page.locator(".doc-block-collapsed").click({ button: "right" });
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete block" }).click();
	expect(await documentOf(page)).not.toContain("ASKED prompt");
	// In this window: the block that now sits where the deleted one was is not
	// collapsed by a fold left behind.
	await expect.poll(() => collapsed(page)).toEqual([]);
	await reload(page);
	expect(await collapsed(page)).toEqual([]);
});

test("an edit above a collapsed block does not reopen it after a reload", async ({ page }) => {
	await openApp(page, CELLS);
	await toggleBlock(page, "ASKED prompt");
	await expect.poll(() => collapsed(page)).toHaveLength(1);
	// Type into the note above it, then let the save land.
	await page.locator(".cm-line", { hasText: "NOTE cell" }).click();
	await page.keyboard.press("End");
	await page.keyboard.type(" with more words");
	await expect.poll(() => documentOf(page)).toContain("NOTE cell with more words");
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem("piary-folds:scratch")), { timeout: 5000 })
		.toBe(JSON.stringify([CELLS.indexOf("<!-- you -->") + " with more words".length]));
	// Reopened on the edited text, as the app reopens on what its store holds
	// (`?doc=` would otherwise re-seed the original). Same origin, so the same
	// stored folds.
	const edited = await documentOf(page);
	await page.goto(`/?doc=${encodeURIComponent(edited)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await expect.poll(() => collapsed(page)).toEqual([expect.stringContaining("ASKED prompt")]);
});

test("stored folds that cannot be read open the page with nothing collapsed", async ({ page, context }) => {
	// The control, beside it: the same document with folds that DO read
	// collapses its block, so "nothing collapsed" below is the corrupt record
	// being ignored and not the page having not got round to folding yet.
	const control = await context.newPage();
	const valid = JSON.stringify([CELLS.indexOf("<!-- you -->")]);
	await control.addInitScript((folds) => localStorage.setItem("piary-folds:scratch", folds), valid);
	await openApp(control, CELLS);
	await expect.poll(() => collapsed(control)).toEqual([expect.stringContaining("ASKED prompt")]);
	await control.close();

	await page.addInitScript(() => localStorage.setItem("piary-folds:scratch", "{not json"));
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(String(error)));
	await openApp(page, CELLS);
	// The control folded within one poll of the page opening; this one has had
	// as long, and an assertion that the page still reads as one.
	await expect(page.locator(".cm-line", { hasText: "ASKED prompt" })).toBeVisible();
	expect(await collapsed(page)).toEqual([]);
	expect(errors).toEqual([]);
});

// ── The block rail ──────────────────────────────────────────────────────────
// `<chat-index>` down the right edge: a tick per block and its steps, the
// reading position dark, the caret's block glowing (`caret-block`,
// `scroll-progress`).

/** A page of `n` answered prompts, named Q1…Qn, and a trailing slot. */
const blocks = (n: number) =>
	`${Array.from({ length: n }, (_, i) => `<!-- you -->\n\nQ${i + 1}\n\n<!-- pi -->\n\nA${i + 1}\n\n`).join("")}<!-- you -->\n\n`;

/** The labels of the rail's head ticks, in order. */
function railHeads(page: import("@playwright/test").Page) {
	return page.locator("chat-index .chat-index-item:not(.member)").evaluateAll((items) => items.map((item) => item.getAttribute("title")));
}

/** The label of the rail's dark tick, and its place among all ticks. */
function railCurrent(page: import("@playwright/test").Page) {
	return page.locator("chat-index .chat-index-item").evaluateAll((items) => {
		const at = items.findIndex((item) => item.classList.contains("current"));
		return { at, of: items.length };
	});
}

test("the rail shows a head tick per block, on the right, clear of the text", async ({ page }) => {
	await openApp(page, blocks(3));
	await expect.poll(() => railHeads(page)).toEqual(expect.arrayContaining(["Q1", "Q2", "Q3"]));
	const heads = await railHeads(page);
	expect(heads.indexOf("Q1")).toBeLessThan(heads.indexOf("Q2"));
	expect(heads.indexOf("Q2")).toBeLessThan(heads.indexOf("Q3"));
	const rail = (await page.locator("chat-index .chat-index-rail").boundingBox())!;
	const text = (await page.locator(".cm-content").boundingBox())!;
	expect(rail.x, "the rail starts right of where the text ends").toBeGreaterThanOrEqual(text.x + text.width);
});

test("the caret's block glows on the rail", async ({ page }) => {
	await openApp(page, blocks(3));
	await page.locator(".cm-line", { hasText: "A2" }).click();
	await expect(page.locator('chat-index .chat-index-item[title="Q2"]')).toHaveClass(/current-block/);
	await expect(page.locator('chat-index .chat-index-item[title="Q1"]')).not.toHaveClass(/current-block/);
});

test("scrolling moves the rail's reading tick", async ({ page }) => {
	await openApp(page, blocks(30));
	await expect.poll(async () => (await railCurrent(page)).at).toBe(0);
	await page.locator(".cm-scroller").evaluate((scroller) => scroller.scrollTo(0, scroller.scrollHeight));
	// The dark tick follows the reading line near the top of the window, so at
	// the bottom of the page it sits on the blocks in view, well past halfway.
	await expect.poll(async () => {
		const { at, of } = await railCurrent(page);
		return at > of / 2;
	}, { message: "the dark tick moved down the rail with the reading line" }).toBe(true);
	await page.locator(".cm-scroller").evaluate((scroller) => scroller.scrollTo(0, 0));
	await expect.poll(async () => (await railCurrent(page)).at).toBe(0);
});

test("the rail follows the document as it changes", async ({ page }) => {
	await openApp(page, blocks(2));
	await expect.poll(async () => (await railHeads(page)).filter((t) => /^Q/.test(t ?? "")).length).toBe(2);
	await openInsertAbove(page, blocks(2), "Q2");
	await page.locator(".doc-block-menu").getByRole("button", { name: "Prompt" }).click();
	await page.keyboard.type("Q-new");
	await expect.poll(() => railHeads(page), { timeout: 5000 }).toContain("Q-new");
});

test("a streamed answer reaches the rail while it streams", async ({ page }) => {
	await openApp(page, blocks(1), piHolding(transcriptOf(["Q1", "A1"])));
	await sendAtTail(page, "Q2");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	const writes = async () => (await ipcCalls(page)).filter((call) => call.cmd === "docs_write").length;
	const writtenBefore = await writes();
	await page.evaluate((event) => (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit("pi-event", ["scratch", event]), partial("A streaming answer"));
	await expect
		.poll(() => page.locator("chat-index .chat-index-item[title*='A streaming answer']").count(), {
			message: "a tick for the answer, mid-turn",
			intervals: [20],
		})
		.toBe(1);
	// The tick arrived ahead of any save of the chunk: the turn's own feed
	// refreshed the rail, not the (debounced) save path catching up later.
	expect(await writes(), "no save had landed yet").toBe(writtenBefore);
});

test("only the rail's ticks take the pointer; the text under its box stays the document's", async ({ page }) => {
	await openApp(page, blocks(3));
	await expect(page.locator("chat-index")).toHaveCSS("pointer-events", "none");
	await expect(page.locator("chat-index .chat-index-rail")).toHaveCSS("pointer-events", "auto");
});


// ── Rail gestures ───────────────────────────────────────────────────────────

/** The centre of the rail's tick titled `title`. */
async function tick(page: import("@playwright/test").Page, title: string) {
	const box = (await page.locator(`chat-index .chat-index-item[title="${title}"]`).first().boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** ⌥-drags the block whose head tick is `from` to just below the tick `to`. */
async function altDrag(page: import("@playwright/test").Page, from: string, to: string) {
	const a = await tick(page, from);
	const b = await tick(page, to);
	const rail = (await page.locator("chat-index .chat-index-rail").boundingBox())!;
	await page.keyboard.down("Alt");
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	// Past the target, toward the rail's end: the slot after `to`'s block.
	await page.mouse.move(b.x, Math.min(rail.y + rail.height - 1, b.y + (b.y - a.y) / 2), { steps: 8 });
	await page.mouse.up();
	await page.keyboard.up("Alt");
}

/** The order the seeded prompts now stand in. */
async function promptOrder(page: import("@playwright/test").Page) {
	const md = await documentOf(page);
	return [...md.matchAll(/^Q\d+$/gm)].map((match) => match[0]);
}

test("clicking a head tick brings its block into view", async ({ page }) => {
	await openApp(page, blocks(30));
	await expect(page.locator(".cm-line", { hasText: /^A30$/ })).not.toBeInViewport();
	const t = await tick(page, "Q30");
	await page.mouse.click(t.x, t.y);
	await expect(page.locator(".cm-line", { hasText: /^A30$/ })).toBeInViewport();
});

test("dragging along the rail scrubs the document", async ({ page }) => {
	await openApp(page, blocks(30));
	const first = await tick(page, "Q1");
	const last = await tick(page, "Q30");
	await page.mouse.move(first.x, first.y);
	await page.mouse.down();
	await page.mouse.move(last.x, last.y, { steps: 10 });
	await page.mouse.up();
	await expect(page.locator(".cm-line", { hasText: /^A30$/ })).toBeInViewport();
});

test("an option-drag on the rail moves a whole block, and undo puts it back", async ({ page }) => {
	await openApp(page, blocks(3));
	await expect.poll(() => promptOrder(page)).toEqual(["Q1", "Q2", "Q3"]);
	await altDrag(page, "Q1", "Q3");
	await expect.poll(() => promptOrder(page)).toEqual(["Q2", "Q3", "Q1"]);
	await page.locator(".cm-line", { hasText: /^A2$/ }).click();
	await page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => promptOrder(page)).toEqual(["Q1", "Q2", "Q3"]);
});

test("a collapsed block stays collapsed when the rail moves it", async ({ page }) => {
	await openApp(page, blocks(3));
	await toggleBlock(page, "Q1");
	await expect.poll(() => collapsed(page)).toEqual([expect.stringContaining("Q1")]);
	await altDrag(page, "Q1", "Q3");
	await expect.poll(() => promptOrder(page)).toEqual(["Q2", "Q3", "Q1"]);
	await expect.poll(() => collapsed(page)).toEqual([expect.stringContaining("Q1")]);
	// And what is kept for the next load follows it too.
	const md = await documentOf(page);
	const head = md.lastIndexOf("<!-- you -->", md.indexOf("Q1"));
	await expect.poll(() => page.evaluate(() => localStorage.getItem("piary-folds:scratch"))).toBe(JSON.stringify([head]));
});

test("the rail moves no block while a turn writes into the page", async ({ page }) => {
	await openApp(page, blocks(3));
	const setStreaming = (on: boolean) =>
		page.evaluate((value) => {
			(document.querySelector("document-chat") as unknown as { streaming: boolean }).streaming = value;
		}, on);
	await setStreaming(true);
	await altDrag(page, "Q1", "Q3");
	await afterFrames(page);
	expect(await promptOrder(page)).toEqual(["Q1", "Q2", "Q3"]);
	// The control: idle, the same drag moves it.
	await setStreaming(false);
	await altDrag(page, "Q1", "Q3");
	await expect.poll(() => promptOrder(page)).toEqual(["Q2", "Q3", "Q1"]);
});

test("the wheel over the rail scrolls the document", async ({ page }) => {
	await openApp(page, blocks(30));
	const top = () => page.locator(".cm-scroller").evaluate((scroller) => scroller.scrollTop);
	// Wherever the page opened (the editor brings its caret into view on load).
	const start = await top();
	const t = await tick(page, "Q5");
	await page.mouse.move(t.x, t.y);
	await page.mouse.wheel(0, 600);
	await expect.poll(top).toBeGreaterThan(start);
});

// ── Cell widget state ───────────────────────────────────────────────────────
// What a cell's `state()` holds is kept per document in the app's own store
// (`cell_state_read` / `cell_state_write`), restored when the document opens.

const STATEFUL = [
	"<!-- you -->\n\ncount\n\n",
	"<!-- pi:cell js #st -->\n\n```js\nconst n = view(state('n', 1))\n```\n\n",
	"<!-- pi:cell js #show -->\n\n```js\nhtl.html`<button class=\"bump\" onclick=${() => setState('n', n + 1)}>n is ${n}</button>`\n```\n\n",
	"<!-- you -->\n\n",
].join("");

/** The state the page asked to keep, newest last. */
async function stateWrites(page: import("@playwright/test").Page) {
	return (await ipcCalls(page)).filter((call) => call.cmd === "cell_state_write").map((call) => (call.args as { state: unknown }).state);
}

test("a cell's kept state is restored when the document opens", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: { state: { v: 2, views: {}, store: { n: 7 } } } });
	await expect(page.locator("button.bump")).toHaveText("n is 7", { timeout: 10_000 });
});

test("changing a cell's state is kept", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: { state: null } });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	await page.locator("button.bump").click();
	await expect(page.locator("button.bump")).toHaveText("n is 2");
	await expect
		.poll(async () => (await stateWrites(page)).some((state) => (state as { store?: { n?: number } })?.store?.n === 2), { timeout: 5000 })
		.toBe(true);
});

test("a document with nothing kept still keeps what changes", async ({ page }) => {
	// No record at all: the canvas must still be told "none", or it neither
	// restores nor saves.
	await openApp(page, STATEFUL, { cell_state_read: null });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	await page.locator("button.bump").click();
	await expect
		.poll(async () => (await stateWrites(page)).some((state) => (state as { store?: { n?: number } })?.store?.n === 2), { timeout: 5000 })
		.toBe(true);
});

test("a state that cannot be kept says nothing", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: { state: null }, cell_state_write: { reject: "disk full" } });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	await page.locator("button.bump").click();
	await expect.poll(async () => (await stateWrites(page)).length, { timeout: 5000 }).toBeGreaterThan(0);
	await expect(page.locator("#status")).toHaveText("");
});

const SLIDER = (max: number) => `const turns = view(Inputs.range([1, ${max}], {label: "Turns", step: 1, value: 6}))`;

test("a slider the user moved keeps its value when its cell is redefined", async ({ page }) => {
	const doc = [
		"<!-- you -->\n\nspiral\n\n",
		`<!-- pi:cell js #tu -->\n\n\`\`\`js\n${SLIDER(20)}\n\`\`\`\n\n`,
		"<!-- pi:cell js #out -->\n\n```js\nhtl.html`<p class=\"turns\">turns ${turns}</p>`\n```\n\n",
		"<!-- you -->\n\n",
	].join("");
	await openApp(page, doc, { cell_state_read: { state: null } });
	const slider = page.locator('input[type="range"]');
	await expect(page.locator("p.turns")).toHaveText("turns 6", { timeout: 10_000 });
	await slider.fill("15");
	await expect(page.locator("p.turns")).toHaveText("turns 15");
	await page.evaluate((source) => (document.querySelector("document-chat") as unknown as { setCellSource(id: string, source: string): boolean }).setCellSource("tu", source), SLIDER(30));
	await expect(slider).toHaveAttribute("max", "30");
	await expect(slider).toHaveValue("15");
	await expect(page.locator("p.turns")).toHaveText("turns 15");
});

// ── What a cell draws looks like Piary ──────────────────────────────────────
// Plain markup, `Inputs.*` and `Plot.plot` take the app's tokens with no styling
// from the agent: the canvas's serif and the libraries' own system-ui stop at
// the cell's output.

const PLAIN_OUTPUT = [
	"<!-- you -->\n\nsales\n\n",
	"<!-- pi:cell js #tbl -->\n\n```js\nhtl.html`<table><thead><tr><th>Day</th><th>Sales</th></tr></thead><tbody><tr><td>Mon</td><td>3</td></tr></tbody></table>`\n```\n\n",
	'<!-- pi:cell js #rng -->\n\n```js\nconst k = view(Inputs.range([1, 10], {label: "Size", step: 1, value: 3}))\n```\n\n',
	'<!-- pi:cell js #plt -->\n\n```js\nPlot.plot({title: "Sales by day", marks: [Plot.barY([{d: "Mon", n: k}], {x: "d", y: "n"})]})\n```\n\n',
	"<!-- you -->\n\n",
].join("");

test("what a cell draws takes the app's type and colours, not the canvas's or the library's", async ({ page }) => {
	await openApp(page, PLAIN_OUTPUT, { cell_state_read: { state: null } });
	await expect(page.locator(".cell-output figure h2")).toHaveText("Sales by day", { timeout: 15_000 });
	await expect(page.locator('.cell-output input[type="range"]')).toBeVisible();
	const seen = await page.evaluate(() => {
		const probe = document.createElement("div");
		probe.style.fontFamily = "var(--font-sans)";
		probe.style.color = "var(--foreground)";
		probe.style.accentColor = "var(--accent-foreground)";
		probe.style.backgroundColor = "var(--muted-foreground)";
		document.body.append(probe);
		const token = getComputedStyle(probe);
		const tokens = { sans: token.fontFamily, foreground: token.color, accent: token.accentColor, muted: token.backgroundColor };
		probe.remove();
		const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
		return {
			tokens,
			td: { font: style(".cell-output td").fontFamily, color: style(".cell-output td").color },
			label: style('.cell-output form[class^="inputs-"] label').fontFamily,
			range: style('.cell-output input[type="range"]').accentColor,
			title: style(".cell-output figure h2").fontFamily,
			chart: style('.cell-output svg[class^="plot-"]').fontFamily,
			tick: style('.cell-output svg[class^="plot-"] g[aria-label="y-axis tick label"]').color,
		};
	});
	expect(seen.td).toEqual({ font: seen.tokens.sans, color: seen.tokens.foreground });
	expect(seen.label).toBe(seen.tokens.sans);
	expect(seen.range).toBe(seen.tokens.accent);
	expect(seen.title).toBe(seen.tokens.sans);
	expect(seen.chart).toBe(seen.tokens.sans);
	expect(seen.tick).toBe(seen.tokens.muted);
});

// ── A cell's chart takes Piary's palette and the column's width ─────────────
// A cell writes plain `Plot.plot` and no colour: one series draws in the chart
// colour (src/styles/cell-theme.css), several take the palette in data order,
// and the chart is as wide as the column (src/notebook/plot-defaults.ts).
// Whatever the cell sets itself is drawn as written.

const SALES = '[{d: "Mon", n: 3, t: "web"}, {d: "Tue", n: 1, t: "shop"}, {d: "Fri", n: 2, t: "web"}]';
const chartCell = (id: string, source: string) => `<!-- pi:cell js #${id} -->\n\n\`\`\`js\n${source}\n\`\`\`\n\n`;
const chartDoc = (...sources: string[]) => `<!-- you -->\n\nsales\n\n${sources.map((source, i) => chartCell(`c${i}`, source)).join("")}<!-- you -->\n\n`;

/** The colours the `--chart-*` tokens and the foreground compute to, as a mark's `fill` reads back. */
const chartTokens = (page: import("@playwright/test").Page) =>
	page.evaluate(() => {
		const probe = document.createElement("div");
		document.body.append(probe);
		const seen = ["--chart-3", "--chart-1", "--foreground", "--muted-foreground"].map((token) => {
			probe.style.color = `var(${token})`;
			return getComputedStyle(probe).color;
		});
		probe.remove();
		return { first: seen[0], second: seen[1], foreground: seen[2], muted: seen[3] };
	});

/** The `fill` each bar of the `nth` chart is painted in, in document order. */
const barFills = (page: import("@playwright/test").Page, nth: number) =>
	page
		.locator('.cell-output svg[class^="plot-"]')
		.nth(nth)
		.locator('g[aria-label="bar"] rect')
		.evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).fill));

test("a cell's chart with no colour written draws in the chart colour, and its labels stay the text colour", async ({ page }) => {
	await openApp(
		page,
		chartDoc(`Plot.plot({marks: [Plot.frame(), Plot.barY(${SALES}, {x: "d", y: "n"}), Plot.text(${SALES}, {x: "d", y: "n", text: "n", dy: -6})]})`),
	);
	await expect(page.locator('.cell-output g[aria-label="bar"] rect')).toHaveCount(3, { timeout: 20_000 });
	const tokens = await chartTokens(page);
	expect(await barFills(page, 0)).toEqual([tokens.first, tokens.first, tokens.first]);
	const label = await page.locator('.cell-output g[aria-label="text"] text').first().evaluate((text) => getComputedStyle(text).fill);
	expect(label).toBe(tokens.foreground);
	// Plot draws a frame as a bare rect, not a group: it recedes with the axes all the same.
	const frame = await page.locator('.cell-output svg[class^="plot-"] [aria-label="frame"]').evaluate((rect) => getComputedStyle(rect).stroke);
	expect(frame).toBe(tokens.muted);
});

test("a cell's chart takes the palette in data order and the column's width, with nothing asked of the cell", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 1000 });
	await openApp(
		page,
		chartDoc(
			`Plot.plot({marks: [Plot.barY(${SALES}, {x: "d", y: "n", fill: "t"})]})`,
			`Plot.plot({color: {domain: ["shop", "web"]}, marks: [Plot.barY(${SALES}, {x: "d", y: "n", fill: "t"})]})`,
			`Plot.plot({color: {legend: true}, marks: [Plot.cell(${SALES}, {x: "d", y: "t", fill: "n"})]})`,
		),
	);
	const charts = page.locator('.cell-output svg[class^="plot-"]:not([class$="-ramp"])');
	await expect(charts.locator('g[aria-label="bar"] rect')).toHaveCount(6, { timeout: 20_000 });
	const tokens = await chartTokens(page);
	// web is the first series the data names, so it takes the first colour.
	expect(await barFills(page, 0)).toEqual([tokens.first, tokens.second, tokens.first]);
	// A domain the cell gives decides the order, and the colours are still the palette's.
	expect(await barFills(page, 1)).toEqual([tokens.second, tokens.first, tokens.second]);
	// Plot alone sorts the days Fri, Mon, Tue.
	await expect(charts.first().locator('g[aria-label="x-axis tick label"] text')).toHaveText(["Mon", "Tue", "Fri"]);
	const widths = await page.evaluate(() => ({
		column: document.querySelector(".cell-output")!.clientWidth,
		chart: document.querySelector('.cell-output svg[class^="plot-"]')!.getBoundingClientRect().width,
	}));
	expect(widths.column).toBeGreaterThan(640);
	expect(Math.round(widths.chart)).toBe(widths.column);
	// A continuous legend is an svg of Plot's too, and keeps Plot's size: only the chart fills the column.
	const legend = page.locator('.cell-output svg[class$="-ramp"]');
	await expect(legend).toBeVisible();
	expect(Math.round((await legend.boundingBox())!.width)).toBe(Number(await legend.getAttribute("width")));
});

test("a colour range, a scheme, a width or a margin a cell's chart sets itself is drawn as written", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 1000 });
	const bars = `Plot.barY(${SALES}, {x: "d", y: "n", fill: "t"})`;
	await openApp(
		page,
		chartDoc(
			`Plot.plot({color: {range: ["rgb(200, 30, 30)", "rgb(30, 160, 60)"]}, marks: [${bars}]})`,
			`Plot.plot({color: {scheme: "Set2"}, marks: [${bars}]})`,
			`Plot.plot({width: 300, marks: [${bars}]})`,
			`Plot.plot({marginLeft: 30, marks: [Plot.frame(), Plot.barY([{d: "Mon", n: 140000}], {x: "d", y: "n"})]})`,
			`Plot.plot({margin: 24, marks: [Plot.frame(), Plot.barY([{d: "Mon", n: 140000}], {x: "d", y: "n"})]})`,
			`Plot.plot({marks: [Plot.frame(), Plot.barY([{d: "Mon", n: 140000}], {x: "d", y: "n"})]})`,
		),
	);
	const charts = page.locator('.cell-output svg[class^="plot-"]');
	await expect(charts).toHaveCount(6, { timeout: 20_000 });
	const tokens = await chartTokens(page);
	// Plot pairs the range with its sorted series, shop then web: the cell's colours land where it put them.
	expect(await barFills(page, 0)).toEqual(["rgb(30, 160, 60)", "rgb(200, 30, 30)", "rgb(30, 160, 60)"]);
	const scheme = await barFills(page, 1);
	expect(scheme).toHaveLength(3);
	expect(scheme).not.toContain(tokens.first);
	expect(scheme).not.toContain(tokens.second);
	// The box it is drawn in, not the option: a rule that stretched every chart to the column would pass on the attribute.
	expect(Math.round((await charts.nth(2).boundingBox())!.width)).toBe(300);
	const frameLeft = (nth: number) => charts.nth(nth).locator('g[aria-label="frame"] rect, rect[aria-label="frame"]').first().getAttribute("x");
	expect(await frameLeft(3)).toBe("30");
	expect(await frameLeft(4)).toBe("24");
	// Left to the defaults, the same chart gets the room "140,000" needs, past Plot's 40 px.
	expect(Number(await frameLeft(5))).toBeGreaterThan(40);
});

const VIEW_TABLE = [
	"<!-- you -->\n\ncompare them\n\n",
	"<!-- pi:view table #t1 -->\n\n```json\n",
	JSON.stringify({
		columns: ["Vendor", "Retention", "Notes"],
		rows: [["Sentry", 90, "Self-hosting available; SSO on every plan; the longest retention of the four options compared here"]],
	}),
	"\n```\n\n<!-- you -->\n\n",
].join("");

test("a view table reads in the app's sans with even digits, and wraps long text instead of running off the column", async ({ page }) => {
	await openApp(page, VIEW_TABLE);
	await expect(page.locator(".doc-view-table td").first()).toHaveText("Sentry");
	const seen = await page.evaluate(() => {
		const table = document.querySelector(".doc-view-table") as HTMLElement;
		const probe = document.createElement("div");
		probe.style.fontFamily = "var(--font-sans)";
		document.body.append(probe);
		const sans = getComputedStyle(probe).fontFamily;
		probe.remove();
		const td = getComputedStyle(table.querySelector("td")!);
		return { sans, font: td.fontFamily, digits: td.fontVariantNumeric, scroll: table.scrollWidth, client: table.clientWidth };
	});
	expect(seen.font).toBe(seen.sans);
	expect(seen.digits).toBe("tabular-nums");
	expect(seen.scroll).toBeLessThanOrEqual(seen.client);
});

// ── What a prompt carries ───────────────────────────────────────────────────
// `[cell values]` and `[artifact]` lines in front of the prompt's text
// (`document-format.md` §Snippets): written into the prompt on the page and
// sent to pi with it, so the two hold the same text.

const SPIRAL = [
	"<!-- you -->\n\nDraw a spiral.\n\n",
	"<!-- pi -->\n\nA spiral.\n\n",
	"<!-- pi:artifact @spiral -->\n\n",
	`<!-- pi:cell js #tu -->\n\n\`\`\`js\n${SLIDER(20)}\n\`\`\`\n\n`,
	"<!-- pi:cell js #out -->\n\n```js\nhtl.html`<p class=\"turns\">turns ${turns}</p>`\n```\n\n",
	"<!-- you -->\n\n",
].join("");

const docText = (page: import("@playwright/test").Page) =>
	page.evaluate(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());

test("a prompt under an artifact tells pi what the user set and which artifact it is about", async ({ page }) => {
	await openApp(page, SPIRAL, piHolding(transcriptOf(["Draw a spiral.", "A spiral."]), { cell_state_read: { state: null } }));
	await expect(page.locator("p.turns")).toHaveText("turns 6", { timeout: 10_000 });
	await page.locator('input[type="range"]').fill("15");
	await expect(page.locator("p.turns")).toHaveText("turns 15");
	await sendAtTail(page, "Make it red.");
	const carried = '[cell values] {"turns":15}\n\n[artifact] spiral — edit by id\n\nMake it red.';
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual([carried]);
	expect(await docText(page)).toContain(`<!-- you -->\n\n${carried}`);
});

test("a prompt run mid-page carries its lines itself, and the draft below keeps none", async ({ page }) => {
	const doc = SPIRAL.replace(/<!-- you -->\n\n$/, "<!-- you -->\n\nMake it red.\n\n<!-- pi -->\n\nRed.\n\n<!-- you -->\n\nlater draft\n");
	await openApp(page, doc, piHolding(transcriptOf(["Draw a spiral.", "A spiral."]), { cell_state_read: { state: null } }));
	await expect(page.locator("p.turns")).toHaveText("turns 6", { timeout: 10_000 });
	await page.locator(".cm-line", { hasText: "Make it red." }).click();
	await page.keyboard.press("End");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(['[cell values] {"turns":6}\n\n[artifact] spiral — edit by id\n\nMake it red.']);
	const text = await docText(page);
	expect(text).toContain('<!-- you -->\n\n[cell values] {"turns":6}\n\n[artifact] spiral — edit by id\n\nMake it red.');
	expect(text).toMatch(/<!-- you -->\n\nlater draft\n?$/);
});

test("a rebuilt history carries the widget state the page holds, and no stale one", async ({ page }) => {
	const stale = { type: "custom", customType: "pi-ui-cell-state", id: "old", parentId: "t1", data: { store: { n: 1 } } };
	const held = transcriptOf(["What is 2+2?", "Four."]);
	held.data.entries.push(stale);
	await openApp(page, ASKED.replace("Four.", "Five."), {
		...piHolding(held),
		cell_state_read: { state: { v: 2, views: {}, store: { n: 5 } } },
	});
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	const states = (rebuild!.entries as Array<{ customType?: string; data?: unknown }>).filter((e) => e.customType === "pi-ui-cell-state");
	expect(states).toEqual([expect.objectContaining({ data: { v: 2, views: {}, store: { n: 5 } } })]);
});

// ── State an earlier Piary saved, on the app's first open ───────────────────
// A document with cells and no record yet: pi's transcript is asked once for
// the widget state an earlier Piary appended there, and the answer is recorded.

/** pi's `get_entries` answer holding one widget-state entry. */
const transcriptWithState = (data: unknown) => ({
	success: true,
	data: { entries: [{ type: "custom", customType: "pi-ui-cell-state", id: "s1", parentId: null, data }], leafId: "s1" },
});

test("state an earlier Piary saved shows on the document's first open, and is recorded", async ({ page }) => {
	const saved = { v: 2, views: {}, store: { n: 4 } };
	await openApp(page, STATEFUL, { cell_state_read: null, "pi_send:get_entries": transcriptWithState(saved) });
	await expect(page.locator("button.bump")).toHaveText("n is 4", { timeout: 10_000 });
	await expect.poll(() => stateWrites(page)).toContainEqual(saved);
});

test("a document already recorded does not ask pi on open", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: { state: null } });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	expect((await ipcCalls(page)).some((call) => call.cmd === "pi_start")).toBe(false);
});

test("a document with no cells never starts pi to look for their state", async ({ page, context }) => {
	// The control, opened at the same moment: a document WITH cells and no
	// record does start pi to look. Once it has, this page has had as long.
	const control = await context.newPage();
	await Promise.all([openApp(control, STATEFUL, { cell_state_read: null }), openApp(page, ASKED, { cell_state_read: null })]);
	await expect.poll(async () => (await ipcCalls(control)).some((call) => call.cmd === "pi_start"), { timeout: 10_000 }).toBe(true);
	await control.close();
	expect((await ipcCalls(page)).some((call) => call.cmd === "pi_start")).toBe(false);
});

test("a transcript with no widget state is recorded as checked", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: null, "pi_send:get_entries": { success: true, data: { entries: [], leafId: null } } });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	await expect.poll(() => stateWrites(page)).toContainEqual(null);
});

test("a pi that cannot start opens the page with no state and records nothing", async ({ page }) => {
	await openApp(page, STATEFUL, { cell_state_read: null, pi_start: { reject: "pi is not installed" } });
	await expect(page.locator("button.bump")).toHaveText("n is 1", { timeout: 10_000 });
	await afterFrames(page);
	// The canvas still saves its own state once the cells settle; what must not
	// be written is the "checked, nothing there" record, so the next open asks
	// again.
	expect(await stateWrites(page)).not.toContainEqual(null);
});

// ---- attachments: a dropped or pasted file is stored and lands in the document

const TWO_ASKED = "<!-- you -->\n\nWhat is 2+2?\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\nAnd 3+3?\n\n";
const STORED = { id: "ab12cd34", mime: "image/png", url: "/attachments/my-shot-ab12cd34.png", name: "my-shot.png", size: 5 };
const SEGMENT = "<!-- pi:file image/png #ab12cd34 -->\n\n![my-shot.png](/attachments/my-shot-ab12cd34.png)";

/** The canvas's whole text, as the page holds it. */
function documentText(page: import("@playwright/test").Page): Promise<string> {
	return page.evaluate(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());
}

/** Drops a file of `size` bytes named `name` on the line holding `onText`.
 *  Built in the page: a File does not survive the Playwright boundary. */
async function dropFile(page: import("@playwright/test").Page, onText: string, name: string, size = 5) {
	const box = (await page.locator(".cm-line", { hasText: onText }).boundingBox())!;
	await page.evaluate(
		({ name, size, x, y }) => {
			const data = new DataTransfer();
			data.items.add(new File([new Uint8Array(size)], name, { type: "image/png" }));
			document
				.querySelector(".cm-content")!
				.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true, clientX: x, clientY: y }));
		},
		{ name, size, x: box.x + 4, y: box.y + box.height / 2 },
	);
}

test("a dropped image is stored and lands in front of the prompt it was dropped on", async ({ page }) => {
	await openApp(page, TWO_ASKED, { attachments_store: STORED });
	await dropFile(page, "What is 2+2?", "my shot.png");
	await expect.poll(() => documentText(page)).toContain(`${SEGMENT}\n\n<!-- you -->\n\nWhat is 2+2?`);
	const stores = (await ipcCalls(page)).filter((call) => call.cmd === "attachments_store");
	expect(stores).toEqual([{ cmd: "attachments_store", args: { byteLength: 5 }, headers: { "x-filename": "my%20shot.png" } }]);
});

test("a pasted file is stored and lands at the caret's prompt", async ({ page }) => {
	await openApp(page, TWO_ASKED, { attachments_store: STORED });
	await page.locator(".cm-line", { hasText: "And 3+3?" }).click();
	await page.evaluate(() => {
		const data = new DataTransfer();
		data.items.add(new File([new Uint8Array(5)], "my shot.png", { type: "image/png" }));
		document
			.querySelector(".cm-content")!
			.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
	});
	await expect.poll(() => documentText(page)).toContain(`${SEGMENT}\n\n<!-- you -->\n\nAnd 3+3?`);
	expect(await documentText(page)).toContain("Four.\n\n<!-- pi:file");
});

test("a file over 10 MB is refused, saying so, and nothing is stored", async ({ page }) => {
	await openApp(page, TWO_ASKED, { attachments_store: STORED });
	await dropFile(page, "What is 2+2?", "huge.png", 10 * 1024 * 1024 + 1);
	await expect(page.locator("#status")).toContainText("huge.png is larger than 10 MB.");
	expect((await ipcCalls(page)).some((call) => call.cmd === "attachments_store")).toBe(false);
	expect(await documentText(page)).toBe(TWO_ASKED);
});

test("a refused store says why and leaves the document alone", async ({ page }) => {
	await openApp(page, TWO_ASKED, { attachments_store: { reject: "the disk is full" } });
	await dropFile(page, "What is 2+2?", "my shot.png");
	await expect(page.locator("#status")).toContainText("Could not attach my shot.png: the disk is full");
	expect(await documentText(page)).toBe(TWO_ASKED);
});

test("an attachment's image is drawn from the app's own scheme", async ({ page }) => {
	await openApp(page, `${SEGMENT}\n\n${TWO_ASKED}`);
	await expect(page.locator("img.doc-md-img")).toHaveAttribute("src", "piary-file://localhost/my-shot-ab12cd34.png");
});

// ---- attachments: what pi is sent, and what a rebuilt history keeps

const PDF_SEGMENT = "<!-- pi:file application/pdf #cc11dd22 -->\n\n[paper.pdf](/attachments/paper-cc11dd22.pdf)";
const PDF_PATH = "/store/attachments/paper-cc11dd22.pdf";
const PDF_NOTE = `[attached: paper.pdf (application/pdf) at ${PDF_PATH}]`;

/** The prompt commands pi was sent, whole. */
async function promptCommands(page: import("@playwright/test").Page) {
	return (await ipcCalls(page)).flatMap((call) => {
		const command = (call.args as { command?: { type?: string; message?: string; images?: { type: string; data: string; mimeType: string }[] } }).command;
		return call.cmd === "pi_send" && command?.type === "prompt" ? [{ ...command, message: asWritten(command.message) }] : [];
	});
}

/** A transcript whose first user message carries `images` image parts after its text. */
function withImages(transcript: ReturnType<typeof transcriptOf>, images: number) {
	const first = (transcript.data.entries[0] as { message: { content: unknown[] } }).message;
	for (let i = 0; i < images; i++) first.content.push({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" });
	return transcript;
}

/** The user entries a rebuild wrote, by their content. */
function rebuiltUserContent(rebuild: { entries: unknown[] }) {
	return rebuild.entries.flatMap((entry) => {
		const message = (entry as { type?: string; message?: { role?: string; content?: { type: string; text?: string; data?: string; mimeType?: string }[] } }).message;
		return (entry as { type?: string }).type === "message" && message?.role === "user" ? [message.content ?? []] : [];
	});
}

test("an image staged on the tail mid-turn rides on the steer", async ({ page }) => {
	await openApp(page, ASKED, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		attachments_store: STORED,
		attachments_read: { png: [4, 4] },
		"pi_send:steer": { success: true },
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	await piEvents(page, "scratch", [{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Six, beca" }] } }]);
	await expect(page.locator(".cm-content").first()).toContainText("Six, beca");
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("What is in this?");
	await dropFile(page, "What is in this?", "my shot.png");
	await expect.poll(() => documentText(page)).toContain(`${SEGMENT}\n\n<!-- you -->\n\nWhat is in this?`);
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.press("ControlOrMeta+Enter");
	const steers = async () =>
		(await ipcCalls(page)).flatMap((call) => {
			const command = (call.args as { command?: { type?: string; message?: string; images?: { mimeType: string }[] } }).command;
			return call.cmd === "pi_send" && command?.type === "steer" ? [command] : [];
		});
	await expect.poll(async () => (await steers()).length).toBe(1);
	const [steer] = await steers();
	expect(steer!.message).toMatch(/^What is in this\?\n\[now: /);
	expect(steer!.images?.map((image) => image.mimeType)).toEqual(["image/png"]);
	expect((await promptCommands(page))[0]!, "the first prompt went without it").not.toHaveProperty("images");
});

test("an image above the prompt is sent as vision content", async ({ page }) => {
	await openApp(page, `${ASKED.slice(0, -"<!-- you -->\n\n".length)}${SEGMENT}\n\n<!-- you -->\n\n`, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		attachments_read: { png: [4, 4] },
	});
	await sendAtTail(page, "What is in this?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [prompt] = await promptCommands(page);
	expect(prompt!.message).toBe("What is in this?");
	expect(prompt!.images?.map((image) => image.mimeType)).toEqual(["image/png"]);
	expect(prompt!.images![0]!.data.length).toBeGreaterThan(0);
	expect(await rebuildsAsked(page), "an attachment on the prompt being sent is not history").toEqual([]);
});

test("a PDF above the prompt is named to the agent, not sent as an image", async ({ page }) => {
	await openApp(page, `${ASKED.slice(0, -"<!-- you -->\n\n".length)}${PDF_SEGMENT}\n\n<!-- you -->\n\n`, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		attachments_path: PDF_PATH,
	});
	await sendAtTail(page, "Summarize it.");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [prompt] = await promptCommands(page);
	expect(prompt!.message).toBe(`Summarize it.\n${PDF_NOTE}`);
	expect(prompt!).not.toHaveProperty("images");
	const asked = (await ipcCalls(page)).filter((call) => call.cmd === "attachments_path");
	expect(asked.map((call) => call.args)).toEqual([{ name: "paper-cc11dd22.pdf" }]);
});

test("an unedited document with a PDF above an earlier prompt does not rebuild", async ({ page }) => {
	// The transcript holds the line the send wrote; the document side of the
	// compare writes the same line, so nothing reads as an edit.
	await openApp(page, `${PDF_SEGMENT}\n\n${ASKED}`, {
		...piHolding(transcriptOf([`What is 2+2?\n${PDF_NOTE}`, "Four."])),
		attachments_path: PDF_PATH,
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	expect(await rebuildsAsked(page)).toEqual([]);
});

test("an unreadable attachment does not stop the send", async ({ page }) => {
	await openApp(page, `${ASKED.slice(0, -"<!-- you -->\n\n".length)}${SEGMENT}\n\n<!-- you -->\n\n`, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		attachments_read: { reject: "no attachment my-shot-ab12cd34.png" },
	});
	await sendAtTail(page, "What is in this?");
	await expect.poll(async () => (await promptCommands(page)).map((prompt) => prompt.message)).toEqual(["What is in this?"]);
	expect((await promptCommands(page))[0]!).not.toHaveProperty("images");
});

test("a rebuilt history keeps the image under its prompt", async ({ page }) => {
	await openApp(page, `${SEGMENT}\n\n${ASKED.replace("Four.", "Five.")}`, {
		...piHolding(withImages(transcriptOf(["What is 2+2?", "Four."]), 1)),
		attachments_read: { png: [4, 4] },
	});
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	expect(rebuild, "the edited answer rebuilt the history").toBeTruthy();
	const [content] = rebuiltUserContent(rebuild!);
	expect(content!.map((part) => part.type)).toEqual(["text", "image"]);
	expect(content![0]!.text).toBe("What is 2+2?");
	expect(content![1]!.mimeType).toBe("image/png");
});

test("an image larger than pi's edge is scaled down before a rebuild writes it", async ({ page }) => {
	await openApp(page, `${SEGMENT}\n\n${ASKED.replace("Four.", "Five.")}`, {
		...piHolding(withImages(transcriptOf(["What is 2+2?", "Four."]), 1)),
		attachments_read: { png: [3000, 1000] },
	});
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	const image = rebuiltUserContent(rebuild!)[0]!.find((part) => part.type === "image")!;
	const size = await page.evaluate(async ({ data, mimeType }) => {
		const bitmap = await createImageBitmap(await (await fetch(`data:${mimeType};base64,${data}`)).blob());
		return [bitmap.width, bitmap.height];
	}, image as { data: string; mimeType: string });
	expect(size).toEqual([2000, 667]);
});

test("removing an image above a prompt rebuilds the history", async ({ page }) => {
	// pi's transcript still carries the image the document no longer shows.
	await openApp(page, ASKED, piHolding(withImages(transcriptOf(["What is 2+2?", "Four."]), 1)));
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	expect(rebuild, "the transcript's image is gone from the history").toBeTruthy();
	expect(rebuiltUserContent(rebuild!)[0]!.map((part) => part.type)).toEqual(["text"]);
});

// ---- attachments: the compare reads image bytes, and the model is asked

/** The base64 a PNG of `width`×`height` encodes to, drawn exactly as the stub's
 *  `{ png }` answer draws it — so a transcript can hold the bytes the page will
 *  read back. */
async function pngData(page: import("@playwright/test").Page, width: number, height: number): Promise<string> {
	return page.evaluate(
		async ([w, h]) => {
			const canvas = new OffscreenCanvas(w!, h!);
			const context = canvas.getContext("2d")!;
			context.fillStyle = "#c33";
			context.fillRect(0, 0, w!, h!);
			const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
			return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
		},
		[width, height],
	);
}

/** A transcript whose first user message carries exactly `images`. */
function holdingImages(transcript: ReturnType<typeof transcriptOf>, images: { data: string; mimeType: string }[]) {
	const first = (transcript.data.entries[0] as { message: { content: unknown[] } }).message;
	first.content.push(...images.map((image) => ({ type: "image", ...image })));
	return transcript;
}

test("an unedited document whose image pi already holds does not rebuild", async ({ page }) => {
	const data = await pngData(page, 4, 4);
	await openApp(page, `${SEGMENT}\n\n${ASKED}`, {
		...piHolding(holdingImages(transcriptOf(["What is 2+2?", "Four."]), [{ data, mimeType: "image/png" }])),
		attachments_read: { png: [4, 4] },
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	expect(await rebuildsAsked(page)).toEqual([]);
});

test("swapping an image for another rebuilds, though the count is the same", async ({ page }) => {
	const other = await pngData(page, 5, 5);
	await openApp(page, `${SEGMENT}\n\n${ASKED}`, {
		...piHolding(holdingImages(transcriptOf(["What is 2+2?", "Four."]), [{ data: other, mimeType: "image/png" }])),
		attachments_read: { png: [4, 4] },
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const [rebuild] = await rebuildsAsked(page);
	expect(rebuild, "the transcript's image is not the document's").toBeTruthy();
	const image = rebuiltUserContent(rebuild!)[0]!.find((part) => part.type === "image")!;
	expect(image.data).toBe(await pngData(page, 4, 4));
});

test("an image the store can no longer read does not rebuild every send", async ({ page }) => {
	// A rebuild skips it, so the transcript holds no image; the document side
	// skips it the same way, and the two agree.
	await openApp(page, `${SEGMENT}\n\n${ASKED}`, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		attachments_read: { reject: "no attachment my-shot-ab12cd34.png" },
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	expect(await rebuildsAsked(page)).toEqual([]);
});

test("an image dropped for a model with no vision is said, before the send", async ({ page }) => {
	await openApp(page, TWO_ASKED, {
		attachments_store: STORED,
		"pi_send:get_state": { success: true, data: { model: { id: "text-1", name: "Text One", input: ["text"] } } },
	});
	await dropFile(page, "What is 2+2?", "my shot.png");
	await expect(page.locator("#status")).toContainText("Text One has no vision — the image will be ignored.");
	expect(await documentText(page), "the image is still attached").toContain(SEGMENT);
});

test("an image dropped for a model that sees is not warned about", async ({ page }) => {
	await openApp(page, TWO_ASKED, {
		attachments_store: STORED,
		"pi_send:get_state": { success: true, data: { model: { id: "vision-1", name: "Vision One", input: ["text", "image"] } } },
	});
	await dropFile(page, "What is 2+2?", "my shot.png");
	await expect.poll(() => documentText(page)).toContain(SEGMENT);
	await expect.poll(async () => (await ipcCalls(page)).some((call) => (call.args as { command?: { type?: string } })?.command?.type === "get_state")).toBe(true);
	await expect(page.locator("#status")).toHaveText("");
});

test("an image is sent within the limits the model declares", async ({ page }) => {
	// pi applies a model's own resize limits to a prompt's images; the page
	// brings them within the same, so pi passes them through unchanged.
	await openApp(page, `${ASKED.slice(0, -"<!-- you -->\n\n".length)}${SEGMENT}\n\n<!-- you -->\n\n`, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		"pi_send:get_state": {
			success: true,
			data: { sessionFile: SESSION_FILE, model: { id: "small-1", input: ["text", "image"], inputLimits: { images: { resize: { maxWidth: 500, maxHeight: 500 } } } } },
		},
		attachments_read: { png: [1000, 400] },
	});
	await sendAtTail(page, "What is in this?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const image = (await promptCommands(page))[0]!.images![0]!;
	const size = await page.evaluate(async ({ data, mimeType }) => {
		const bitmap = await createImageBitmap(await (await fetch(`data:${mimeType};base64,${data}`)).blob());
		return [bitmap.width, bitmap.height];
	}, image);
	expect(size).toEqual([500, 200]);
});

// ---- terminals: a shell of the user's own, in the document (ADR 0013)

/** The id of the one terminal panel the document holds, read off its marker. */
async function terminalId(page: import("@playwright/test").Page): Promise<string> {
	const md = await documentText(page);
	const id = /<!-- pi:view terminal #(term-[a-z0-9]+) -->/.exec(md)?.[1];
	expect(id, "a terminal marker in the document").toBeTruthy();
	return id!;
}

/** The terminal grid's text, line by line, read through xterm's buffer after a
 *  flush — never the DOM rows, which Chromium draws to a canvas. */
function terminalLines(page: import("@playwright/test").Page, id: string): Promise<string[]> {
	return page.evaluate(async (id) => {
		const chat = document.querySelector("document-chat") as unknown as {
			liveView(id: string): { terminal: { write(d: string, cb: () => void): void; buffer: { active: { length: number; getLine(i: number): { translateToString(trim: boolean): string } | undefined } } } } | null;
		};
		const view = chat.liveView(id)!;
		await new Promise<void>((resolve) => view.terminal.write("", resolve));
		const buffer = view.terminal.buffer.active;
		return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? "").filter(Boolean);
	}, id);
}

/** Delivers an event the way Rust emits it. */
const emitToPage = (page: import("@playwright/test").Page, event: string, payload: unknown) =>
	page.evaluate(([event, payload]) => (window as unknown as { __emit(e: string, p: unknown): void }).__emit(event as string, payload), [event, payload] as const);

const ptyCalls = async (page: import("@playwright/test").Page, cmd: string) => (await ipcCalls(page)).filter((call) => call.cmd === cmd).map((call) => call.args);

test("/terminal opens a panel at the end of the document and a login shell behind it", async ({ page }) => {
	await openApp(page, ASKED);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("/terminal");
	await page.locator(".cm-tooltip-autocomplete li", { hasText: "/terminal" }).click();
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const md = await documentText(page);
	const id = await terminalId(page);
	expect(md.indexOf("Four.")).toBeLessThan(md.indexOf(`<!-- pi:view terminal #${id} -->`));
	expect(md).not.toContain("/terminal");
	await expect.poll(() => ptyCalls(page, "pty_open")).toEqual([
		{ request: { sid: "scratch", termId: id, command: "", pi: false, args: [], cwd: "", cols: null, rows: null } },
	]);
});

test("New Terminal in the menu opens one too, and no other item does", async ({ page }) => {
	await openApp(page, ASKED);
	// The control first: another menu item opens nothing.
	await emitToPage(page, "menu", "save");
	await afterFrames(page);
	await expect(page.locator(".doc-terminal")).toHaveCount(0);
	await emitToPage(page, "menu", "new-terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	await expect.poll(async () => (await ptyCalls(page, "pty_open")).length).toBe(1);
});

// ── Show Source from the menu ────────────────────────────────────────────────

const VIEWED = '<!-- you -->\n\nlist them\n\n<!-- pi:view properties #p1 -->\n\n```json\n{\n  "rows": 3\n}\n```\n\n<!-- you -->\n\nnext';

test("Show Source in the menu shows the source of the view the caret is in, and hides it again", async ({ page }) => {
	await openApp(page, VIEWED);
	await expect(page.locator(".doc-view")).toHaveCount(1);
	await page.evaluate((at) => {
		const view = (document.querySelector("document-chat") as unknown as { view: { dispatch(spec: unknown): void } }).view;
		view.dispatch({ selection: { anchor: at } });
	}, VIEWED.indexOf("pi:view properties"));
	await emitToPage(page, "menu", "toggle-source");
	await expect(page.locator(".doc-view")).toHaveCount(0);
	await expect(page.locator(".cm-line", { hasText: '"rows": 3' })).toHaveCount(1);
	await emitToPage(page, "menu", "toggle-source");
	await expect(page.locator(".doc-view")).toHaveCount(1);
	await expect(page.locator("#status")).toHaveText("");
});

test("Show Source in the menu with the caret in prose says what it works on", async ({ page }) => {
	await openApp(page, VIEWED);
	await page.locator(".cm-line", { hasText: "list them" }).click();
	await emitToPage(page, "menu", "toggle-source");
	await expect(page.locator("#status")).toContainText("Show Source works on a view or an artifact");
	await expect(page.locator(".doc-view")).toHaveCount(1);
});

// ── New Document and Open… from the menu ────────────────────────────────────

const openedDocs = async (page: import("@playwright/test").Page) =>
	(await ipcCalls(page)).filter((call) => call.cmd === "open_document").map((call) => (call.args as { docId: string }).docId);

test("New Document in the menu opens a fresh document in a window of its own", async ({ page }) => {
	await openApp(page, ASKED);
	await emitToPage(page, "menu", "new-document");
	await expect.poll(() => openedDocs(page)).toHaveLength(1);
	const [id] = await openedDocs(page);
	// A window label cannot hold a dot (ADR 0027), and the id must be new.
	expect(id).toMatch(/^web-[0-9a-f]{8}$/);
	await emitToPage(page, "menu", "new-document");
	await expect.poll(async () => new Set(await openedDocs(page)).size).toBe(2);
});

test("Help → Welcome opens a fresh tour in a new conversation, and the stored welcome is left alone", async ({ page }) => {
	const mine = "# My own welcome\n\n<!-- you -->\n\n";
	await openAppAt(page, "/", { "docs_read@welcome": mine });
	await expect(page.locator(".cm-editor")).toContainText("My own welcome");
	await emitToPage(page, "menu", "welcome");
	await expect.poll(() => openedDocs(page)).toHaveLength(1);
	const [id] = await openedDocs(page);
	expect(id).toMatch(/^web-[0-9a-f]{8}$/);
	const writes = (await ipcCalls(page)).filter((call) => call.cmd === "docs_write").map((call) => call.args as { id: string; content: string });
	const fresh = writes.find((write) => write.id === id);
	expect(fresh?.content, "the new conversation holds the tour, bound to its own session").toContain(`session: ${id}`);
	expect(fresh?.content).toContain("<!-- pi:note -->");
	// Written before the window that shows it is asked for, so it opens on the tour.
	const calls = await ipcCalls(page);
	const wrote = calls.findIndex((call) => call.cmd === "docs_write" && (call.args as { id: string }).id === id);
	expect(wrote).toBeGreaterThanOrEqual(0);
	expect(wrote).toBeLessThan(calls.findIndex((call) => call.cmd === "open_document"));
	expect(writes.filter((write) => write.id === "welcome" && write.content !== mine), "the stored welcome is never overwritten").toEqual([]);
});

test("the window Help → Welcome opens walks its untouched tour, with no splash, and a touched one not at all", async ({ page }) => {
	const id = "web-0000beef";
	await openAppAt(page, `/?id=${id}`, { [`docs_read@${id}`]: rebindDocument(TOUR, id), cell_state_read: { state: null } });
	await expect(page.getByRole("dialog", { name: "Piary tour" })).toContainText("Drag the slider");
	await expect(page.getByRole("dialog", { name: "Welcome to Piary" })).toHaveCount(0);
});

test("a tour copy someone has edited opens as a document, not a walk", async ({ page }) => {
	const id = "web-0000beef";
	await openAppAt(page, `/?id=${id}`, { [`docs_read@${id}`]: rebindDocument(TOUR, id).replace("three names", "six names"), cell_state_read: { state: null } });
	await expect(page.locator(".cm-editor")).toContainText("six names");
	await afterFrames(page);
	await expect(page.getByRole("dialog", { name: "Piary tour" })).toHaveCount(0);
});

test("Open… in the menu lists the documents by heading, and opens the one chosen", async ({ page }) => {
	await openAppAt(page, "/?id=notes", {
		docs_list: ["notes", "plan", "untitled"],
		"docs_read@notes": "# My notes\n\n<!-- you -->\n\n",
		"docs_read@plan": "---\npi: v1\n---\n\n# The plan\n\nSteps.\n",
		"docs_read@untitled": "<!-- you -->\n\nno heading here\n",
	});
	await emitToPage(page, "menu", "open-document");
	await expect(menuRows(page)).toHaveText(["My notes ·", "The plan", "untitled"]);
	// This window's own document is marked, and is not a choice.
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "My notes ·" })).toBeDisabled();
	await page.locator(".doc-block-menu").getByRole("button", { name: "The plan" }).click();
	await expect.poll(() => openedDocs(page)).toEqual(["plan"]);
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
});

test("Open… with a store that cannot list says so, rather than showing an empty workspace", async ({ page }) => {
	await openApp(page, ASKED, { docs_list: { reject: "the disk is gone" } });
	await emitToPage(page, "menu", "open-document");
	await expect(page.locator("#status")).toContainText("the disk is gone");
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
});

test("Open… closed with Escape opens nothing, and an empty workspace says so", async ({ page }) => {
	await openApp(page, ASKED, { docs_list: [] });
	await emitToPage(page, "menu", "open-document");
	await expect(menuRows(page)).toHaveText(["No documents yet"]);
	await page.keyboard.press("Escape");
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
	expect(await openedDocs(page)).toEqual([]);
});

// ---- Import… and Export… (ADR 0049). Each is a window of its own; Rust shows
// the panels and does the file work. These hold the pages to what they ask
// for and what they then say.

/** A conversation that references two attachments, one of them twice. */
const WITH_FILES =
	"---\npi: v1\nsession: elsewhere\n---\n\n# The trip\n\n<!-- pi:file image/png #shot-a1.png -->\n\n![shot.png](/attachments/shot-a1.png)\n\n<!-- you -->\n\nsee [the paper](/attachments/paper-b2.pdf) and ![again](/attachments/shot-a1.png)\n";

const argsOf = async <T,>(page: import("@playwright/test").Page, cmd: string) =>
	(await ipcCalls(page)).filter((call) => call.cmd === cmd).map((call) => call.args as T);

const outcome = (page: import("@playwright/test").Page) => page.locator("#outcome");

test("Import… and Export… each open a window of their own, the export on the saved conversation in front @smoke", async ({ page }) => {
	await openAppAt(page, "/?id=notes", { "docs_read@notes": WITH_FILES });
	await expect(page.locator(".cm-editor")).toContainText("the paper");
	await emitToPage(page, "menu", "import");
	await expect.poll(() => argsOf(page, "open_transfer")).toEqual([{ kind: "import" }]);
	await emitToPage(page, "menu", "export");
	await expect.poll(() => argsOf(page, "open_transfer")).toEqual([{ kind: "import" }, { kind: "export", from: "notes" }]);
	// The Export window reads the store, so the window's text is saved first.
	const calls = (await ipcCalls(page)).map((call) => call.cmd);
	expect(calls.indexOf("docs_write")).toBeGreaterThanOrEqual(0);
	expect(calls.indexOf("docs_write")).toBeLessThan(calls.lastIndexOf("open_transfer"));
	// Neither is asked in the document's own window any more.
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
});

test("a window that cannot be opened says why, on the document's status line", async ({ page }) => {
	await openAppAt(page, "/?id=notes", { "docs_read@notes": WITH_FILES, open_transfer: { reject: "Piary is quitting" } });
	await emitToPage(page, "menu", "import");
	await expect(page.locator("#status")).toContainText("Piary is quitting");
});

/** Boots the Export window's page (`app/export.html`). */
const openExport = (page: import("@playwright/test").Page, answers: Answers = {}, from = "?from=notes") =>
	openAppAt(
		page,
		`/export.html${from}`,
		{
			docs_entries: [
				{ id: "notes", modifiedMs: 3 },
				{ id: "plan", modifiedMs: 2 },
				{ id: "untitled", modifiedMs: 1 },
			],
			"docs_read@notes": WITH_FILES,
			"docs_read@plan": "---\npi: v1\n---\n\n# The plan\n\n![map](/attachments/map-c3.png)\n",
			"docs_read@untitled": "<!-- you -->\n\nno heading here\n",
			...answers,
		},
		".transfer-actions",
	);

const conversation = (page: import("@playwright/test").Page, name: string) => page.locator(".transfer-list").getByLabel(name);

test("the Export window asks which conversations, then as what, with the one in front chosen and Markdown first @smoke", async ({ page }) => {
	await openExport(page, { export_conversations: { folder: "Desktop", conversations: [{ id: "notes", name: "notes.md", missing: [], error: null }] } });
	await expect(page.locator(".transfer-group h2")).toHaveText(["Which conversations", "As what"]);
	await expect(page.locator(".transfer-list .transfer-row")).toHaveText(["The tripnotes", "The planplan", "untitleduntitled"]);
	await expect(conversation(page, "The trip")).toBeChecked();
	await expect(conversation(page, "The plan")).not.toBeChecked();
	await expect(page.getByLabel("Markdown (.md)")).toBeChecked();
	await page.getByRole("button", { name: "Export…" }).click();
	await expect(outcome(page)).toHaveText("notes → Desktop/notes.md.");
	// The file alone carries no attachments.
	expect(await argsOf(page, "export_conversations")).toEqual([{ conversations: [{ id: "notes", attachments: [] }], kind: "markdown" }]);
});

test("several conversations leave as zips, each with the attachments its own document references, and each is reported", async ({ page }) => {
	await openExport(page, {
		export_conversations: {
			folder: "out",
			conversations: [
				{ id: "notes", name: "notes.zip", missing: ["paper-b2.pdf"], error: null },
				{ id: "plan", name: "", missing: [], error: "plan.zip is already there, and was left as it is" },
			],
		},
	});
	await conversation(page, "The plan").check();
	await page.getByLabel("Zip, with attachments").check();
	await page.getByRole("button", { name: "Export…" }).click();
	await expect(outcome(page).locator("p")).toHaveText([
		"notes → out/notes.zip, without 1 attachment this workspace does not hold: paper-b2.pdf.",
		"plan was not exported: plan.zip is already there, and was left as it is.",
	]);
	await expect(outcome(page).locator(".transfer-failed")).toHaveCount(1);
	expect(await argsOf(page, "export_conversations")).toEqual([
		{
			conversations: [
				{ id: "notes", attachments: ["shot-a1.png", "paper-b2.pdf"] },
				{ id: "plan", attachments: ["map-c3.png"] },
			],
			kind: "zip",
		},
	]);
});

test("an Export window already open, asked for another conversation, shows that one chosen alone", async ({ page }) => {
	await openExport(page, { export_conversations: { folder: "out", conversations: [{ id: "notes", name: "notes.md", missing: [], error: null }] } });
	await conversation(page, "untitled").check();
	await page.getByRole("button", { name: "Export…" }).click();
	await expect(outcome(page)).toHaveText("notes → out/notes.md.");
	// What Rust sends the window when a row's ⋯, or the menu, asks again. By
	// then the workspace may hold a conversation the window never listed.
	await answerFromNow(page, "docs_entries", [
		{ id: "fresh", modifiedMs: 4 },
		{ id: "notes", modifiedMs: 3 },
		{ id: "plan", modifiedMs: 2 },
		{ id: "untitled", modifiedMs: 1 },
	]);
	await emitToPage(page, "export-from", "plan");
	await expect(conversation(page, "fresh")).not.toBeChecked();
	await expect(conversation(page, "The plan")).toBeChecked();
	await expect(conversation(page, "The trip")).not.toBeChecked();
	await expect(conversation(page, "untitled")).not.toBeChecked();
	await expect(outcome(page), "the last export's lines are not about this choice").toHaveText("");
	await expect(page.getByRole("button", { name: "Export…" })).toBeEnabled();
});

test("with no conversation chosen there is nothing to export, and one opened from no document starts with none", async ({ page }) => {
	await openExport(page, {}, "");
	await expect(conversation(page, "The trip")).not.toBeChecked();
	const go = page.getByRole("button", { name: "Export…" });
	await expect(go).toBeDisabled();
	await conversation(page, "untitled").check();
	await expect(go).toBeEnabled();
	await conversation(page, "untitled").uncheck();
	await expect(go).toBeDisabled();
});

test("an export whose panel is cancelled, or that Rust refuses, is not reported as written", async ({ page }) => {
	await openExport(page, { export_conversations: null });
	const go = page.getByRole("button", { name: "Export…" });
	await go.click();
	await expect(outcome(page)).toHaveText("Nothing was exported.");
	await expect(go, "and it can be asked again").toBeEnabled();
	await answerFromNow(page, "export_conversations", { reject: "the disk is full" });
	await go.click();
	await expect(outcome(page).locator(".transfer-failed")).toHaveText("the disk is full");
});

/** Boots the Import window's page (`app/import.html`), on an import of
 *  `content` picked under `name`. */
const openImport = (page: import("@playwright/test").Page, name: string, content: string, answers: Answers = {}) =>
	openAppAt(
		page,
		"/import.html",
		{
			docs_list: ["notes"],
			import_pick: { token: "import-0", name, content, attachments: ["shot-a1.png"] },
			import_place: { renames: {}, broken: [] },
			...answers,
		},
		".transfer-actions",
	);

const chooseFile = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Choose a Markdown file or a zip…" });

test("the Import window imports a picked conversation under its own name, with its attachments, and opens it @smoke", async ({ page }) => {
	await openImport(page, "trip", WITH_FILES);
	await page.getByRole("button", { name: "Choose a folder…" }).click();
	await expect(outcome(page)).toHaveText("Imported as trip.");
	await expect.poll(() => openedDocs(page)).toEqual(["trip"]);
	expect(await argsOf(page, "import_pick")).toEqual([{ kind: "folder" }]);
	expect(await argsOf(page, "import_place")).toEqual([{ token: "import-0", names: ["shot-a1.png", "paper-b2.pdf"] }]);
	const [written] = await argsOf<{ token: string; id: string; content: string; replace: boolean }>(page, "import_write");
	expect(written).toMatchObject({ token: "import-0", id: "trip", replace: false });
	// Its own pi session, and nothing else of it moved.
	expect(written!.content).toBe(WITH_FILES.replace("session: elsewhere", "session: trip"));
	expect(await argsOf(page, "import_cancel")).toEqual([]);
	// The window is ready for another.
	await expect(chooseFile(page)).toBeEnabled();
});

test("an import under a name already taken asks in the window, and Keep both imports it beside the other", async ({ page }) => {
	await openImport(page, "notes", WITH_FILES, { docs_list: ["notes", "notes-2"] });
	await chooseFile(page).click();
	await expect(page.locator(".transfer-hint")).toHaveText("A conversation called notes is already here.");
	const keep = page.getByLabel("Keep both: import this one as notes-3");
	await expect(keep).toBeChecked();
	expect(await argsOf(page, "import_write"), "nothing is written before the answer").toEqual([]);
	await page.getByRole("button", { name: "Import", exact: true }).click();
	await expect(outcome(page)).toHaveText("Imported as notes-3.");
	await expect.poll(() => openedDocs(page)).toEqual(["notes-3"]);
	const [written] = await argsOf<{ id: string; content: string; replace: boolean }>(page, "import_write");
	expect(written).toMatchObject({ id: "notes-3", replace: false });
	expect(written!.content).toContain("session: notes-3");
});

test("Replace imports over the conversation of that name", async ({ page }) => {
	await openImport(page, "notes", WITH_FILES);
	await chooseFile(page).click();
	await page.getByLabel(/^Replace notes\./).check();
	await page.getByRole("button", { name: "Import", exact: true }).click();
	await expect(outcome(page)).toHaveText("Imported as notes.");
	const [written] = await argsOf<{ id: string; content: string; replace: boolean }>(page, "import_write");
	expect(written).toMatchObject({ id: "notes", replace: true });
	expect(written!.content).toContain("session: notes");
	await expect.poll(() => openedDocs(page)).toEqual(["notes"]);
});

test("the name question cancelled writes nothing, lets the import go, and the window asks again", async ({ page }) => {
	await openImport(page, "notes", WITH_FILES);
	await chooseFile(page).click();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect.poll(() => argsOf(page, "import_cancel")).toEqual([{ token: "import-0" }]);
	await expect(outcome(page)).toHaveText("Nothing was imported.");
	expect(await argsOf(page, "import_place")).toEqual([]);
	expect(await argsOf(page, "import_write")).toEqual([]);
	expect(await openedDocs(page)).toEqual([]);
	await expect(chooseFile(page)).toBeEnabled();
});

test("an import whose panel is cancelled does nothing", async ({ page }) => {
	await openImport(page, "trip", WITH_FILES, { import_pick: null });
	await chooseFile(page).click();
	await expect(outcome(page)).toHaveText("Nothing was imported.");
	expect(await argsOf(page, "import_pick")).toEqual([{ kind: "file" }]);
	expect(await argsOf(page, "import_write")).toEqual([]);
	expect(await argsOf(page, "import_cancel")).toEqual([]);
});

test("a document of a version this build does not know is imported byte for byte, and said to be read-only", async ({ page }) => {
	const newer = WITH_FILES.replace("pi: v1", "pi: v9");
	await openImport(page, "trip", newer);
	await chooseFile(page).click();
	await expect(outcome(page)).toHaveText(/^Imported as trip\. It is read-only: .*v9/);
	const [written] = await argsOf<{ content: string }>(page, "import_write");
	expect(written!.content).toBe(newer);
});

test("an attachment stored under another name is followed by the document's links, and a link with no file is named", async ({ page }) => {
	await openImport(page, "trip", WITH_FILES, { import_place: { renames: { "shot-a1.png": "shot-zz9.png" }, broken: ["paper-b2.pdf"] } });
	await chooseFile(page).click();
	await expect(outcome(page)).toHaveText("Imported as trip. 1 attachment it links to did not come with it: paper-b2.pdf.");
	await expect.poll(() => openedDocs(page), "broken links do not stop the import").toEqual(["trip"]);
	const [written] = await argsOf<{ content: string }>(page, "import_write");
	expect(written!.content).toBe(WITH_FILES.replace("session: elsewhere", "session: trip").replaceAll("shot-a1.png)", "shot-zz9.png)"));
});

test("an import the store refuses says why, and the import is let go", async ({ page }) => {
	await openImport(page, ".hidden", WITH_FILES, { import_write: { reject: "a document id cannot be a dot entry" } });
	await chooseFile(page).click();
	await expect(outcome(page).locator(".transfer-failed")).toHaveText("a document id cannot be a dot entry");
	await expect.poll(() => argsOf(page, "import_cancel")).toEqual([{ token: "import-0" }]);
	expect(await openedDocs(page)).toEqual([]);
});

test("a picked file that is no bundle says why, and nothing is held", async ({ page }) => {
	await openImport(page, "trip", WITH_FILES, { import_pick: { reject: "the archive holds a symbolic link, which no bundle does" } });
	await chooseFile(page).click();
	await expect(outcome(page).locator(".transfer-failed")).toHaveText("the archive holds a symbolic link, which no bundle does");
	expect(await argsOf(page, "import_cancel")).toEqual([]);
	await expect(chooseFile(page)).toBeEnabled();
});

test("the Import and Export windows answer the menu's window verbs, and nothing that needs a document", async ({ page }) => {
	await openImport(page, "trip", WITH_FILES);
	await emitToPage(page, "menu", "export");
	await expect.poll(() => argsOf(page, "open_transfer")).toEqual([{ kind: "export" }]);
	await emitToPage(page, "menu", "new-document");
	await expect.poll(() => openedDocs(page)).toHaveLength(1);
	await emitToPage(page, "menu", "send");
	await emitToPage(page, "menu", "save");
	await afterFrames(page);
	expect((await ipcCalls(page)).map((call) => call.cmd)).not.toContain("docs_write");
});

test("the shell's output appears in the panel, and its exit settles it", async ({ page }) => {
	await openApp(page, ASKED);
	await emitToPage(page, "menu", "new-terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const id = await terminalId(page);
	await emitToPage(page, "pty-data", [id, "hello\r\n"]);
	await expect.poll(() => terminalLines(page, id)).toEqual(["hello"]);
	await emitToPage(page, "pty-exit", [id, 0]);
	await expect(page.locator(".doc-terminal-settled")).toHaveCount(1);
});

test("a keystroke in the panel reaches the shell", async ({ page }) => {
	await openApp(page, ASKED);
	await emitToPage(page, "menu", "new-terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const id = await terminalId(page);
	await page.locator(".doc-terminal .xterm-helper-textarea").focus();
	await page.keyboard.type("ls");
	await expect
		.poll(async () => (await ptyCalls(page, "pty_write")).map((args) => (args as { data: string }).data).join(""))
		.toBe("ls");
	expect((await ptyCalls(page, "pty_write"))[0]).toMatchObject({ sid: "scratch", termId: id });
});

test("deleting the panel ends the shell", async ({ page }) => {
	await openApp(page, ASKED);
	await emitToPage(page, "menu", "new-terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const id = await terminalId(page);
	// The panel's segment taken out of the text in one edit, as a selection
	// and a Backspace would: the marker leaving is what the page answers.
	await page.evaluate((id) => {
		const view = (document.querySelector("document-chat") as unknown as { view: { state: { doc: { toString(): string } }; dispatch(spec: unknown): void } }).view;
		const md = view.state.doc.toString();
		const from = md.indexOf(`<!-- pi:view terminal #${id} -->`);
		// The whole segment: up to the prompt slot the panel left under it.
		const next = md.indexOf("<!-- you -->", from);
		view.dispatch({ changes: { from, to: next < 0 ? md.length : next }, userEvent: "delete" });
	}, id);
	await expect(page.locator(".doc-terminal")).toHaveCount(0);
	await expect.poll(() => ptyCalls(page, "pty_close")).toEqual([{ sid: "scratch", termId: id }]);
});

test("a terminal that cannot start says so in its own panel", async ({ page }) => {
	await openApp(page, ASKED, { pty_open: { reject: "no pty here" } });
	await emitToPage(page, "menu", "new-terminal");
	await expect(page.locator(".doc-terminal")).toHaveCount(1);
	const id = await terminalId(page);
	await expect.poll(async () => (await terminalLines(page, id)).join("\n")).toContain("[terminal unavailable: no pty here]");
	await expect(page.locator("#status")).toHaveText("");
});

test("a document reopened with a terminal in it starts no shell", async ({ page }) => {
	// ADR 0013: a reload shows the panel's place, never a replayed process.
	await openApp(page, `${ASKED.slice(0, -"<!-- you -->\n\n".length)}<!-- pi:view terminal #term-old -->\n\n\`\`\`json\n\`\`\`\n\n<!-- you -->\n\n`);
	// The control: a terminal opened now IS started, and seen. Every call the
	// page made before that one is in the record by the time it shows.
	await emitToPage(page, "menu", "new-terminal");
	await expect.poll(async () => (await ptyCalls(page, "pty_open")).length).toBe(1);
	const opened = (await ptyCalls(page, "pty_open")) as { request: { termId?: string } }[];
	expect(JSON.stringify(opened)).not.toContain("term-old");
	expect(await ptyCalls(page, "pty_close")).toEqual([]);
});

test("output for a terminal the page does not show is dropped", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await openApp(page, ASKED);
	await emitToPage(page, "pty-data", ["term-nope", "x"]);
	await emitToPage(page, "pty-exit", ["term-nope", 0]);
	await afterFrames(page);
	await expect(page.locator(".doc-terminal")).toHaveCount(0);
	expect(errors).toEqual([]);
});

// ---- a conversation's extensions

const EXTENSION_ROWS = [
	{ source: "npm:other", name: "other", scope: "global", enabled: true, pinnedOff: false, files: 1, own: false },
	{ source: "npm:@x/pi-ui-views", name: "pi-ui-views", scope: "global", enabled: true, pinnedOff: false, files: 3, own: true },
];
const menuButton = (page: import("@playwright/test").Page, name: RegExp | string) => page.locator(".doc-block-menu").getByRole("button", { name });

test("the model menu lists a conversation's extensions, and Piary's own cannot be turned off", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, extensions_list: EXTENSION_ROWS });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await menuButton(page, "Extensions…").click();
	await expect(menuButton(page, "✓ other")).toBeEnabled();
	await expect(menuButton(page, "✓ pi-ui-views")).toBeDisabled();
});

test("turning an extension off stops pi first, and says when it takes effect", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, extensions_list: EXTENSION_ROWS, extensions_set: EXTENSION_ROWS, pi_stop: { emit: ["pi-exited", ["scratch", 0]], value: 0 } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await menuButton(page, "Extensions…").click();
	await menuButton(page, "✓ other").click();
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "extensions_set").map((call) => call.args)).toEqual([
		{ id: "scratch", source: "npm:other", enabled: false },
	]);
	const order = (await ipcCalls(page)).map((call) => call.cmd);
	expect(order.indexOf("pi_stop")).toBeGreaterThanOrEqual(0);
	expect(order.indexOf("pi_stop")).toBeLessThan(order.indexOf("extensions_set"));
	await expect(page.locator("#status")).toContainText("from the next send");
});

// ---- sign-in: a panel over pi's own login (ADR 0034)

/** pi's answer to a prompt it cannot run for want of any provider. */
const NO_KEY = { success: false, error: "No API key found for openai." };
const NO_MODELS = { success: true, data: { models: [] } };

/** The answers a refused send needs: pi holding the document's history, the
 *  prompt refused, and the models pi lists. */
const refusedWith = (models: unknown): Answers =>
	piHolding(transcriptOf(["What is 2+2?", "Four."]), { "pi_send:prompt": NO_KEY, "pi_send:get_available_models": models });

const signInAsk = (page: import("@playwright/test").Page) => page.locator(".doc-ui-request", { hasText: "Sign in" });


test("a refused prompt with no provider offers Sign in", async ({ page }) => {
	await openApp(page, ASKED, refusedWith(NO_MODELS));
	await sendAtTail(page, "Hi");
	await expect.poll(() => documentText(page)).toContain("No API key found for openai.");
	await expect(signInAsk(page)).toBeVisible();
	await expect(signInAsk(page).getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("a refused prompt with models listed offers no Sign in", async ({ page }) => {
	await openApp(page, ASKED, refusedWith(PI_MODELS));
	await sendAtTail(page, "Hi");
	await expect.poll(() => documentText(page)).toContain("No API key found for openai.");
	await expect.poll(async () => (await sentOfType(page, "get_available_models")).length, "pi was asked what it can run").toBe(1);
	await afterFrames(page);
	await expect(page.locator(".doc-ui-request")).toHaveCount(0);
});

// ---- the first-run splash and the guided tour (ADR 0038)

/** What the page has written to the store under `welcome`. */
const welcomeWrites = async (page: import("@playwright/test").Page) =>
	(await ipcCalls(page)).filter((call) => call.cmd === "docs_write" && (call.args as { id: string }).id === "welcome");

const splash = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Welcome to Piary" });
const coach = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Piary tour" });

/** What is topmost at the centre of `selector`'s box: the page itself, or a pane of the tour. */
const topmostAt = (page: import("@playwright/test").Page, selector: string) =>
	page.evaluate((selector) => {
		const box = document.querySelector(selector)!.getBoundingClientRect();
		return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.className ?? "";
	}, selector);

/** Boots a first run and takes the tour from its splash. */
async function takeTheTour(page: import("@playwright/test").Page, answers: Answers = {}) {
	await openApp(page, undefined, { cell_state_read: { state: null }, ...answers });
	await splash(page).getByRole("button", { name: "Take the tour" }).click();
	await expect(coach(page)).toContainText("Drag the slider");
}

test("a first run opens on a splash, and nothing behind it takes a key or a menu item", async ({ page }) => {
	await openApp(page, undefined, { cell_state_read: { state: null } });
	await expect(splash(page)).toBeVisible();
	await expect(splash(page).getByRole("button", { name: "Quit onboarding" })).toBeVisible();
	const before = await documentOf(page);
	await page.keyboard.type("typed behind the splash");
	await emitToPage(page, "menu", "new-document");
	await afterFrames(page);
	expect(await documentOf(page), "no key reached the canvas").toBe(before);
	expect((await ipcCalls(page)).filter((call) => call.cmd === "open_document"), "no menu item ran").toEqual([]);
});

test("the tour walks the slider, then points an arrow at the word to change, and only the question takes edits", async ({ page }) => {
	await takeTheTour(page);
	await expect.poll(() => topmostAt(page, ".conversations"), { message: "the list is behind the tour" }).toContain("coach-pane");
	await page.locator('input[type="range"]').fill("5");
	await expect(coach(page)).toContainText("Change three to five");

	// The arrow's tip sits over the word itself.
	const question = page.locator(".cm-line", { hasText: "Give me three names for a houseplant." });
	const word = await question.evaluate((line) => {
		const text = line.firstChild!;
		const range = document.createRange();
		const at = text.textContent!.indexOf("three");
		range.setStart(text, at);
		range.setEnd(text, at + 5);
		const box = range.getBoundingClientRect();
		return { left: box.left, right: box.right, top: box.top };
	});
	const tip = await page.locator(".coach-arrow").evaluate((arrow) => ({ x: parseFloat(arrow.style.left), y: parseFloat(arrow.style.top) }));
	expect(tip.x).toBeGreaterThanOrEqual(word.left);
	expect(tip.x).toBeLessThanOrEqual(word.right);
	expect(tip.y, "the tip stops just above the word, outside the cutout").toBeLessThanOrEqual(word.top);
	expect(word.top - tip.y).toBeLessThan(16);

	// A send before the change is held; vertical moves cannot leave the question.
	// The step selects the word; a send before the change is held, and a
	// vertical move cannot leave the question.
	await page.keyboard.press("ControlOrMeta+Enter");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.type("five");
	await expect(coach(page)).toContainText("Press ⌘⏎");
	expect(await promptsSent(page), "nothing was sent before the change").toEqual([]);
	expect(await documentOf(page)).toContain("Give me five names for a houseplant.");
});

test("the tour's slider step waits for the slider to be let go, so a drag is not scrolled away from under the pointer", async ({ page }) => {
	await takeTheTour(page);
	const slider = page.locator('input[type="range"]');
	const box = (await slider.boundingBox())!;
	await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 });
	await afterFrames(page);
	await expect(coach(page), "still held: the step has not moved on").toContainText("Drag the slider");
	const held = (await slider.boundingBox())!;
	expect(Math.round(held.y), "and the page has not moved").toBe(Math.round(box.y));
	await page.mouse.up();
	await expect(coach(page)).toContainText("Change three to five");
});

test("the tour's send runs the changed question, then reads the chrome with Next to the last step", async ({ page }) => {
	await takeTheTour(page, piHolding(transcriptOf()));
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(async () => (await promptsSent(page)).map((p) => p.message)).toEqual(["Give me five names for a houseplant."]);
	await piEvents(page, "welcome", [
		{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Ivy, Basil, Moss, Fern, Sage." }] } },
		{ type: "agent_settled" },
	]);
	// The answer landed: the tour moves on by itself.
	const next = coach(page).getByRole("button", { name: "Next" });
	await expect(coach(page)).toContainText("Every block has a menu");
	await next.click();
	await expect(coach(page)).toContainText("Your conversations live here");
	await next.click();
	await expect(coach(page)).toContainText("Pick the model here");
	await next.click();
	await expect(coach(page)).toContainText("Your turn");
	await coach(page).getByRole("button", { name: "Finish" }).click();
	await expect(coach(page)).toHaveCount(0);
	await expect.poll(() => welcomeWrites(page), { message: "stored, so the next launch is no first run" }).not.toHaveLength(0);
});

test("a send the tour lets through that pi refuses for want of a provider points at Sign in, and it opens", async ({ page }) => {
	await takeTheTour(page, { ...refusedWith(NO_MODELS), "pi_send:get_commands": LOGIN_COMMANDS });
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(coach(page)).toContainText("Sign in here");
	await signInButton(page).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toContain("/piary-login");
});

/** Changes three to five in the tour's question, from wherever the caret is. */
async function changeThreeToFive(page: import("@playwright/test").Page) {
	await page.locator('input[type="range"]').fill("5");
	await expect(coach(page)).toContainText("Change three to five");
	// The step selects the word, so typing replaces it without a click.
	await page.keyboard.type("five");
	await expect(coach(page)).toContainText("Press ⌘⏎");
}

test("the edit step selects the word, and keys cannot carry the caret out of the question", async ({ page }) => {
	await takeTheTour(page);
	await changeThreeToFive(page);
	expect(await documentOf(page)).toContain("Give me five names for a houseplant.");
	await page.keyboard.press("Home");
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.type("x");
	expect(await documentOf(page), "a move out of the question is held").toContain("\nxGive me five names");
});

test("the tour reads no face: typing in it starts no camera, its send carries no block, and the switch is held", async ({ page }) => {
	const frown = JSON.stringify([{ from: 0, to: 60_000, units: [[4, "C"]] }]);
	await takeTheTour(page, { ...piHolding(transcriptOf()), preferences_read: { cellWorkPulse: true, face: true, faceExplained: true, faceCamera: "" }, face_source: { kind: "script", script: frown } });
	const pill = page.locator(".model-chip .face-pill");
	await expect(pill).toHaveAttribute("data-state", "idle");
	// Everything the pill shows from here on.
	await pill.evaluate((el) => {
		const shown: (string | undefined)[] = [];
		(window as unknown as { __FACE_SHOWN__: (string | undefined)[] }).__FACE_SHOWN__ = shown;
		new MutationObserver(() => shown.push((el as HTMLElement).dataset["state"])).observe(el, { attributeFilter: ["data-state"] });
	});
	await changeThreeToFive(page);
	expect(await topmostAt(page, ".face-pill"), "a pane of the tour is over the pill").toContain("coach-pane");
	// And on the step that cuts the chip out, a click that reached it opens nothing.
	await pill.evaluate((el) => (el as HTMLElement).click());
	await expect(page.locator(".doc-menu-note")).toHaveCount(0);
	await emitToPage(page, "menu", "toggle-face");
	await page.keyboard.press("ControlOrMeta+Enter");
	const sent = async () =>
		(await ipcCalls(page)).flatMap((call) => {
			const command = (call.args as { command?: { type?: string; message?: string } }).command;
			return call.cmd === "pi_send" && command?.type === "prompt" ? [command.message ?? ""] : [];
		});
	await expect.poll(async () => (await sent()).length).toBe(1);
	expect((await sent())[0], "the message as pi is handed it").toMatch(/^Give me five names for a houseplant\.\n\[now: /);
	expect(await page.evaluate(() => (window as unknown as { __FACE_SHOWN__: unknown[] }).__FACE_SHOWN__), "the camera was never wanted").toEqual([]);
	expect((await ipcCalls(page)).filter((call) => call.cmd === "preferences_write"), "the menu's item is held").toEqual([]);
	await expect(page.locator(".doc-face-sheet")).toHaveCount(0);
});

test("a refusal whose provider check answers late still brings the Sign in step", async ({ page }) => {
	await takeTheTour(page, {
		...refusedWith({ delayMs: 400, value: NO_MODELS }),
		// A refusal slow enough that the turn is seen running first.
		"pi_send:prompt": { delayMs: 100, value: NO_KEY },
		"pi_send:get_commands": LOGIN_COMMANDS,
	});
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(coach(page)).toContainText("Sign in here");
});

test("the walk stands aside while the sign-in panel asks, and comes back when it closes", async ({ page }) => {
	await takeTheTour(page, { ...refusedWith(NO_MODELS), "pi_send:get_commands": LOGIN_COMMANDS });
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(coach(page)).toContainText("Sign in here");
	await signInButton(page).click();
	await emitToPage(page, "pi-event", ["welcome", { type: "extension_ui_request", id: "l1", method: "input", title: "piary:login", placeholder: JSON.stringify({ step: "choose", offers: OFFERS }) }]);
	await expect(page.locator(".doc-login")).toBeVisible();
	await expect(page.locator(".coach-hole"), "the scrim stands aside").toBeHidden();
	await expect(coach(page).getByRole("button", { name: "Sign in later" }), "and the card keeps the way on").toBeVisible();
	await page.locator(".doc-login-search").fill("anth");
	await expect(page.locator(".doc-login-search"), "the panel takes keys").toHaveValue("anth");
	await page.locator(".doc-login").getByRole("button", { name: "cancel" }).click();
	await expect(page.locator(".coach-hole")).toBeVisible();
});

/** The sign-in flow in the main window's pi asking a question, and ending. */
const TOUR_QUESTION_LENGTH = "Give me three names for a houseplant.".length;
const tourLoginAsks = (page: import("@playwright/test").Page) =>
	emitToPage(page, "pi-event", ["welcome", { type: "extension_ui_request", id: "l1", method: "input", title: "piary:login", placeholder: JSON.stringify({ step: "choose", offers: OFFERS }) }]);
const tourLoginEnds = (page: import("@playwright/test").Page, done: Record<string, unknown>) =>
	emitToPage(page, "pi-event", ["welcome", { type: "extension_ui_request", id: `n${Math.random()}`, method: "notify", message: `piary:login ${JSON.stringify({ step: "done", provider: "Anthropic", ...done })}` }]);

/** A tour walked to a send pi refused for want of a provider. */
async function refusedInTheTour(page: import("@playwright/test").Page) {
	await takeTheTour(page, { ...refusedWith(NO_MODELS), "pi_send:get_commands": LOGIN_COMMANDS });
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect(coach(page)).toContainText("Sign in here");
}

const promptsOf = async (page: import("@playwright/test").Page) => (await sentOfType(page, "prompt")).map((command) => asWritten(command["message"] as string));

test("a sign-in that takes joins the tour back at the send, and the question goes to pi again", async ({ page }) => {
	await refusedInTheTour(page);
	await signInButton(page).click();
	await tourLoginAsks(page);
	await expect(page.locator(".coach-hole"), "the scrim stands aside").toBeHidden();
	await answerFromNow(page, "pi_send:prompt", { success: true });
	await tourLoginEnds(page, { ok: true });
	await expect(coach(page)).toContainText("Press ⌘⏎");
	await page.keyboard.press("ControlOrMeta+Enter");
	await expect.poll(() => promptsOf(page)).toEqual([RECORDED_QUESTION, "/piary-login", RECORDED_QUESTION]);
	await piEvents(page, "welcome", [
		{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Ivy, Basil, Moss, Fern, Sage." }] } },
		{ type: "agent_settled" },
	]);
	await expect(coach(page)).toContainText("Every block has a menu");
});

test("a sign-in that fails offers Try again, which opens it again, or Sign in later, which goes on with a recorded answer", async ({ page }) => {
	await refusedInTheTour(page);
	await signInButton(page).click();
	await tourLoginAsks(page);
	await page.locator(".doc-login").getByRole("button", { name: "cancel" }).click();
	await tourLoginEnds(page, { ok: false, cancelled: true });
	await expect(coach(page)).toContainText("did not finish");

	await coach(page).getByRole("button", { name: "Try again" }).click();
	await expect.poll(async () => (await promptsOf(page)).filter((m) => m === "/piary-login")).toHaveLength(2);
	await tourLoginAsks(page);
	await page.locator(".doc-login").getByRole("button", { name: "cancel" }).click();
	await tourLoginEnds(page, { ok: false, cancelled: true });
	await expect(coach(page)).toContainText("did not finish");

	await coach(page).getByRole("button", { name: "Sign in later" }).click();
	await expect(coach(page)).toContainText("Every block has a menu");
	const md = await documentOf(page);
	expect(md).toContain(`${RECORDED_QUESTION}\n\n<!-- pi -->\n\n${RECORDED_ANSWER}`);
	expect(md, "the refusal is gone with the rest of the old answer").not.toContain("**Error:**");
	expect((await promptsOf(page)).filter((m) => m !== "/piary-login"), "no model call for the recording").toEqual([RECORDED_QUESTION]);
});

test("a question rewritten whole goes on as five with the recorded answer when pi cannot answer it", async ({ page }) => {
	// pi lists models, so the refusal is not a missing provider: no Sign in fork.
	await takeTheTour(page, refusedWith(PI_MODELS));
	await page.locator('input[type="range"]').fill("5");
	await expect(coach(page)).toContainText("Change three to five");
	await page.keyboard.press("End");
	for (let i = 0; i < TOUR_QUESTION_LENGTH; i++) await page.keyboard.press("Backspace");
	await page.keyboard.type("Tell me a joke");
	await coach(page).getByRole("button", { name: "Next" }).click();
	await expect(coach(page)).toContainText("Press ⌘⏎");
	await page.keyboard.press("ControlOrMeta+Enter");
	await coach(page).getByRole("button", { name: "Go on with a recorded answer" }).click();
	await expect(coach(page)).toContainText("Every block has a menu");
	expect(await documentOf(page)).toContain(`${RECORDED_QUESTION}\n\n<!-- pi -->\n\n${RECORDED_ANSWER}`);
	expect(await promptsOf(page)).toEqual(["Tell me a joke"]);
});

test("Quit onboarding says where the tour is, and neither the splash nor the tour comes back", async ({ page }) => {
	await takeTheTour(page);
	await coach(page).getByRole("button", { name: "Quit onboarding" }).click();
	await expect(coach(page)).toHaveCount(0);
	await expect(page.locator("#status")).toHaveText("The tour is still here whenever you want it: Help → Welcome to Piary.");
	await expect.poll(() => welcomeWrites(page), { message: "stored, so the next launch is no first run" }).not.toHaveLength(0);
});

test("a first run shows the splash whatever an earlier launch left in the webview's storage", async ({ page }) => {
	// The webview's storage outlives every launch and every document directory;
	// a flag kept there once hid the splash from a fresh store (ADR 0038).
	await page.addInitScript(() => {
		localStorage.setItem("piary-onboarding", "done");
		localStorage.setItem("piary-tour:welcome", "1");
	});
	await openApp(page, undefined, { cell_state_read: { state: null } });
	await expect(splash(page)).toBeVisible();
});

test("quitting at the splash says where the tour is too, and stores the tour", async ({ page }) => {
	await openApp(page, undefined, { cell_state_read: { state: null } });
	await splash(page).getByRole("button", { name: "Quit onboarding" }).click();
	await expect(splash(page)).toHaveCount(0);
	await expect(page.locator("#status")).toContainText("Help → Welcome to Piary");
	await expect.poll(() => welcomeWrites(page)).not.toHaveLength(0);
});

test("a conversation the main window already holds is never walked through", async ({ page }) => {
	await openAppAt(page, "/", { "docs_read@welcome": `# Yesterday\n\n${ASKED}`, cell_state_read: { state: null } });
	await expect(page.locator(".cm-editor")).toContainText("Yesterday");
	await afterFrames(page);
	await expect(splash(page)).toHaveCount(0);
	await expect(coach(page)).toHaveCount(0);
	await expect(page.locator(".hint"), "no hint points into someone's own conversation").toHaveCount(0);
});

// ---- the Sign in button beside the model chip (ADR 0037)

const signInButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Sign in: pi has no provider" });

/** Changes what the fake answers `key` with from now on. */
const answerFromNow = (page: import("@playwright/test").Page, key: string, value: unknown) =>
	page.evaluate(([key, value]) => void ((window as unknown as { __answers: Record<string, unknown> }).__answers[key as string] = value), [key, value] as const);

test("a prompt refused with no provider shows a red Sign in button and blinks the model chip", async ({ page }) => {
	await openApp(page, ASKED, { ...refusedWith(NO_MODELS), "pi_send:get_commands": LOGIN_COMMANDS });
	await expect(signInButton(page), "nothing is said before pi has").toBeHidden();
	await sendAtTail(page, "Hi");
	await expect(signInButton(page)).toBeVisible();
	await expect(page.locator(".model-chip")).toHaveClass(/model-chip--needs-sign-in/);
	// Beside the chip's pills, never over them.
	const [button, pill] = await Promise.all([signInButton(page).boundingBox(), modelPill(page).boundingBox()]);
	expect(button!.x + button!.width).toBeLessThanOrEqual(pill!.x);
	await signInButton(page).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toContain("/piary-login");
});

test("a send pi accepts takes the Sign in button away", async ({ page }) => {
	await openApp(page, ASKED, refusedWith(NO_MODELS));
	await sendAtTail(page, "Hi");
	await expect(signInButton(page)).toBeVisible();
	await answerFromNow(page, "pi_send:prompt", { success: true });
	await sendAtTail(page, " again");
	await expect(signInButton(page)).toBeHidden();
	await expect(page.locator(".model-chip")).not.toHaveClass(/model-chip--needs-sign-in/);
});

test("a completed sign-in takes the Sign in button away", async ({ page }) => {
	await openApp(page, ASKED, { ...refusedWith(NO_MODELS), "pi_send:get_commands": LOGIN_COMMANDS, pi_stop: { emit: ["pi-exited", ["scratch", 0]], value: 0 } });
	await sendAtTail(page, "Hi");
	await signInButton(page).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toContain("/piary-login");
	await loginSays(page, { step: "done", ok: true, provider: "Anthropic" });
	await expect(signInButton(page)).toBeHidden();
	await expect(page.locator(".model-chip")).not.toHaveClass(/model-chip--needs-sign-in/);
});

test("a refusal pi still lists models for shows no Sign in button", async ({ page }) => {
	await openApp(page, ASKED, refusedWith(PI_MODELS));
	await sendAtTail(page, "Hi");
	await expect.poll(async () => (await sentOfType(page, "get_available_models")).length).toBe(1);
	await afterFrames(page);
	await expect(signInButton(page)).toBeHidden();
});

test("with motion reduced, the Sign in button is steady red", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await openApp(page, ASKED, refusedWith(NO_MODELS));
	await sendAtTail(page, "Hi");
	await expect(signInButton(page)).toBeVisible();
	expect(await signInButton(page).evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
	expect(await modelPill(page).evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
});

// ---- pi's own commands in the creation menu

const PI_COMMANDS = {
	success: true,
	data: {
		commands: [
			{ name: "review", description: "review a diff", source: "prompt", sourceInfo: { path: "/home/.pi/agent/prompts/review.md" } },
			{ name: "plain", description: "no file behind it", source: "extension", sourceInfo: {} },
			{ name: "terminal", description: "pi's own row of the same name", source: "extension", sourceInfo: {} },
		],
	},
};
const menuRow = (page: import("@playwright/test").Page, label: string) => page.locator(".cm-tooltip-autocomplete li", { hasText: label });
const openMenu = async (page: import("@playwright/test").Page, typed = "/") => {
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type(typed);
};

test("the creation menu offers pi's own commands, and a row inserts its command", async ({ page }) => {
	await openApp(page, ASKED, { ...PICKER, "pi_send:get_commands": PI_COMMANDS });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await openMenu(page);
	await expect(menuRow(page, "/review")).toHaveCount(1);
	await expect(menuRow(page, "/terminal"), "the app's own row wins over pi's of the same name").toHaveCount(1);
	await menuRow(page, "/review").click();
	expect(await documentText(page)).toContain("/review ");
});

/** The card over a `/name` already written on the last line. */
const hoverCard = async (page: import("@playwright/test").Page) => {
	await page.locator(".cm-line").last().hover({ position: { x: 16, y: 8 } });
	return page.locator(".cm-tooltip .doc-command-doc");
};

test("the menu has no card beside it; a pi command already written has one, from its file's frontmatter and never its text", async ({ page }) => {
	await openApp(page, ASKED, {
		...PICKER,
		"pi_send:get_commands": PI_COMMANDS,
		command_doc_read: "---\ndescription: from the file\nargument-hint: \"[path]\"\n---\nThe body of the command.",
	});
	await expect(modelPill(page)).toHaveText("GPT 9");
	await openMenu(page, "/rev");
	await expect(menuRow(page, "/review")).toHaveCount(1);
	await expect(page.locator(".cm-completionInfo"), "a row says what its command does; nothing repeats it").toHaveCount(0);
	await menuRow(page, "/review").click();
	const card = await hoverCard(page);
	await expect(card).toContainText("from the file");
	await expect(card).toContainText("[path]");
	await expect(card, "a card is a glance, not the command's text").not.toContainText("The body of the command.");
});

test("a row of the creation menu says what its command does, the app's own first and pi's after", async ({ page }) => {
	await openApp(page, ASKED, { ...PICKER, "pi_send:get_commands": PI_COMMANDS, menu_chords: { "new-document": "⌘N", settings: "⌘Ö" } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await openMenu(page);
	await expect(menuRow(page, "/review")).toContainText("review a diff");
	await expect(menuRow(page, "/model")).toContainText("choose the model that answers");
	const labels = await page.locator(".cm-tooltip-autocomplete li .cm-completionLabel").allTextContents();
	expect(labels.slice(0, 3), "the catalog's order, not the alphabet's").toEqual(["/terminal", "/subagent", "/model"]);
	expect(labels.slice(-2), "pi's rows last, by what is behind them").toEqual(["/review", "/plain"]);
	expect(await page.locator(".cm-tooltip-autocomplete completion-section").allTextContents(), "who offers the rows under it").toEqual(["Piary", "Prompts", "Extensions"]);
	await expect(menuRow(page, "/new").locator("kbd"), "the chord that does the same").toHaveText("⌘N");
	await expect(menuRow(page, "/settings").locator("kbd"), "the key the system's menu holds, which a keyboard layout may have moved").toHaveText("⌘Ö");
	await expect(menuRow(page, "/terminal").locator("kbd"), "its menu item has no chord").toHaveCount(0);
	await expect(menuRow(page, "/model").locator("svg")).toHaveCount(1);
});

test("a row for a control the app has opens that control, and leaves nothing typed", async ({ page }) => {
	await openApp(page, ASKED, PICKER);
	await openMenu(page, "/mod");
	await menuRow(page, "/model").click();
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "GPT 9 mini" })).toBeVisible();
	expect(await documentText(page)).not.toContain("/mod");
	await page.keyboard.press("Escape");
	await openMenu(page, "/ne");
	await menuRow(page, "/new").click();
	await expect.poll(() => openedDocs(page), { message: "the row is New Document's own action" }).toHaveLength(1);
});

test("the /subagent row writes the invocation for a prompt to follow", async ({ page }) => {
	await openApp(page, ASKED);
	await openMenu(page, "/sub");
	await menuRow(page, "/subagent").click();
	expect(await documentText(page)).toContain("/subagent ");
});

test("one of the app's own commands, already written, has a card that names Piary", async ({ page }) => {
	await openApp(page, ASKED);
	await openMenu(page, "/sub");
	await menuRow(page, "/subagent").click();
	const card = await hoverCard(page);
	await expect(card).toContainText("run a prompt in its own child session");
	await expect(card.locator(".doc-command-doc-badge"), "whose command it is, not a word of the code's").toHaveText("Piary");
});

const palette = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Commands" });

test("Commands… opens a palette of every command, and a row runs what its slash row runs", async ({ page }) => {
	// The chords are the menu bar's own, as the system holds them: on a Turkish
	// keyboard layout it moves Settings… from ⌘, to ⌘Ö (ADR 0051).
	await openApp(page, ASKED, { ...PICKER, "pi_send:get_commands": PI_COMMANDS, menu_chords: { "new-document": "⌘N", settings: "⌘Ö" } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	// From anywhere: the caret is in the first prompt, not the trailing one.
	await page.locator(".cm-line", { hasText: "What is 2+2?" }).click();
	await emitToPage(page, "menu", "commands");
	await expect(palette(page).getByRole("textbox")).toBeFocused();
	await expect(palette(page).getByRole("option", { name: "/review" })).toContainText("review a diff");
	await expect(palette(page).getByRole("option", { name: "/new" }).locator("kbd"), "the row its slash row is").toHaveText("⌘N");
	await expect(palette(page).getByRole("option", { name: "/settings" }).locator("kbd"), "the key the system moved it to").toHaveText("⌘Ö");
	await expect(palette(page).getByRole("option", { name: "/terminal" }).locator("kbd"), "its menu item has no chord").toHaveCount(0);
	await expect(palette(page).getByRole("option", { name: "/model" }).locator("svg")).toHaveCount(1);
	await page.keyboard.type("model");
	await expect(palette(page).getByRole("option").first()).toContainText("/model");
	await page.keyboard.press("Enter");
	await expect(palette(page)).toHaveCount(0);
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "GPT 9 mini" })).toBeVisible();
	expect(await documentText(page), "nothing was typed into the document").toBe(ASKED);
});

test("a palette row for a command that is written lands on the trailing prompt, and Escape closes the palette", async ({ page }) => {
	await openApp(page, ASKED);
	await page.locator(".cm-line", { hasText: "What is 2+2?" }).click();
	await emitToPage(page, "menu", "commands");
	await page.keyboard.press("Escape");
	await expect(palette(page)).toHaveCount(0);
	await emitToPage(page, "menu", "commands");
	await page.keyboard.type("sub");
	await palette(page).getByRole("option", { name: "/subagent" }).click();
	expect(await documentText(page)).toBe(`${ASKED}/subagent `);
	await page.keyboard.type("count the files");
	expect(await documentText(page), "the caret is after it").toBe(`${ASKED}/subagent count the files`);
});

test("after a terminal is opened, a slash on the prompt under it opens the menu", async ({ page }) => {
	await openApp(page, ASKED);
	await openMenu(page);
	await menuRow(page, "/terminal").click();
	await expect.poll(async () => (await documentText(page)).includes("pi:view terminal")).toBe(true);
	await page.keyboard.type("/mod");
	await expect(menuRow(page, "/model"), "typed where the caret was left, with no click").toHaveCount(1);
	expect(await documentText(page), "the whole word is in the prompt under the panel").toMatch(/```\s*<!-- you -->\s*\/mod$/);
});

test("the tour holds a row that runs a menu item, as it holds the item", async ({ page }) => {
	await takeTheTour(page, piHolding(transcriptOf()));
	await changeThreeToFive(page);
	await page.keyboard.press("ControlOrMeta+Enter");
	await piEvents(page, "welcome", [
		{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Ivy, Basil, Moss, Fern, Sage." }] } },
		{ type: "agent_settled" },
	]);
	const next = coach(page).getByRole("button", { name: "Next" });
	await expect(coach(page)).toContainText("Every block has a menu");
	await next.click();
	await next.click();
	await next.click();
	await expect(coach(page)).toContainText("Your turn");
	await openMenu(page, "/ne");
	await menuRow(page, "/new").click();
	await afterFrames(page);
	expect(await openedDocs(page), "no way out of the tour through the menu").toEqual([]);
	await expect(coach(page)).toContainText("Your turn");
});

test("the creation menu starts no pi just to fill itself in", async ({ page }) => {
	await openApp(page, TWO_ASKED);
	await openMenu(page);
	await expect(menuRow(page, "/terminal")).toHaveCount(1);
	expect((await ipcCalls(page)).filter((call) => call.cmd === "pi_start")).toEqual([]);
});

test("the model menu offers no sign-out when pi has no provider", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_available_models": NO_MODELS });
	await modelPill(page).click();
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "Sign in…" })).toBeEnabled();
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "Sign out…" })).toHaveCount(0);
});

/** pi's command list with Piary's login commands in it, as a current
 *  `pi-ui-views` registers them. */
const LOGIN_COMMANDS = { success: true, data: { commands: [{ name: "piary-login", source: "extension" }, { name: "piary-logout", source: "extension" }] } };

/** A window whose pi lists no models, and carries Piary's login commands. */
const signedOut = (): Answers => ({ ...PICKER, "pi_send:get_available_models": NO_MODELS, "pi_send:get_commands": LOGIN_COMMANDS, pi_stop: { emit: ["pi-exited", ["scratch", 0]], value: 0 } });

/** The login command asking the page a step (`pi-extension/login.ts`). */
const loginAsks = (page: import("@playwright/test").Page, id: string, step: Record<string, unknown>) =>
	emitToPage(page, "pi-event", ["scratch", { type: "extension_ui_request", id, method: "input", title: "piary:login", placeholder: JSON.stringify(step) }]);

/** The login command's news. */
const loginSays = (page: import("@playwright/test").Page, step: Record<string, unknown>) =>
	emitToPage(page, "pi-event", ["scratch", { type: "extension_ui_request", id: `n${Math.random()}`, method: "notify", message: `piary:login ${JSON.stringify(step)}` }]);

/** The page's answers to the login command, by request id. */
const loginAnswers = async (page: import("@playwright/test").Page) =>
	Object.fromEntries(
		(await sentOfType(page, "extension_ui_response")).map((command) => [
			command["id"],
			command["cancelled"] === true ? "cancelled" : (JSON.parse(String(command["value"])) as Record<string, unknown>),
		]),
	);

const OFFERS = [
	{ providerId: "zed", name: "Zed Cloud", type: "api_key", label: "API key", subscription: false, signedIn: null },
	{ providerId: "anthropic", name: "Anthropic", type: "api_key", label: "API key", subscription: false, signedIn: null },
	{ providerId: "anthropic", name: "Anthropic", type: "oauth", label: "Sign in with Claude", subscription: true, signedIn: null },
	{ providerId: "openai", name: "OpenAI", type: "api_key", label: "API key", subscription: false, signedIn: null },
];

const panel = (page: import("@playwright/test").Page) => page.locator(".doc-login");

/** The panel's row for `name`'s `method`, read off the row's own labels. */
const offerRow = (page: import("@playwright/test").Page, name: string, method: string) =>
	panel(page)
		.locator(".doc-login-offer")
		.filter({ has: page.locator(".doc-login-name", { hasText: new RegExp(`^${name}$`) }) })
		.filter({ has: page.locator(".doc-login-method", { hasText: new RegExp(`^${method}$`) }) });

/** Opens the model menu's Sign in… and waits for the command to be sent. */
async function startSignIn(page: import("@playwright/test").Page) {
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Sign in…" }).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toEqual(["/piary-login"]);
}

test("Sign in is a panel: pi's providers listed, a key typed into it goes to pi, and pi restarts to read it", async ({ page }) => {
	await openApp(page, TWO_ASKED, signedOut());
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await expect(panel(page)).toBeVisible();
	// The common providers first, each one's account sign-in before its key.
	await expect(panel(page).locator(".doc-login-offer")).toHaveText([/Anthropic.*Sign in with Claude/, /Anthropic.*API key/, /OpenAI.*API key/, /Zed Cloud.*API key/]);
	await offerRow(page, "Anthropic", "API key").click();
	await expect.poll(async () => (await loginAnswers(page))["l1"]).toEqual({ providerId: "anthropic", type: "api_key" });

	await loginAsks(page, "l2", { step: "prompt", provider: "Anthropic", prompt: { type: "secret", message: "Enter Anthropic API key" } });
	const field = panel(page).locator("input.doc-ui-request-input");
	await expect(panel(page)).toContainText("Enter Anthropic API key");
	await expect(field, "a key is never shown").toHaveAttribute("type", "password");
	await field.fill("sk-ant-test");
	await field.press("Enter");
	await expect.poll(async () => (await loginAnswers(page))["l2"]).toEqual({ value: "sk-ant-test" });

	await loginSays(page, { step: "done", ok: true, provider: "Anthropic" });
	await expect(panel(page)).toHaveCount(0);
	await expect(page.locator("#status")).toContainText("Signed in to Anthropic");
	await expect.poll(() => ptyCalls(page, "pi_stop")).toEqual([{ sid: "scratch", keepTerminals: true }]);
	await expect(modelPill(page), "the chip no longer names the stopped pi's model").toHaveText("model");
	await afterFrames(page);
	await expect(page.locator("#status"), "the stop was expected").not.toContainText("pi stopped");
	await expect(page.locator(".doc-terminal"), "no terminal is opened").toHaveCount(0);
	expect(await documentText(page), "the key is nowhere in the document").not.toContain("sk-ant-test");
});

test("an account sign-in opens the provider's page in the browser and takes a pasted code; cancel ends it", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...signedOut(), open_url: null });
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await panel(page).locator(".doc-login-offer", { hasText: "Sign in with Claude" }).click();
	await loginSays(page, { step: "event", event: { type: "auth_url", url: "https://claude.ai/oauth/authorize?code=x", instructions: "Finish in your browser." } });
	await expect(panel(page)).toContainText("Finish in your browser.");
	await panel(page).getByRole("button", { name: "Open sign-in page" }).click();
	await expect.poll(() => ptyCalls(page, "open_url")).toEqual([{ url: "https://claude.ai/oauth/authorize?code=x" }]);
	await loginAsks(page, "l2", { step: "prompt", provider: "Anthropic", prompt: { type: "manual_code", message: "Paste the authorization code" } });
	await expect(panel(page)).toContainText("Paste the authorization code");
	await expect(panel(page), "the link stays while the code is asked for").toContainText("Finish in your browser.");
	await panel(page).getByRole("button", { name: "cancel" }).click();
	await expect.poll(async () => (await loginAnswers(page))["l2"]).toBe("cancelled");
	await expect(panel(page)).toHaveCount(0);
	await loginSays(page, { step: "done", ok: false, cancelled: true, provider: "Anthropic" });
	await afterFrames(page);
	expect(await ptyCalls(page, "pi_stop"), "a cancelled sign-in restarts nothing").toEqual([]);
});

test("a sign-in finished in the browser brings the window back to the front; one with a key needs no focus", async ({ page }) => {
	await openApp(page, TWO_ASKED, signedOut());
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await panel(page).locator(".doc-login-offer", { hasText: "Sign in with Claude" }).click();
	await loginSays(page, { step: "event", event: { type: "auth_url", url: "https://claude.ai/oauth/authorize?code=x" } });
	await loginSays(page, { step: "done", ok: true, provider: "Anthropic" });
	await expect.poll(() => ptyCalls(page, "focus_window")).toHaveLength(1);

	await expect.poll(() => ptyCalls(page, "pi_stop")).toHaveLength(1);
	await startSignIn(page).catch(() => {});
	await loginAsks(page, "l2", { step: "choose", offers: OFFERS });
	await offerRow(page, "OpenAI", "API key").click();
	await loginSays(page, { step: "done", ok: true, provider: "OpenAI" });
	await afterFrames(page);
	expect(await ptyCalls(page, "focus_window"), "the window already has the user").toHaveLength(1);
});

test("the Anthropic account row says, before the sign-in, that Piary's use of it draws on extra usage", async ({ page }) => {
	await openApp(page, TWO_ASKED, signedOut());
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await expect(panel(page).locator(".doc-login-offer", { hasText: "Sign in with Claude" })).toContainText("extra usage");
	await expect(offerRow(page, "Anthropic", "API key")).not.toContainText("extra usage");
});

test("signed in to one provider, the model menu still offers to sign in to another", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_commands": LOGIN_COMMANDS });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Sign in to another provider…" }).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toEqual(["/piary-login"]);
});

test("the provider list filters as the user types, and a device code is shown to copy", async ({ page }) => {
	await openApp(page, TWO_ASKED, signedOut());
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await panel(page).locator("input.doc-login-search").fill("zed");
	await expect(panel(page).locator(".doc-login-offer")).toHaveText([/Zed Cloud/]);
	await panel(page).locator(".doc-login-offer").click();
	await loginSays(page, { step: "event", event: { type: "device_code", userCode: "ABCD-1234", verificationUri: "https://zed.dev/device" } });
	await expect(panel(page)).toContainText("ABCD-1234");
	await expect(panel(page)).toContainText("https://zed.dev/device");
});

test("a sign-in pi could not finish says why, and restarts nothing", async ({ page }) => {
	await openApp(page, TWO_ASKED, signedOut());
	await startSignIn(page);
	await loginSays(page, { step: "done", ok: false, provider: "OpenAI", error: "invalid key" });
	await expect(page.locator("#status")).toContainText("Could not sign in to OpenAI: invalid key");
	await afterFrames(page);
	expect(await ptyCalls(page, "pi_stop")).toEqual([]);
});

test("a pi whose Piary extension has no sign-in says so, and sends pi nothing", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...signedOut(), "pi_send:get_commands": { success: true, data: { commands: [] } } });
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Sign in…" }).click();
	await expect(page.locator("#status")).toContainText("pi-ui-views");
	await afterFrames(page);
	expect(await sentOfType(page, "prompt"), "the command would reach the model as a prompt").toEqual([]);
});

test("Sign out lists what pi stored, and removing one restarts pi", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_commands": LOGIN_COMMANDS, pi_stop: { emit: ["pi-exited", ["scratch", 0]], value: 0 } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Sign out…" }).click();
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toEqual(["/piary-logout"]);
	await loginAsks(page, "o1", { step: "stored", stored: [{ providerId: "openai", name: "OpenAI", type: "api_key" }] });
	await panel(page).locator(".doc-login-offer", { hasText: "OpenAI" }).click();
	await expect.poll(async () => (await loginAnswers(page))["o1"]).toEqual({ providerId: "openai" });
	await loginSays(page, { step: "done", ok: true, provider: "OpenAI", signedOut: true });
	await expect(page.locator("#status")).toContainText("Signed out of OpenAI");
	await expect.poll(() => ptyCalls(page, "pi_stop")).toEqual([{ sid: "scratch", keepTerminals: true }]);
});

test("Sign out with nothing stored says a key from the environment is not pi's to remove", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_commands": LOGIN_COMMANDS });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Sign out…" }).click();
	await loginAsks(page, "o1", { step: "stored", stored: [] });
	await expect(panel(page)).toContainText("environment");
});

test("the sign-in panel is brought into view in a conversation longer than the window", async ({ page }) => {
	await openApp(page, blocks(30), signedOut());
	await startSignIn(page);
	await loginAsks(page, "l1", { step: "choose", offers: OFFERS });
	await expect(panel(page)).toBeInViewport();
});

test("/login in the creation menu opens the same panel", async ({ page }) => {
	await openApp(page, ASKED, signedOut());
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("/login");
	await page.locator(".cm-tooltip-autocomplete li", { hasText: "/login" }).click();
	expect(await documentText(page)).not.toContain("/login");
	await expect.poll(async () => (await sentOfType(page, "prompt")).map((command) => command["message"])).toEqual(["/piary-login"]);
});

// ---- a document in a window of its own: `?id=` names it

test("?id= opens that document and saves to it", async ({ page }) => {
	await openAppAt(page, "/?id=child-1", { "docs_read@child-1": "<!-- you -->\n\nThe child's own text\n\n" });
	await expect(page.locator(".cm-content").first()).toContainText("The child's own text");
	await page.locator(".cm-line").last().click();
	await page.keyboard.type("more");
	const written = async () => (await ipcCalls(page)).filter((call) => call.cmd === "docs_write").map((call) => (call.args as { id: string }).id);
	await expect.poll(written).toContain("child-1");
	expect(new Set(await written())).toEqual(new Set(["child-1"]));
});

test("a document with no file is rendered from its session's transcript", async ({ page }) => {
	await openAppAt(page, "/?id=web-1a2b3c4d", piHolding(transcriptOf(["What is 2+2?", "Four."])));
	await expect(page.locator(".cm-content").first()).toContainText("Four.");
	const md = await documentText(page);
	expect(md).toContain("session: web-1a2b3c4d");
	expect(md.indexOf("What is 2+2?")).toBeLessThan(md.indexOf("Four."));
});

// ---- subsessions: `/subagent` runs a prompt in a child session of its own

/** Writes a draft line, then a `/subagent` invocation, on the trailing prompt,
 *  and sends it. */
async function sendSubagent(page: import("@playwright/test").Page, prompt = "say hi") {
	await page.locator(".cm-content").first().locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("notes first");
	await page.keyboard.press("Enter");
	await page.keyboard.type(`/subagent ${prompt}`);
	// The `/` at a line's start opens the creation menu; it is not what is sent.
	await page.keyboard.press("Escape");
	await page.keyboard.press("ControlOrMeta+Enter");
}

/** The child's sid, read off its card's marker. */
async function childSid(page: import("@playwright/test").Page): Promise<string> {
	await expect.poll(async () => /<!-- pi:view subsession #(web-[0-9a-f]{8}) -->/.exec(await documentText(page))?.[1] ?? "").toMatch(/^web-/);
	return /<!-- pi:view subsession #(web-[0-9a-f]{8}) -->/.exec(await documentText(page))![1]!;
}

/** pi's events for `sid`, delivered as Rust emits them. */
const piEvents = (page: import("@playwright/test").Page, sid: string, events: Record<string, unknown>[]) =>
	page.evaluate(
		([sid, events]) => {
			for (const event of events as Record<string, unknown>[]) (window as unknown as { __emit(e: string, p: unknown): void }).__emit("pi-event", [sid, event]);
		},
		[sid, events] as const,
	);

const CHILD_ANSWER = [
	{ type: "message_start", message: { role: "user", content: [{ type: "text", text: "say hi" }] } },
	{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Hi from the child." }] } },
	{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Hi from the child." }] } },
];

test("/subagent puts a card in the parent, and the draft stays below it", async ({ page }) => {
	await openApp(page, ASKED);
	await sendSubagent(page);
	const child = await childSid(page);
	const md = await documentText(page);
	expect(md).not.toContain("/subagent");
	expect(md.indexOf(`#${child}`)).toBeLessThan(md.lastIndexOf("notes first"));
	expect(md.trimEnd().endsWith("notes first")).toBe(true);
	await expect(page.locator(`.doc-subsession[data-sid="${child}"]`)).toHaveCount(1);
});

test("the child is prompted under its own sid, never the parent's", async ({ page }) => {
	await openApp(page, ASKED);
	await sendSubagent(page);
	const child = await childSid(page);
	await expect
		.poll(async () =>
			(await ipcCalls(page))
				.filter((call) => call.cmd === "pi_send")
				.map((call) => call.args as { sid: string; command: { type: string; message?: string } })
				.filter((args) => args.command.type === "prompt")
				.map((args) => ({ ...args, command: { ...args.command, message: asWritten(args.command.message) } })),
		)
		.toEqual([{ sid: child, command: { type: "prompt", message: "say hi" } }]);
	const [sent] = (await ipcCalls(page))
		.filter((call) => call.cmd === "pi_send")
		.map((call) => (call.args as { command: { type: string; message?: string } }).command)
		.filter((command) => command.type === "prompt");
	expect(sent?.message).toMatch(/^say hi\n\[now: [^\]\n]+\]$/);
	const started = (await ipcCalls(page)).filter((call) => call.cmd === "pi_start").map((call) => (call.args as { sid: string }).sid);
	expect(started).toContain(child);
	// Its document starts as a file holding its prompt.
	const first = (await ipcCalls(page)).find((call) => call.cmd === "docs_write" && (call.args as { id: string }).id === child);
	expect((first!.args as { content: string }).content).toContain("<!-- you -->\n\nsay hi");
});

test("the child's events write its document, and the parent's is untouched", async ({ page }) => {
	await openApp(page, ASKED);
	await sendSubagent(page);
	const child = await childSid(page);
	await expect.poll(async () => (await ipcCalls(page)).some((call) => call.cmd === "pi_send" && (call.args as { sid: string }).sid === child)).toBe(true);
	await piEvents(page, child, [...CHILD_ANSWER, { type: "agent_settled" }]);
	const writes = async (id: string) =>
		(await ipcCalls(page))
			.filter((call) => call.cmd === "docs_write" && (call.args as { id: string }).id === id)
			.map((call) => (call.args as { content: string }).content);
	await expect.poll(async () => (await writes(child)).at(-1) ?? "").toContain("Hi from the child.");
	const last = (await writes(child)).at(-1)!;
	expect(last.split("say hi").length - 1, "the prompt's echo is not written twice").toBe(1);
	expect(await documentText(page)).not.toContain("Hi from the child.");
	expect((await writes("scratch")).some((content) => content.includes("Hi from the child."))).toBe(false);
});

test("a child's tool turn saves its result under the call", async ({ page }) => {
	await openApp(page, ASKED);
	await sendSubagent(page);
	const child = await childSid(page);
	await expect.poll(async () => (await ipcCalls(page)).some((call) => call.cmd === "pi_send" && (call.args as { sid: string }).sid === child)).toBe(true);
	await piEvents(page, child, [
		CHILD_ANSWER[0]!,
		toolCallAnswer("bash", "t1", { command: "ls" }, "Listing."),
		...toolRun("t1", "bash", ["a.txt\n"]),
		toolResultEnd("t1", "bash", "a.txt\n"),
		{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "One file." }] } },
		{ type: "agent_settled" },
	]);
	const saved = async () =>
		(await ipcCalls(page))
			.filter((c) => c.cmd === "docs_write" && (c.args as { id: string }).id === child)
			.map((c) => (c.args as { content: string }).content)
			.at(-1) ?? "";
	await expect.poll(saved).toContain("One file.");
	const md = await saved();
	const at = (s: string) => md.indexOf(s);
	expect(at("<!-- pi:result #t1 -->")).toBeGreaterThan(at("<!-- pi:tool bash #t1 -->"));
	expect(at("<!-- pi:result #t1 -->")).toBeLessThan(at("One file."));
	expect(md.slice(at("<!-- pi:result #t1 -->"))).toMatch(/^<!-- pi:result #t1 -->\n\n```\na\.txt\n```/);
	expect(md, "a background run opens no panel").not.toContain("pi:view terminal");
});

test("the card shows running, then done; and an error shows error", async ({ page }) => {
	await openApp(page, ASKED);
	await sendSubagent(page);
	const child = await childSid(page);
	const card = page.locator(`.doc-subsession[data-sid="${child}"]`);
	await expect(card).toHaveClass(/\brunning\b/);
	await expect(card.locator(".doc-subsession-stop")).toBeVisible();
	await piEvents(page, child, [...CHILD_ANSWER, { type: "agent_settled" }]);
	await expect(card).toHaveClass(/\bdone\b/);
	await expect(card.locator(".doc-subsession-stop")).toBeHidden();

	await sendSubagent(page, "fail please");
	await expect.poll(async () => [...(await documentText(page)).matchAll(/pi:view subsession #(web-[0-9a-f]{8})/g)].length).toBe(2);
	const second = [...(await documentText(page)).matchAll(/pi:view subsession #(web-[0-9a-f]{8})/g)][1]![1]!;
	await piEvents(page, second, [{ type: "error", message: "the provider refused" }, { type: "agent_settled" }]);
	await expect(page.locator(`.doc-subsession[data-sid="${second}"]`)).toHaveClass(/\berror\b/);
});

// ---- a subsession card's open and stop, and its status on reopening

const CHILD = "web-aaaa1111";
const WITH_CARD = `${ASKED.slice(0, -"<!-- you -->\n\n".length)}<!-- you -->\n\n<!-- pi:view subsession #${CHILD} -->\n\n\`\`\`json\n{"sid":"${CHILD}","title":"say hi","prompt":"say hi"}\n\`\`\`\n\n<!-- you -->\n\n`;

/** The page's `pi_send`s, by sid and command type. */
const piSent = async (page: import("@playwright/test").Page) =>
	(await ipcCalls(page))
		.filter((call) => call.cmd === "pi_send")
		.map((call) => call.args as { sid: string; command: { type: string } })
		.map((args) => ({ sid: args.sid, type: args.command.type }));

test("open asks for the child's own window", async ({ page }) => {
	await openApp(page, WITH_CARD);
	await page.locator(`.doc-subsession[data-sid="${CHILD}"] .doc-subsession-open`).click();
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "open_document").map((call) => call.args)).toEqual([{ docId: CHILD }]);
});

test("reopening a parent restores a running child's status, and stop aborts the child, not the parent", async ({ page }) => {
	await openApp(page, WITH_CARD, { "pi_send:get_state": { success: true, data: { isStreaming: true } } });
	const card = page.locator(`.doc-subsession[data-sid="${CHILD}"]`);
	await expect(card).toHaveClass(/\brunning\b/);
	expect((await ipcCalls(page)).filter((call) => call.cmd === "pi_start").map((call) => (call.args as { sid: string }).sid)).toContain(CHILD);
	await card.locator(".doc-subsession-stop").click();
	await expect.poll(async () => (await piSent(page)).filter((sent) => sent.type === "abort")).toEqual([{ sid: CHILD, type: "abort" }]);
});

test("a child that is not running shows done, and stop is not offered", async ({ page }) => {
	// The canvas's own rule, held here as a guard: stop exists only while running.
	await openApp(page, WITH_CARD, { "pi_send:get_state": { success: true, data: { isStreaming: false } } });
	const card = page.locator(`.doc-subsession[data-sid="${CHILD}"]`);
	await expect(card).toHaveClass(/\bdone\b/);
	await expect(card.locator(".doc-subsession-stop")).toBeHidden();
});

// ---- a window switches among conversations in place

/** Every IPC call the page makes, kept across the page's reloads. */
async function sinkCalls(page: import("@playwright/test").Page) {
	const calls: { cmd: string; args: Record<string, unknown> | null }[] = [];
	await page.exposeFunction("__ipcSink", (cmd: string, args: string) => calls.push({ cmd, args: JSON.parse(args) }));
	return calls;
}

/** Asks this window to show `id`, as the conversation list's rows do. */
const switchTo = (page: import("@playwright/test").Page, id: string) =>
	page.evaluate((id) => document.dispatchEvent(new CustomEvent("piary-switch", { detail: { id } })), id);

test("a switch saves this conversation and shows the other in the same window", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openApp(page, ASKED, { "docs_read@web-other": "<!-- you -->\n\nThe other one\n\n" });
	await page.locator(".cm-content").first().locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("kept here");
	await switchTo(page, "web-other");
	await expect(page).toHaveURL(/[?&]id=web-other/);
	await expect(page.locator(".cm-content").first()).toContainText("The other one");
	const saved = calls.filter((call) => call.cmd === "docs_write" && call.args?.["id"] === "scratch");
	expect(saved.at(-1)?.args?.["content"]).toContain("kept here");
	expect(calls.some((call) => call.cmd === "window_shows" && call.args?.["docId"] === "web-other")).toBe(true);
});

test("a conversation another window shows is focused there, and this window stays", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openApp(page, ASKED, { "docs_read@web-free": "<!-- you -->\n\nThe free one\n\n" });
	// Another window shows web-other; none shows web-free.
	await page.evaluate(() => {
		const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
		const inner = internals.invoke;
		internals.invoke = (cmd, args) => (cmd === "show_document" ? (inner(cmd, args), Promise.resolve((args as { docId: string }).docId === "web-other")) : inner(cmd, args));
	});
	await switchTo(page, "web-other");
	await expect.poll(() => calls.filter((call) => call.cmd === "show_document").length).toBe(1);
	// The control: the same page, asked next for a conversation no window
	// shows, does switch, saving on its way out. Had the first switch gone on,
	// it would have saved too.
	await switchTo(page, "web-free");
	await expect(page).toHaveURL(/[?&]id=web-free/);
	await expect(page.locator(".cm-content").first()).toContainText("The free one");
	const saves = calls.filter((call) => call.cmd === "docs_write" && call.args?.["id"] === "scratch");
	expect(saves, "one save, the second switch's").toHaveLength(1);
	const booted = calls.filter((call) => call.cmd === "window_shows").map((call) => call.args?.["docId"]);
	expect(booted, "this window never booted on the conversation shown elsewhere").toEqual(["scratch", "web-free"]);
});

test("a switch away from a running answer leaves it running, and the answer is still written", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openApp(page, ASKED, {
		...piHolding(transcriptOf(["What is 2+2?", "Four."])),
		"pi_send:get_state": { success: true, data: { sessionFile: SESSION_FILE, isStreaming: true } },
		"docs_read@web-other": "<!-- you -->\n\nThe other one\n\n",
	});
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	await piEvents(page, "scratch", [{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Six, beca" }] } }]);
	await expect(page.locator(".cm-content").first()).toContainText("Six, beca");
	// The left conversation's `get_state`s: the page asks before a send too (the
	// model chip), so the follower's question is the first one after the switch.
	const askedAboutLeft = () =>
		calls.filter((call) => call.cmd === "pi_send" && call.args?.["sid"] === "scratch" && (call.args?.["command"] as { type?: string })?.type === "get_state").length;
	const beforeSwitch = askedAboutLeft();
	await switchTo(page, "web-other");
	await expect(page).toHaveURL(/[?&]id=web-other/);
	expect(calls.some((call) => call.cmd === "pi_send" && (call.args?.["command"] as { type?: string })?.type === "abort"), "nothing stopped pi").toBe(false);
	// pi goes on answering the conversation this window left.
	await expect.poll(askedAboutLeft).toBeGreaterThan(beforeSwitch);
	await piEvents(page, "scratch", [
		{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Six, because 3+3=6." }] } },
		{ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Six, because 3+3=6." }] } },
		{ type: "agent_settled" },
	]);
	const written = () => calls.filter((call) => call.cmd === "docs_write" && call.args?.["id"] === "scratch").map((call) => String(call.args?.["content"]));
	await expect.poll(() => written().at(-1) ?? "").toContain("Six, because 3+3=6.");
	const last = written().at(-1)!;
	expect(last.split("Six, beca").length - 1, "the half-streamed text is not left beside the whole").toBe(1);
	expect(last.indexOf("And 3+3?")).toBeLessThan(last.indexOf("Six, because"));
	await expect(page.locator(".cm-content").first()).toContainText("The other one");
});

// ---- the conversation list, down the left

const LISTED = {
	docs_entries: [
		{ id: "web-b", modifiedMs: 3 },
		{ id: "web-a", modifiedMs: 2 },
		{ id: "web-c", modifiedMs: 1 },
	],
	"docs_read@web-a": "---\npi: v1\nsession: web-a\n---\n\n<!-- you -->\n\n# Alpha\n\nfirst\n\n",
	"docs_read@web-b": "<!-- you -->\n\nwhat is beta?\n\n",
	"docs_read@web-c": "<!-- you -->\n\n",
};

const rowLabels = (page: import("@playwright/test").Page) => page.locator("session-list .session-label").allTextContents();

test("the list shows every conversation, most recent first, named by its first line", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toEqual(["what is beta?", "Alpha", "untitled"]);
	await expect(page.locator("session-list .session-row.active")).toContainText("Alpha");
	// Each row's actions are one ⋯, not a rename and a delete button.
	await expect(page.locator("session-list .session-row").first().locator(".session-more")).toHaveCount(1);
	await expect(page.locator('session-list [aria-label="Delete session"]')).toHaveCount(0);
});

test("a conversation pi is answering shows a running dot until pi settles it", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	const beta = page.locator("session-list .session-row", { hasText: "what is beta?" });
	await expect(beta.locator(".session-status")).toHaveCount(0);
	await piEvents(page, "web-b", [{ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "Beta is" }] } }]);
	await expect(beta.locator(".session-status.streaming")).toHaveCount(1);
	await piEvents(page, "web-b", [{ type: "agent_settled" }]);
	await expect(beta.locator(".session-status")).toHaveCount(0);
});

test("a conversation saved anywhere is in the list after the store reports it", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	await page.evaluate(() => {
		const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } }).__TAURI_INTERNALS__;
		const inner = internals.invoke;
		internals.invoke = (cmd, args) =>
			cmd === "docs_entries"
				? (inner(cmd, args), Promise.resolve([{ id: "web-d", modifiedMs: 9 }, { id: "web-a", modifiedMs: 2 }]))
				: cmd === "docs_read" && (args as { id: string }).id === "web-d"
					? Promise.resolve("<!-- you -->\n\n# Delta\n\n")
					: inner(cmd, args);
	});
	await emitToPage(page, "doc-changed", "web-d");
	await expect.poll(() => rowLabels(page)).toEqual(["Delta", "Alpha"]);
});

test("clicking a conversation in the list shows it in this window", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	await page.locator("session-list .session-item", { hasText: "what is beta?" }).click();
	await expect(page).toHaveURL(/[?&]id=web-b/);
	await expect(page.locator(".cm-content").first()).toContainText("what is beta?");
	await expect(page.locator("session-list .session-row.active")).toContainText("what is beta?");
});

test("clicking the conversation this window shows does nothing", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	await page.locator("session-list .session-item", { hasText: "Alpha" }).click();
	// The control: a click on another row, after it, does switch. Had the
	// first click booted the page again, that boot would be on the record too.
	await page.locator("session-list .session-item", { hasText: "what is beta?" }).click();
	await expect(page).toHaveURL(/[?&]id=web-b/);
	await expect(page.locator(".cm-content").first()).toContainText("what is beta?");
	expect(calls.filter((call) => call.cmd === "window_shows").map((call) => call.args?.["docId"]), "the page booted once more, on beta").toEqual(["web-a", "web-b"]);
	expect(calls.filter((call) => call.cmd === "show_document").map((call) => call.args?.["docId"])).toEqual(["web-b"]);
});

test("+ starts a new conversation in this window, with a file of its own", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openAppAt(page, "/?id=web-a", LISTED);
	await page.locator("session-list .new-session").click();
	await expect(page).toHaveURL(/[?&]id=web-[0-9a-f]{8}/);
	const id = new URL(page.url()).searchParams.get("id")!;
	expect(["web-a", "web-b", "web-c"]).not.toContain(id);
	const created = calls.find((call) => call.cmd === "docs_write" && call.args?.["id"] === id);
	expect(String(created?.args?.["content"])).toContain(`session: ${id}`);
	// Written before the switch: the new page found a file, so no pi was
	// started to ask for a transcript.
	expect(calls.some((call) => call.cmd === "pi_start" && call.args?.["sid"] === id)).toBe(false);
});

// ---- a row's ⋯: open in new window, rename, duplicate, export, delete

/** Opens `label`'s row menu. */
async function rowMenu(page: import("@playwright/test").Page, label: string) {
	await expect.poll(() => rowLabels(page)).toContain(label);
	await page.locator("session-list .session-row", { hasText: label }).locator(".session-more").click();
	await expect(page.locator(".doc-block-menu")).toHaveCount(1);
	return page.locator(".doc-block-menu");
}

test("a row's ⋯ exports that conversation: the Export window is asked for, on it alone", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	const other = await rowMenu(page, "what is beta?");
	await other.getByRole("button", { name: "export…" }).click();
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "open_transfer").map((call) => call.args)).toEqual([{ kind: "export", from: "web-b" }]);
	await expect(page.locator(".doc-block-menu")).toHaveCount(0);
});

test("a row's ⋯ offers its five actions, and this window's own cannot open in another", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	const own = await rowMenu(page, "Alpha");
	await expect(own.locator("button")).toHaveText(["open in new window", "rename", "duplicate", "export…", "delete…"]);
	await expect(own.getByRole("button", { name: "open in new window" })).toBeDisabled();
	await page.keyboard.press("Escape");
	const other = await rowMenu(page, "what is beta?");
	await other.getByRole("button", { name: "open in new window" }).click();
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "open_document").map((call) => call.args)).toEqual([{ docId: "web-b" }]);
});

test("rename writes another conversation's heading through the store", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await (await rowMenu(page, "what is beta?")).getByRole("button", { name: "rename" }).click();
	const field = page.locator("session-list .session-rename");
	await field.fill("Beta, renamed");
	await field.press("Enter");
	await expect
		.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "docs_write" && (call.args as { id: string }).id === "web-b").map((call) => (call.args as { content: string }).content))
		.toEqual(["<!-- you -->\n\n# Beta, renamed\n\nwhat is beta?\n\n"]);
});

test("rename of this window's conversation is an edit in its own buffer, and undoes", async ({ page }) => {
	// An answered conversation, its prompt slot open: the ordinary state.
	const answered = "<!-- you -->\n\n# Alpha\n\nfirst\n\n<!-- pi -->\n\nok\n\n<!-- you -->\n\n";
	await openAppAt(page, "/?id=web-a", { ...LISTED, "docs_read@web-a": answered });
	await (await rowMenu(page, "Alpha")).getByRole("button", { name: "rename" }).click();
	const field = page.locator("session-list .session-rename");
	await field.fill("Alpha, renamed");
	await field.press("Enter");
	await expect.poll(() => documentText(page)).toContain("# Alpha, renamed\n\nfirst");
	// The edit took the keyboard, as a host edit does, so ⌘Z reaches it.
	await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("cm-content") ?? false)).toBe(true);
	// Two steps today: the canvas follows a host edit with a stray newline of
	// its own, undone first (a canvas issue outside this feature).
	await page.keyboard.press("ControlOrMeta+z");
	await page.keyboard.press("ControlOrMeta+z");
	await expect.poll(() => documentText(page), { message: "the rename undoes like any edit" }).toContain("# Alpha\n\nfirst");
});

test("duplicate makes a copy bound to its own session, and shows it here", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openAppAt(page, "/?id=web-a", { ...LISTED, cell_state_read: { state: { store: { n: 3 } } } });
	await (await rowMenu(page, "Alpha")).getByRole("button", { name: "duplicate" }).click();
	await expect(page).toHaveURL(/[?&]id=web-[0-9a-f]{8}/);
	const copy = new URL(page.url()).searchParams.get("id")!;
	expect(copy).not.toBe("web-a");
	const written = String(calls.find((call) => call.cmd === "docs_write" && call.args?.["id"] === copy)?.args?.["content"]);
	expect(written).toContain(`session: ${copy}`);
	expect(written).toContain("# Alpha\n\nfirst");
	expect(calls.find((call) => call.cmd === "cell_state_write" && call.args?.["id"] === copy)?.args?.["state"]).toEqual({ store: { n: 3 } });
});

test("delete asks again, then deletes another conversation whole and this window stays", async ({ page }) => {
	await openAppAt(page, "/?id=web-a", LISTED);
	await (await rowMenu(page, "what is beta?")).getByRole("button", { name: "delete…" }).click();
	expect((await ipcCalls(page)).some((call) => call.cmd === "delete_conversation"), "not on the first click").toBe(false);
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete, with its history" }).click();
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "delete_conversation").map((call) => call.args)).toEqual([{ id: "web-b" }]);
	const order = (await ipcCalls(page)).map((call) => call.cmd);
	expect(order.lastIndexOf("pi_start"), "its pi started, so it can name its transcript").toBeLessThan(order.indexOf("delete_conversation"));
	await expect(page).toHaveURL(/[?&]id=web-a/);
});

test("deleting this window's conversation moves it to the next, without writing the deleted one back", async ({ page }) => {
	const calls = await sinkCalls(page);
	await openAppAt(page, "/?id=web-a", LISTED);
	await (await rowMenu(page, "Alpha")).getByRole("button", { name: "delete…" }).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "delete, with its history" }).click();
	await expect(page).toHaveURL(/[?&]id=web-b/);
	const deleted = calls.findIndex((call) => call.cmd === "delete_conversation");
	expect(deleted).toBeGreaterThan(-1);
	expect(calls.slice(deleted).some((call) => call.cmd === "docs_write" && call.args?.["id"] === "web-a")).toBe(false);
});

// ---- the conversation list is a column of its own, which can be hidden

/** The list's box, the document column's, and the editor's text. */
async function layout(page: import("@playwright/test").Page) {
	return page.evaluate(() => {
		const box = (selector: string) => {
			const el = document.querySelector(selector);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			const shown = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
			return shown ? { left: r.left, right: r.right, width: r.width } : null;
		};
		const aside = document.querySelector(".conversations");
		return {
			list: box(".conversations"),
			text: box(".cm-content"),
			divider: aside ? parseFloat(getComputedStyle(aside).borderRightWidth) : 0,
			background: aside ? getComputedStyle(aside).backgroundColor : "",
			position: aside ? getComputedStyle(aside).position : "",
		};
	});
}

const toggle = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /conversation list/i });

test("on a wide window the list is a column beside the conversation, with a line between them", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	const { list, text, divider } = await layout(page);
	expect(list).not.toBeNull();
	expect(text!.left, "the conversation starts past the list").toBeGreaterThanOrEqual(list!.right);
	expect(divider, "a line separates them").toBeGreaterThan(0);
	// And only that line: the focused editor draws no outline of its own there.
	await page.locator(".cm-line").last().click();
	expect(await page.evaluate(() => getComputedStyle(document.querySelector(".cm-editor.cm-focused")!).outlineStyle)).toBe("none");
});

test("the list hides and shows from its button, and the conversation takes the width", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
	await toggle(page).click();
	await expect.poll(async () => (await layout(page)).list).toBeNull();
	await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
	// Remembered: the next page this window boots keeps it hidden.
	await page.reload();
	await expect(page.locator(".cm-line").first()).toBeVisible();
	expect((await layout(page)).list).toBeNull();
	await toggle(page).click();
	await expect.poll(async () => (await layout(page)).list).not.toBeNull();
});

test("on a narrow window the list starts hidden, opens over the conversation with a surface, and follows a resize", async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 800 });
	await openAppAt(page, "/?id=web-a", LISTED);
	await expect(page.locator(".cm-line").first()).toBeVisible();
	expect((await layout(page)).list, "hidden where it would crowd the text").toBeNull();
	await toggle(page).click();
	const open = await layout(page);
	expect(open.list).not.toBeNull();
	expect(open.position, "over the conversation, not squeezing it").toBe("fixed");
	expect(open.background, "an opaque surface, not see-through rows").not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
	await toggle(page).click();
	// Wider again, with no choice made: the list comes back as a column.
	await page.reload();
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect.poll(async () => (await layout(page)).list).not.toBeNull();
	const wide = await layout(page);
	expect(wide.position).not.toBe("fixed");
	expect(wide.text!.left).toBeGreaterThanOrEqual(wide.list!.right);
});

// ── The model and effort pickers ─────────────────────────────────────────────
// What a conversation runs is pi's answer, never the click: pi can refuse a
// model and clamps the effort to what a model takes, so the chip names what
// `get_state` says after every change.

const RUNNING_STATE = { success: true, data: { model: { provider: "openai", id: "gpt-9", name: "GPT 9" }, thinkingLevel: "high", messageCount: 2 } };
const PI_MODELS = {
	success: true,
	data: {
		models: [
			{ provider: "openai", id: "gpt-9", name: "GPT 9" },
			{ provider: "google", id: "gem-2" },
			{ provider: "openai", id: "gpt-9-mini", name: "GPT 9 mini" },
		],
	},
};
const PICKER = { pi_running: true, "pi_send:get_state": RUNNING_STATE, "pi_send:get_available_models": PI_MODELS };
/** What pi answers `get_session_stats` with for a conversation two turns in:
 *  pi-coding-agent's `SessionStats`, the part of it the chip reads. */
const STATS = {
	success: true,
	data: {
		tokens: { input: 1200, output: 300, cacheRead: 4000, cacheWrite: 0, total: 5500 },
		cost: 0.0123,
		contextUsage: { tokens: 5000, contextWindow: 200000, percent: 2.5 },
	},
};

const modelPill = (page: import("@playwright/test").Page) => page.locator('.model-chip [data-pick="model"]');
const effortPill = (page: import("@playwright/test").Page) => page.locator('.model-chip [data-pick="effort"]');

/** The `pi_send`s of one command type, as the page sent them. */
async function sentOfType(page: import("@playwright/test").Page, type: string): Promise<Record<string, unknown>[]> {
	return (await ipcCalls(page))
		.filter((call) => call.cmd === "pi_send" && (call.args as { command?: { type?: string } }).command?.type === type)
		.map((call) => (call.args as { command: Record<string, unknown> }).command);
}

test("the chip names the model pi runs, and a model picked from pi's list goes to pi", { tag: "@smoke" }, async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:set_model": { success: true, data: {} } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await expect(effortPill(page)).toHaveText("high");

	await modelPill(page).click();
	const menu = page.locator(".doc-block-menu");
	await expect(menu.locator(".doc-menu-label")).toHaveText(["openai", "google", "this conversation"]);
	await expect(menu.getByRole("button", { name: "GPT 9 ·" }), "the running model is marked, not offered").toBeDisabled();
	const asked = (await sentOfType(page, "get_state")).length;
	await menu.getByRole("button", { name: "gem-2" }).click();
	await expect.poll(() => sentOfType(page, "set_model")).toEqual([{ type: "set_model", provider: "google", modelId: "gem-2" }]);
	await expect.poll(async () => (await sentOfType(page, "get_state")).length, "the chip asks pi what it runs now").toBeGreaterThan(asked);
	await expect(page.locator("#status")).toHaveText("");
});

// A send that rewrites pi's history restarts pi, and pi restores a session's
// model from the last thing in the transcript that names one: after a rewrite
// that is a reply the document kept, which names the model that answered THEN.
// So the page puts the restarted pi back on the model it ran.

const stateOf = (model: { provider: string; id: string; name?: string }, thinkingLevel: string) => ({
	success: true,
	data: { model, thinkingLevel, messageCount: 2, sessionFile: SESSION_FILE },
});
const ON_PICK = stateOf({ provider: "google", id: "gem-2" }, "medium");
const ON_OLD = stateOf({ provider: "openai", id: "gpt-9", name: "GPT 9" }, "high");

/** pi running the picked model, and coming back from a rewrite on the old one:
 *  until it takes a `set_model`, or for good when it refuses with `setModel`. */
const restartedOnOld = (setModel: { success: boolean; error?: string; data?: unknown }): Answers =>
	piHolding(transcriptOf(["What is 2+2?", "Four."]), {
		pi_running: true,
		"pi_send:get_state": {
			afterCall: "pi_rebuild",
			before: ON_PICK,
			after: setModel.success ? { afterCall: "pi_send:set_model", before: ON_OLD, after: ON_PICK } : ON_OLD,
		},
		"pi_send:set_model": setModel,
		"pi_send:set_thinking_level": { success: true },
	});

/** The index of the first call of `cmd`, or of a `pi_send` of that type, among all calls. */
async function firstCall(page: import("@playwright/test").Page, key: string): Promise<number> {
	return (await ipcCalls(page)).findIndex((call) => call.cmd === key || (call.cmd === "pi_send" && (call.args as { command?: { type?: string } }).command?.type === key));
}

test("a picked model outlives the restart a rewritten history causes", async ({ page }) => {
	await openApp(page, ASKED.replace("Four.", "Five."), restartedOnOld({ success: true, data: {} }));
	await expect(modelPill(page)).toHaveText("gem-2");
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	expect(await sentOfType(page, "set_model"), "pi is put back on the model it ran").toEqual([{ type: "set_model", provider: "google", modelId: "gem-2" }]);
	expect(await sentOfType(page, "set_thinking_level"), "and on its effort, which a model change resets").toEqual([{ type: "set_thinking_level", level: "medium" }]);
	const [rebuilt, set, prompt] = [await firstCall(page, "pi_rebuild"), await firstCall(page, "set_model"), await firstCall(page, "prompt")];
	expect(rebuilt, "the history was rewritten").toBeGreaterThan(-1);
	expect(set, "after the restart").toBeGreaterThan(rebuilt);
	expect(set, "before the prompt").toBeLessThan(prompt);
	await expect(modelPill(page)).toHaveText("gem-2");
	await expect(page.locator("#status")).toHaveText("");
});

test("a model pi will not go back to after a rewrite is said, the prompt is held, and the chip names what pi runs", async ({ page }) => {
	await openApp(page, ASKED.replace("Four.", "Five."), restartedOnOld({ success: false, error: "No API key for google/gem-2" }));
	await expect(modelPill(page)).toHaveText("gem-2");
	await sendAtTail(page, "Are you sure?");
	await expect(page.locator("#status")).toContainText("pi restarted on openai/gpt-9 and would not go back to google/gem-2: No API key for google/gem-2");
	expect(await promptsSent(page), "nothing goes to a model the user did not pick").toEqual([]);
	await expect(modelPill(page), "the chip asked pi again").toHaveText("GPT 9");
	expect(await documentOf(page), "the prompt is still the user's to send").toContain("Are you sure?");
});

test("a rewrite that leaves pi on its model changes no model", async ({ page }) => {
	await openApp(page, ASKED.replace("Four.", "Five."), piHolding(transcriptOf(["What is 2+2?", "Four."]), { pi_running: true, "pi_send:get_state": ON_PICK }));
	await sendAtTail(page, "Are you sure?");
	await expect.poll(async () => (await promptsSent(page)).length).toBe(1);
	expect(await rebuildsAsked(page)).toHaveLength(1);
	expect(await sentOfType(page, "set_model")).toEqual([]);
	expect(await sentOfType(page, "set_thinking_level")).toEqual([]);
});

test("a model pi refuses is said, and the chip goes on naming what pi runs", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:set_model": { success: false, error: "No API key for google/gem-2" } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "gem-2" }).click();
	await expect(page.locator("#status")).toHaveText("Could not switch to gem-2: No API key for google/gem-2");
	await expect(modelPill(page)).toHaveText("GPT 9");
});

test("the effort pill offers the levels pi says the running model takes", async ({ page }) => {
	await openApp(page, TWO_ASKED, {
		...PICKER,
		"pi_send:get_available_thinking_levels": { success: true, data: { levels: ["off", "low", "high"] } },
		"pi_send:set_thinking_level": { success: true },
	});
	await effortPill(page).click();
	const menu = page.locator(".doc-block-menu");
	await expect(menu.getByRole("button")).toHaveText(["off", "low", "high ·"]);
	await menu.getByRole("button", { name: "low" }).click();
	await expect.poll(() => sentOfType(page, "set_thinking_level")).toEqual([{ type: "set_thinking_level", level: "low" }]);
});

test("the chip starts no pi to paint itself; a click on it does", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, pi_running: false });
	await expect(modelPill(page)).toHaveText("model");
	await expect(effortPill(page)).toHaveText("effort");
	expect((await ipcCalls(page)).filter((call) => call.cmd === "pi_start"), "nothing started to fill a chip").toEqual([]);
	await modelPill(page).click();
	await expect(page.locator(".doc-block-menu").getByRole("button", { name: "gem-2" })).toBeVisible();
	expect((await ipcCalls(page)).some((call) => call.cmd === "pi_start")).toBe(true);
	await expect(modelPill(page), "pi runs now, so the chip names its model").toHaveText("GPT 9");
});

test("the effort the user picked outlives a model that lacks it, and returns with one that has it", async ({ page }) => {
	// pi starts a switched model on its settings' default effort, not the user's
	// pick, and clamps an untaken level up to the next one it takes. So the page
	// keeps the pick and hands it to pi after every model change: B, taking no
	// medium, runs high; A again runs medium, not the high B left behind.
	await openApp(page, TWO_ASKED, {
		...PICKER,
		"pi_send:set_model": { success: true, data: {} },
		"pi_send:set_thinking_level": { success: true },
		"pi_send:get_available_thinking_levels": { success: true, data: { levels: ["low", "medium", "high"] } },
	});
	await effortPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "medium" }).click();
	await expect.poll(async () => (await sentOfType(page, "set_thinking_level")).length).toBe(1);
	for (const name of ["gem-2", "GPT 9 mini"]) {
		await modelPill(page).click();
		await page.locator(".doc-block-menu").getByRole("button", { name }).click();
	}
	await expect.poll(async () => (await sentOfType(page, "set_model")).length).toBe(2);
	await expect.poll(async () => (await sentOfType(page, "set_thinking_level")).map((command) => command["level"])).toEqual(["medium", "medium", "medium"]);
	const order = (await ipcCalls(page)).flatMap((call) => {
		const type = (call.args as { command?: { type?: string } }).command?.type;
		return call.cmd === "pi_send" && (type === "set_model" || type === "set_thinking_level") ? [type] : [];
	});
	expect(order, "the pick follows each model switch").toEqual(["set_thinking_level", "set_model", "set_thinking_level", "set_model", "set_thinking_level"]);
});

test("the effort the user picked is kept across a reload", async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("piary-effort:scratch", "medium"));
	await openApp(page, ASKED, { ...PICKER, "pi_send:set_model": { success: true, data: {} }, "pi_send:set_thinking_level": { success: true } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	await modelPill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "gem-2" }).click();
	await expect.poll(async () => (await sentOfType(page, "set_thinking_level")).map((command) => command["level"])).toEqual(["medium"]);
});

test("the model menu opens above the chip, inside the window", async ({ page }) => {
	await openApp(page, TWO_ASKED, PICKER);
	await modelPill(page).click();
	const menu = page.locator(".doc-block-menu");
	await expect(menu).toBeVisible();
	const [pill, box] = [(await modelPill(page).boundingBox())!, (await menu.boundingBox())!];
	expect(box.y + box.height, "the menu ends above the pill").toBeLessThanOrEqual(pill.y);
	expect(box.y).toBeGreaterThanOrEqual(0);
});

test("the chip is clear of the block rail and the canvas's text", async ({ page }) => {
	await openApp(page, TWO_ASKED, PICKER);
	await expect(modelPill(page)).toHaveText("GPT 9");
	const chip = (await page.locator(".model-chip").boundingBox())!;
	const viewport = page.viewportSize()!;
	expect(chip.y + chip.height, "at the bottom edge").toBeGreaterThan(viewport.height - 64);
	expect(chip.x + chip.width, "at the right edge").toBeGreaterThan(viewport.width - 96);
	// What is under the chip's centre is the chip, so neither the rail nor the
	// text is drawn over it.
	const onTop = await page.locator(".model-chip").evaluate((el) => {
		const r = el.getBoundingClientRect();
		const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
		return !!hit && el.contains(hit);
	});
	expect(onTop).toBe(true);
});

const STAGED = { provider: "google", modelId: "gem-2", name: "gem-2", thinking: "low" };

/** Stages `pick` for `sid` before the page loads, as another window would. */
const stage = (page: import("@playwright/test").Page, sid: string, pick: unknown) =>
	page.addInitScript(([key, value]) => localStorage.setItem(key as string, value as string), [`piary-pick:${sid}`, JSON.stringify(pick)] as const);

const stagedFor = (page: import("@playwright/test").Page, sid: string) => page.evaluate((key) => localStorage.getItem(key), `piary-pick:${sid}`);

/** Each `pi_send` for `sid`, with its index among all calls. */
async function sentTo(page: import("@playwright/test").Page, sid: string): Promise<({ index: number } & Record<string, unknown>)[]> {
	return (await ipcCalls(page)).flatMap((call, index) => {
		const args = call.args as { sid?: string; command?: Record<string, unknown> };
		return call.cmd === "pi_send" && args.sid === sid ? [{ index, ...args.command! }] : [];
	});
}

test("a new conversation runs the pick staged for it, given to pi before its first prompt", async ({ page }) => {
	await stage(page, "scratch", STAGED);
	const fresh = { success: true, data: { ...RUNNING_STATE.data, messageCount: 0, sessionFile: SESSION_FILE } };
	await openApp(page, "<!-- you -->\n\n", { "pi_send:get_entries": { success: true, data: { entries: [], leafId: null } }, "pi_send:get_state": fresh });
	await expect(modelPill(page), "the chip names what the conversation will run").toHaveText("gem-2");
	await expect(effortPill(page)).toHaveText("low");
	await sendAtTail(page, "Hi");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	const sent = await sentTo(page, "scratch");
	const at = (type: string) => sent.find((command) => command["type"] === type);
	expect(at("set_model")).toMatchObject({ provider: "google", modelId: "gem-2" });
	expect(at("set_thinking_level")).toMatchObject({ level: "low" });
	expect(at("set_model")!.index, "the model is set before the prompt").toBeLessThan(at("prompt")!.index);
	expect(await stagedFor(page, "scratch"), "a staged pick is taken once").toBeNull();
});

test("a staged pick never re-points a conversation that already has answers", async ({ page }) => {
	await stage(page, "scratch", STAGED);
	await openApp(page, ASKED, piHolding(transcriptOf(["What is 2+2?", "Four."]), { "pi_send:get_state": { success: true, data: { ...RUNNING_STATE.data, sessionFile: SESSION_FILE } } }));
	await sendAtTail(page, "And 3+3?");
	await expect.poll(async () => (await promptCommands(page)).length).toBe(1);
	expect(await sentOfType(page, "set_model")).toEqual([]);
	expect(await stagedFor(page, "scratch")).toBeNull();
});

test("New Document starts on this window's model and effort", async ({ page }) => {
	await openApp(page, ASKED, PICKER);
	await expect(modelPill(page)).toHaveText("GPT 9");
	await emitToPage(page, "menu", "new-document");
	await expect.poll(() => openedDocs(page)).toHaveLength(1);
	const [id] = await openedDocs(page);
	expect(JSON.parse((await stagedFor(page, id!))!)).toEqual({ provider: "openai", modelId: "gpt-9", name: "GPT 9", thinking: "high" });
});

test("a subsession's child runs its parent's model and effort from its first prompt", async ({ page }) => {
	await openApp(page, ASKED, PICKER);
	await expect(modelPill(page)).toHaveText("GPT 9");
	await sendSubagent(page);
	const child = await childSid(page);
	await expect.poll(async () => (await sentTo(page, child)).some((command) => command["type"] === "prompt")).toBe(true);
	const sent = await sentTo(page, child);
	const at = (type: string) => sent.find((command) => command["type"] === type);
	expect(at("set_model")).toMatchObject({ provider: "openai", modelId: "gpt-9" });
	expect(at("set_thinking_level")).toMatchObject({ level: "high" });
	expect(at("set_thinking_level")!.index).toBeLessThan(at("prompt")!.index);
});

test("Model… and Effort… in the menu open the chip's own menus", async ({ page }) => {
	// ⌥P and ⌥T, Claude Code's chords: they open the picker rather than step
	// through it, so the menu shows every choice before one is made.
	await openApp(page, ASKED, { ...PICKER, "pi_send:get_available_thinking_levels": { success: true, data: { levels: ["off", "high"] } } });
	await expect(modelPill(page)).toHaveText("GPT 9");
	const menu = page.locator(".doc-block-menu");
	await emitToPage(page, "menu", "choose-model");
	await expect(menu.getByRole("button", { name: "gem-2" })).toBeVisible();
	await expect(menu.getByRole("button", { name: "GPT 9 mini" }), "the keyboard is in the menu, on its first choice").toBeFocused();
	await page.keyboard.press("Escape");
	await expect(menu).toHaveCount(0);
	await emitToPage(page, "menu", "choose-effort");
	await expect(menu.getByRole("button")).toHaveText(["off", "high ·"]);
	expect(await sentOfType(page, "set_model"), "opening a menu chooses nothing").toEqual([]);
});

// ── The context meter and the session's totals, in the chip ──────────────────
// pi's own numbers: `get_session_stats` seeds them, each assistant reply adds
// its `usage`, and a subsession's totals roll into its parent's.

const meter = (page: import("@playwright/test").Page) => page.locator(".model-chip .usage-meter");
const totals = (page: import("@playwright/test").Page) => page.locator(".model-chip .usage-totals");

/** Replaces what the stubbed `invoke` answers `key` with, from now on. */
const answerFrom = (page: import("@playwright/test").Page, key: string, answer: unknown) =>
	page.evaluate(([key, answer]) => ((window as unknown as { __answers: Answers }).__answers[key as string] = answer), [key, answer] as const);

test("the chip shows pi's context use and the session's totals", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_session_stats": STATS });
	await expect(meter(page)).toHaveText("5.0k / 200k");
	await expect(meter(page)).toHaveAttribute("title", /^context: 5\.0k of 200k \(3%\) — full sharpness under 50%/);
	await expect(meter(page).locator(".usage-tick"), "ticks at 50, 70 and 85%").toHaveCount(3);
	await expect(meter(page).locator(".usage-fill")).not.toHaveClass(/warn|over/);
	await expect(totals(page)).toHaveText("↑1.2k ↓300 R4.0k $0.0123");
	await expect(totals(page)).toHaveAttribute("title", "session tokens");
	// Left of the pills, in the chip's own row.
	const [usage, pill] = [(await page.locator(".model-chip .usage").boundingBox())!, (await modelPill(page).boundingBox())!];
	expect(usage.x + usage.width).toBeLessThanOrEqual(pill.x);
	expect(Math.abs(usage.y + usage.height / 2 - (pill.y + pill.height / 2))).toBeLessThan(4);
});

test("no pi is started to paint the usage", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, pi_running: false, "pi_send:get_session_stats": STATS });
	await expect(modelPill(page)).toHaveText("model");
	await afterFrames(page);
	expect((await ipcCalls(page)).filter((call) => call.cmd === "pi_start")).toEqual([]);
	expect(await sentOfType(page, "get_session_stats")).toEqual([]);
	await expect(page.locator(".model-chip .usage")).toBeHidden();
});

test("a reply adds its usage", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_session_stats": STATS });
	await expect(totals(page)).toHaveText("↑1.2k ↓300 R4.0k $0.0123");
	await piEvents(page, "scratch", [final("Six.", usageOf(800, 200, 5000, 0, 0.002))]);
	await expect(totals(page)).toHaveText("↑2.0k ↓500 R9.0k $0.0143");
	await expect(meter(page), "what the last step occupied").toHaveText("6.0k / 200k");
	// A child's reply is the child's: it never moves this conversation's meter.
	await piEvents(page, "web-other", [final("Elsewhere.", usageOf(90_000, 1000))]);
	await afterFrames(page);
	await expect(meter(page)).toHaveText("6.0k / 200k");
	await expect(totals(page)).toHaveText("↑2.0k ↓500 R9.0k $0.0143");
});

test("a run in flight is never reset by a seed", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, pi_running: false, "pi_send:get_session_stats": STATS });
	await piEvents(page, "scratch", [{ type: "agent_start" }, final("Six.", usageOf(800, 200))]);
	await expect(totals(page)).toHaveText("↑800 ↓200");
	// Starting pi would seed the chip, but the run has been adding to it.
	await emitToPage(page, "menu", "choose-model");
	await expect(modelPill(page)).toHaveText("GPT 9");
	await afterFrames(page);
	await expect(totals(page)).toHaveText("↑800 ↓200");
	// Settled, pi's own totals are read again and win.
	await piEvents(page, "scratch", [settled()]);
	await expect(totals(page)).toHaveText("↑1.2k ↓300 R4.0k $0.0123");
});

test("a model change re-reads the window size", async ({ page }) => {
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_session_stats": STATS, "pi_send:set_model": { success: true, data: {} } });
	await expect(meter(page)).toHaveText("5.0k / 200k");
	const gem = { success: true, data: { ...RUNNING_STATE.data, model: { provider: "google", id: "gem-2", contextWindow: 400_000 } } };
	await modelPill(page).click();
	const choice = page.locator(".doc-block-menu").getByRole("button", { name: "gem-2" });
	await expect(choice).toBeEnabled();
	// What pi says once it has switched: the menu was opened on the old model.
	await answerFrom(page, "pi_send:get_state", gem);
	await answerFrom(page, "pi_send:get_session_stats", { success: true, data: { ...STATS.data, contextUsage: { ...STATS.data.contextUsage, contextWindow: 400_000 } } });
	await choice.click();
	await expect(meter(page)).toHaveText("5.0k / 400k");
	await expect(totals(page), "a model change is not a reset").toHaveText("↑1.2k ↓300 R4.0k $0.0123");
});

test("a parent's totals include its subsession's", async ({ page }) => {
	const childStats = {
		success: true,
		data: { tokens: { input: 1000, output: 100, cacheRead: 0, cacheWrite: 0, total: 1100 }, cost: 0.01, contextUsage: { tokens: 90_000, contextWindow: 200_000 } },
	};
	await openApp(page, WITH_CARD, {
		...PICKER,
		"pi_send:get_session_stats": STATS,
		[`pi_send:get_session_stats@${CHILD}`]: childStats,
		[`pi_send:get_state@${CHILD}`]: { success: true, data: { isStreaming: false } },
	});
	await expect(totals(page)).toHaveText("↑2.2k ↓400 R4.0k $0.0223");
	await expect(totals(page)).toHaveAttribute("title", "session tokens, sub-agents included");
	await expect(meter(page), "the meter is this conversation's alone").toHaveText("5.0k / 200k");
	// The child's next run settles, and the roll-up reads it again.
	await answerFrom(page, `pi_send:get_session_stats@${CHILD}`, { success: true, data: { ...childStats.data, tokens: { ...childStats.data.tokens, input: 3000 } } });
	await piEvents(page, CHILD, [{ type: "agent_start" }, settled()]);
	await expect(totals(page)).toHaveText("↑4.2k ↓400 R4.0k $0.0223");
});

test("a subsession that used nothing is not said to be included", async ({ page }) => {
	await openApp(page, WITH_CARD, {
		...PICKER,
		"pi_send:get_session_stats": STATS,
		[`pi_send:get_session_stats@${CHILD}`]: { success: true, data: { tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0, contextUsage: null } },
		[`pi_send:get_state@${CHILD}`]: { success: true, data: { isStreaming: false } },
	});
	await expect(totals(page)).toHaveText("↑1.2k ↓300 R4.0k $0.0123");
	await expect(totals(page)).toHaveAttribute("title", "session tokens");
});

test("⌘← and ⌘→ go to the line's start and end, and ⌥← moves by word, as in every macOS editor", async ({ page }) => {
	await openApp(page, "# Title\n\nalpha beta gamma\n");
	await page.locator(".cm-line", { hasText: "alpha beta gamma" }).click();
	await page.keyboard.press("Meta+ArrowRight");
	await page.keyboard.press("Alt+ArrowLeft");
	await page.keyboard.type("X");
	await page.keyboard.press("Meta+ArrowLeft");
	await page.keyboard.type("<");
	await page.keyboard.press("Meta+ArrowRight");
	await page.keyboard.type(">");
	await expect(page.locator(".cm-line", { hasText: "alpha" })).toHaveText("<alpha beta Xgamma>");
});

// ---- focus mode: the side controls slide off to their edges (app/focus.ts)

/** The 8px each control leaves on screen in focus mode, plus a pixel of rounding. */
const SLIVER = 9;

/** Boots the page with focus mode already chosen, as a window opened after the choice does. */
async function openFocused(page: import("@playwright/test").Page) {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.addInitScript(() => localStorage.setItem("piary-focus", "1"));
	await openAppAt(page, "/?id=web-a", { ...LISTED, "docs_read@web-a": `---\npi: v1\nsession: web-a\n---\n\n${ASKED}` });
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
}

/** Where each side control sits on screen: off at its edge but for the sliver, or back. */
function placement(page: import("@playwright/test").Page) {
	return page.evaluate((sliver) => {
		const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
		const [list, button, rail, chip] = [".conversations", ".conversations-toggle", "chat-index", ".model-chip"].map(rect);
		return {
			list: list!.right <= sliver ? "off" : list!.left >= 0 ? "back" : "moving",
			button: button!.right <= sliver ? "off" : button!.left >= 0 ? "back" : "moving",
			rail: rail!.left >= innerWidth - sliver ? "off" : rail!.right <= innerWidth ? "back" : "moving",
			chip: chip!.top >= innerHeight - sliver ? "off" : chip!.bottom <= innerHeight ? "back" : "moving",
		};
	}, SLIVER);
}

const ALL_OFF = { list: "off", button: "off", rail: "off", chip: "off" };

test("focus mode slides the list, the rail and the chip off-screen", async ({ page }) => {
	await openFocused(page);
	await expect.poll(() => placement(page)).toEqual(ALL_OFF);
	// Off, not reflowed around: the conversation takes the width the list had.
	const text = (await page.locator(".cm-content").boundingBox())!;
	expect(text.x, "the text is not pushed right by a hidden list").toBeLessThan(240);
});

test("the pointer near an edge brings back that edge's control only", async ({ page }) => {
	await openFocused(page);
	await expect.poll(() => placement(page)).toEqual(ALL_OFF);
	await page.mouse.move(5, 400);
	await expect.poll(() => placement(page)).toEqual({ ...ALL_OFF, list: "back", button: "back" });
	await page.mouse.move(1275, 400);
	await expect.poll(() => placement(page)).toEqual({ ...ALL_OFF, rail: "back" });
	await page.mouse.move(640, 795);
	await expect.poll(() => placement(page)).toEqual({ ...ALL_OFF, chip: "back" });
	await page.mouse.move(640, 400);
	await expect.poll(() => placement(page)).toEqual(ALL_OFF);
});

test("the list's own button still hides and shows it while focus mode reveals it", async ({ page }) => {
	await openFocused(page);
	await page.mouse.move(5, 400);
	await expect.poll(() => placement(page)).toEqual({ ...ALL_OFF, list: "back", button: "back" });
	await toggle(page).click();
	await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
	await expect(page.locator(".conversations")).toBeHidden();
	await toggle(page).click();
	await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
	await expect.poll(() => placement(page)).toEqual({ ...ALL_OFF, list: "back", button: "back" });
});

test("the status line stays visible in focus mode", async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem("piary-focus", "1"));
	// A document in a version this build does not know is refused on save
	// (document-format.md §Frontmatter): a notice the page raises by itself.
	await openApp(page, "---\npi: v9\n---\n\n<!-- you -->\n\nwritten by a newer Piary\n");
	await page.locator(".cm-content").click();
	await page.keyboard.press("Control+End");
	await page.keyboard.type(" Typed.");
	const status = page.locator("#status");
	await expect(status).toContainText("Not saved", { timeout: 5000 });
	await expect(status).toBeInViewport({ ratio: 1 });
	expect(await status.evaluate((line) => getComputedStyle(line.closest(".doc-overlays")!).opacity)).toBe("1");
});

test("View ▸ Focus Mode turns focus mode on and off, and the choice survives a reload", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openAppAt(page, "/?id=web-a", { ...LISTED, "docs_read@web-a": `---\npi: v1\nsession: web-a\n---\n\n${ASKED}` });
	await expect.poll(() => rowLabels(page)).toHaveLength(3);
	const shown = { list: "back", button: "back", rail: "back", chip: "back" };
	await expect.poll(() => placement(page)).toEqual(shown);
	await emitToPage(page, "menu", "toggle-focus");
	await expect.poll(() => placement(page)).toEqual(ALL_OFF);
	await reload(page);
	await expect.poll(() => placement(page)).toEqual(ALL_OFF);
	await emitToPage(page, "menu", "toggle-focus");
	await expect.poll(() => placement(page)).toEqual(shown);
	await reload(page);
	await expect.poll(() => placement(page)).toEqual(shown);
});

// The hint under the prompt names the chords the keymap binds: ⇧⌘⏎ is the
// follow-up, idle and mid-turn alike.
test("the prompt's hints name ⇧⌘⏎ as the follow-up", async ({ page }) => {
	await openApp(page, ASKED);
	const hint = (selector: string) =>
		page.evaluate((sel) => {
			const line = document.querySelector(sel);
			return line ? getComputedStyle(line, "::after").content.replace(/"\s*"/g, "") : null;
		}, selector);
	await expect.poll(() => hint(".cm-line.doc-line-ghost")).toContain("⇧⌘⏎ follow up");
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("and 3+3?");
	await expect.poll(() => hint(".cm-line.doc-line-draft")).toContain("⇧⌘⏎ send as follow-up");
});

// The hint's key glyphs come from one font. The canvas's serif stack reaches
// `ui-serif` next, which lacks ⇧, so WebKit drew ⇧ alone from Hiragino — a
// hairline arrow that read as "| ⌘⏎". A font holding all four glyphs must come
// before it (src/styles/document.css).
test("the prompt's hint draws ⌥⌘⇧⏎ from one font, before the serif fallback", async ({ page }) => {
	await openApp(page, ASKED);
	const stack = (selector: string) =>
		page.evaluate((sel) => {
			const line = document.querySelector(sel);
			return line ? getComputedStyle(line, "::after").fontFamily : null;
		}, selector);
	const keysBeforeFallback = (family: string | null) => {
		const fonts = (family ?? "").split(",").map((f) => f.trim().replace(/^"|"$/g, ""));
		const keys = fonts.indexOf("Lucida Grande");
		const fallback = fonts.indexOf("ui-serif");
		return keys !== -1 && (fallback === -1 || keys < fallback);
	};
	await expect.poll(async () => keysBeforeFallback(await stack(".cm-line.doc-line-ghost"))).toBe(true);
	await page.locator(".cm-line").last().click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.type("and 3+3?");
	await expect.poll(async () => keysBeforeFallback(await stack(".cm-line.doc-line-draft"))).toBe(true);
});

/** A document whose answer is one `a2ui` view of `components`. */
const a2uiDoc = (components: unknown[], dataModel?: unknown) =>
	`<!-- you -->\n\nshow me\n\n<!-- pi -->\n\n<!-- pi:view a2ui #toolu_a -->\n\n\`\`\`json\n${JSON.stringify({ components, dataModel })}\n\`\`\`\n\n<!-- pi:result #toolu_a -->\n\n\`\`\`\nok\n\`\`\`\n\n<!-- you -->\n\n`;

// Piary's A2UI Chart draws with Plot, the library a cell charts with, so only a
// real engine shows it drew: categories in the order the data
// gives them, the canvas's palette, a value axis wide enough for its longest
// tick, and the width of the answer filled (src/document/a2ui-figures.ts).
test("an a2ui chart draws its days in data order, in the palette, with six-digit ticks unclipped", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 1000 });
	const days = ["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => ({ day, opened: [96, 88, 79, 81, 68][i] }));
	const cash = [0, 6, 12].map((month) => ({ month, cash: 480000 - month * 26000 }));
	await openApp(
		page,
		a2uiDoc([
			{ id: "root", component: "Column", children: ["days", "cash", "table"] },
			{ id: "days", component: "Chart", mark: "bar", x: "day", y: "opened", data: days },
			{ id: "cash", component: "Chart", mark: "line", x: "month", y: "cash", unit: "$", data: cash },
			{
				id: "table",
				component: "Table",
				columns: ["vendor", "notes", { key: "price", unit: "$" }],
				rows: [{ vendor: "Rollbar", notes: "SSO only on the enterprise plan, which is quoted per team and not listed anywhere public", price: 21 }],
			},
		]),
	);
	const charts = page.locator("piary-a2ui-chart");
	await expect(charts.nth(1)).toHaveAttribute("data-drawn", "", { timeout: 20_000 });
	await expect(charts.first()).toHaveAttribute("data-drawn", "");
	const bars = await charts.first().evaluate((chart) => {
		const svg = chart.querySelector("svg")!;
		const ticks = [...svg.querySelectorAll("[aria-label='x-axis tick label'] text")].map((t) => t.textContent);
		const bar = svg.querySelector("[aria-label='bar'] rect")!;
		return { ticks, fill: getComputedStyle(bar).fill, chart3: getComputedStyle(chart).getPropertyValue("--chart-3").trim() };
	});
	expect(bars.ticks).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
	const swatch = await page.evaluate((colour) => {
		const probe = document.createElement("div");
		probe.style.color = colour;
		document.body.append(probe);
		const value = getComputedStyle(probe).color;
		probe.remove();
		return value;
	}, bars.chart3);
	expect(bars.fill).toBe(swatch);
	const fit = await charts.nth(1).evaluate((chart) => {
		const svg = chart.querySelector("svg")!.getBoundingClientRect();
		const labels = [...chart.querySelectorAll("[aria-label='y-axis tick label'] text")];
		const left = Math.min(...labels.map((t) => t.getBoundingClientRect().left));
		return { svgLeft: svg.left, labelLeft: left, longest: Math.max(...labels.map((t) => (t.textContent ?? "").length)), width: svg.width, host: chart.clientWidth };
	});
	expect(fit.longest).toBeGreaterThanOrEqual("$480,000".length);
	expect(fit.labelLeft).toBeGreaterThanOrEqual(fit.svgLeft);
	expect(Math.abs(fit.width - fit.host)).toBeLessThan(2);
	const table = await page.locator(".piary-table").evaluate((t) => ({
		overflow: t.scrollWidth - (t.parentElement?.clientWidth ?? 0),
		font: getComputedStyle(t).fontFamily,
		digits: getComputedStyle(t).fontVariantNumeric,
	}));
	expect(table.overflow).toBeLessThanOrEqual(0);
	expect(table.font).not.toMatch(/mono/i);
	expect(table.digits).toContain("tabular-nums");
});

// A bar's value axis ends on a round tick above the tallest bar, and ordered
// series take a ramp from the theme's tokens — a softened red end, a grey
// middle, a blue end — resolved to colours Plot can set as SVG attributes.
test("an a2ui chart ends its axis above its tallest bar, and draws an ordered scale as a diverging ramp", async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 1000 });
	const days = ["Mon", "Tue"].map((day, i) => ({ day, opened: [96, 88][i] }));
	const answers = ["Disagree", "Neutral", "Agree"].map((a, i) => ({ q: "Docs", a, pct: [39.2, 28.8, 32.1][i] }));
	await openApp(
		page,
		a2uiDoc([
			{ id: "root", component: "Column", children: ["days", "scale"] },
			{ id: "days", component: "Chart", mark: "bar", x: "day", y: "opened", data: days },
			{ id: "scale", component: "Chart", mark: "barH", x: "q", y: "pct", series: "a", unit: "%", scheme: "diverging", data: answers },
		]),
	);
	const charts = page.locator("piary-a2ui-chart");
	await expect(charts.nth(1)).toHaveAttribute("data-drawn", "", { timeout: 20_000 });
	await expect(charts.first()).toHaveAttribute("data-drawn", "");
	const top = await charts.first().evaluate((chart) =>
		Math.max(...[...chart.querySelectorAll("[aria-label='y-axis tick label'] text")].map((t) => Number(t.textContent))),
	);
	expect(top).toBeGreaterThanOrEqual(96);
	const scale = await charts.nth(1).evaluate((chart) => {
		const fills = [...chart.querySelectorAll("[aria-label='bar'] rect")].map((r) => getComputedStyle(r).fill);
		const probe = document.createElement("span");
		chart.append(probe);
		const resolve = (c: string) => ((probe.style.color = c), getComputedStyle(probe).color);
		const tokens = {
			low: resolve("color-mix(in oklab, var(--destructive) 60%, var(--background))"),
			red: resolve("var(--destructive)"),
			high: resolve("var(--chart-3)"),
		};
		probe.remove();
		const ticks = [...chart.querySelectorAll("[aria-label='x-axis tick label'] text")].map((t) => t.textContent);
		return { fills, tokens, last: ticks.at(-1) };
	});
	expect(scale.fills[0]).toBe(scale.tokens.low);
	expect(scale.fills[0]).not.toBe(scale.tokens.red);
	expect(scale.fills[2]).toBe(scale.tokens.high);
	expect(new Set(scale.fills).size).toBe(3);
	expect(scale.last).toBe("100%");
});

// The basic catalog's sheet puts `color-scheme: light dark` on `:root`, which
// follows the OS; Piary's dark mode is its `.dark` class. A surface in a light
// canvas stays light on a dark Mac, and the page keeps the scheme it had.
test("an a2ui surface follows the canvas's theme, not the OS's", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" });
	await openApp(page, a2uiDoc([{ id: "root", component: "Text", variant: "caption", text: "Down from 58." }]));
	const caption = page.locator(".piary-a2ui .a2ui-text-caption");
	await expect(caption).toBeVisible();
	const seen = await caption.evaluate((el) => {
		const root = el.closest(".piary-a2ui")!;
		const probe = document.createElement("div");
		probe.style.color = "var(--muted-foreground)";
		root.append(probe);
		const muted = getComputedStyle(probe).color;
		probe.remove();
		return {
			view: getComputedStyle(root).colorScheme,
			page: getComputedStyle(document.documentElement).colorScheme,
			caption: getComputedStyle(el).color,
			muted,
		};
	});
	expect(seen.view).toBe("light");
	expect(seen.page).toBe("normal");
	expect(seen.caption).toBe(seen.muted);
});

// A chart whose rows come from `series` over the data model redraws when the
// slider bound to it moves: the compound-interest explainer with no cell and
// no round-trip to the agent.
test("an a2ui chart built with series redraws when the slider it reads moves", async ({ page }) => {
	await openApp(
		page,
		a2uiDoc(
			[
				{ id: "root", component: "Column", children: ["years", "growth"] },
				{ id: "years", component: "Slider", label: "Years", min: 1, max: 40, value: { "@path": "/years" } },
				{
					id: "growth",
					component: "Chart",
					mark: "line",
					x: "year",
					y: "balance",
					data: { "@call": "series", args: { from: 0, to: { "@path": "/years" }, index: "year", columns: { balance: "1000 * 1.05 ^ year" } } },
				},
			],
			{ years: 10 },
		),
	);
	const chart = page.locator("piary-a2ui-chart");
	await expect(chart).toHaveAttribute("data-drawn", "", { timeout: 20_000 });
	const lastYear = () =>
		chart.evaluate((el) => {
			const ticks = [...el.querySelectorAll("[aria-label='x-axis tick label'] text")].map((t) => Number(t.textContent));
			return Math.max(...ticks);
		});
	expect(await lastYear()).toBe(10);
	await page.locator(".piary-a2ui input[type=range]").evaluate((input: HTMLInputElement) => {
		input.value = "30";
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await expect.poll(lastYear).toBe(30);
});

// A decision matrix is set in the document's own weight: the pick in the accent
// the document already has, a failed must struck through in the muted tone, and
// no green or red of its own.
test("an a2ui decision matrix marks its pick in the accent and strikes a failed must in the muted tone", async ({ page }) => {
	const options = [
		{ name: "Sentry", price: 26, sso: "Yes" },
		{ name: "Rollbar", price: 21, sso: "No" },
		{ name: "Bugsnag", price: 29, sso: "Yes" },
	];
	const criteria = [
		{ key: "price", best: "min", unit: "$" },
		{ key: "sso", label: "SSO", must: { oneOf: ["Yes"] } },
	];
	await openApp(page, a2uiDoc([{ id: "root", component: "Compare", options, criteria, pick: "Sentry" }]));
	const matrix = page.locator(".piary-compare");
	await expect(matrix.locator(".piary-compare-badge")).toHaveText("Recommended");
	const seen = await matrix.evaluate((table) => {
		const probe = document.createElement("span");
		table.append(probe);
		const token = (name: string) => ((probe.style.color = `var(${name})`), getComputedStyle(probe).color);
		const tokens = { accent: token("--accent-foreground"), muted: token("--muted-foreground"), success: token("--success"), destructive: token("--destructive") };
		probe.remove();
		const style = (selector: string) => getComputedStyle(table.querySelector(selector)!);
		const inks = [...table.querySelectorAll("*")].flatMap((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
		return {
			tokens,
			inks,
			badge: style(".piary-compare-badge").color,
			failed: { color: style("td[data-fails]").color, line: style("td[data-fails]").textDecorationLine },
			why: style(".piary-compare-fails").color,
			best: style("td[data-best]").fontWeight,
		};
	});
	expect(seen.badge).toBe(seen.tokens.accent);
	expect(seen.failed).toEqual({ color: seen.tokens.muted, line: "line-through" });
	expect(seen.why).toBe(seen.tokens.muted);
	expect(Number(seen.best)).toBeGreaterThanOrEqual(600);
	expect(seen.inks).not.toContain(seen.tokens.success);
	expect(seen.inks).not.toContain(seen.tokens.destructive);
});

// Plot ships in the app (ADR 0043), so a chart needs no network: with the CDN
// a cell's other libraries come from refused, an a2ui Chart and a cell that
// calls `Plot.plot` both still draw.
const offline = (page: import("@playwright/test").Page) => page.route("**/cdn.jsdelivr.net/**", (route) => route.abort());

test("an a2ui chart draws with the CDN unreachable", async ({ page }) => {
	await offline(page);
	const days = ["Mon", "Tue", "Wed"].map((day, i) => ({ day, opened: [96, 88, 79][i] }));
	await openApp(page, a2uiDoc([{ id: "root", component: "Chart", mark: "bar", x: "day", y: "opened", data: days }]));
	const chart = page.locator("piary-a2ui-chart");
	await expect(chart.locator("svg [aria-label='bar'] rect")).toHaveCount(3, { timeout: 20_000 });
	await expect(chart).not.toHaveAttribute("data-answer-ui-error");
});

test("a cell that calls Plot.plot draws with the CDN unreachable", async ({ page }) => {
	await offline(page);
	await openApp(
		page,
		"<!-- you -->\n\nchart\n\n<!-- pi:cell js #bars -->\n\n```js\nPlot.plot({ marks: [Plot.barY([3, 1, 2])] })\n```\n\n<!-- you -->\n\n",
	);
	await expect(page.locator(".cell-output svg [aria-label='bar'] rect")).toHaveCount(3, { timeout: 20_000 });
});

test("at a narrow window the chip stays on one line inside the window: the usage goes first, the face's pill stays", async ({ page }) => {
	await page.setViewportSize({ width: 480, height: 700 });
	await openApp(page, TWO_ASKED, { ...PICKER, "pi_send:get_session_stats": STATS });
	const pill = page.locator(".model-chip .face-pill");
	await expect(modelPill(page)).not.toHaveText("model");
	await expect(pill).toBeVisible();
	await expect(page.locator(".model-chip .usage")).toBeHidden();
	const boxes = await page.locator(".model-chip > *:visible").evaluateAll((parts) => parts.map((part) => part.getBoundingClientRect()).map(({ left, right, top, bottom }) => ({ left, right, top, bottom })));
	expect(boxes.length, "the two pills and the face's").toBe(3);
	for (const box of boxes) {
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.right).toBeLessThanOrEqual(480);
		// One line: every part overlaps the first one's height.
		expect(box.top).toBeLessThan(boxes[0]!.bottom);
		expect(box.bottom).toBeGreaterThan(boxes[0]!.top);
	}
	// With room, what the conversation has used is back, left of the pills.
	await page.setViewportSize({ width: 1100, height: 700 });
	await expect(meter(page)).toBeVisible();
	await expect(totals(page)).toBeVisible();
});

/** Boots the Preferences window's page (`app/preferences.html`, ADR 0048). */
const openPreferences = (page: import("@playwright/test").Page, answers: Answers = {}) => openAppAt(page, "/preferences.html", answers, ".prefs-row");

test("the Preferences window shows what is kept, and a change is written and shown once Rust says it is kept", async ({ page }) => {
	await openPreferences(page, {
		preferences_read: { cellWorkPulse: true },
		// Rust keeps the change, then tells every window, this one included.
		preferences_write: { emit: ["preferences-changed", { cellWorkPulse: false }] },
	});
	await expect(page.locator(".prefs-group h2")).toHaveText(["Runs", "Camera", "Updates"]);
	const pulse = page.getByLabel("Pulse the cell a run is working on");
	await expect(pulse).toBeChecked();
	// A key the file lacks is its default: the face is not read.
	await expect(page.getByLabel("Read my face while I type")).not.toBeChecked();
	await pulse.click();
	await expect(pulse).not.toBeChecked();
	const writes = (await ipcCalls(page)).filter((call) => call.cmd === "preferences_write").map((call) => call.args);
	expect(writes, "the whole of the preferences, with the one change").toEqual([{ preferences: { cellWorkPulse: false, face: false, faceExplained: false, faceCamera: "", faceTuning: { intensity: "C", minMs: 500, yaw: 12, pitch: 10 }, faceSpeaks: false, updateCheck: true, updateDismissed: "" } }]);
	// Another window's change arrives the same way, and the control follows it.
	await emitToPage(page, "preferences-changed", { cellWorkPulse: true });
	await expect(pulse).toBeChecked();
});

test("the Preferences window opens on what is kept, not on the defaults", async ({ page }) => {
	await openPreferences(page, { preferences_read: { cellWorkPulse: false } });
	await expect(page.getByLabel("Pulse the cell a run is working on")).not.toBeChecked();
});

test("until what is kept has been read, the Preferences window's switches take no click", async ({ page }) => {
	await openPreferences(page, { preferences_read: { delayMs: 600, value: { cellWorkPulse: true, face: true } } });
	const face = page.getByLabel("Read my face while I type");
	await expect(face, "nothing is known yet, so nothing can be changed").toBeDisabled();
	await expect(face).toBeEnabled();
	await expect(face).toBeChecked();
	expect((await ipcCalls(page)).filter((call) => call.cmd === "preferences_write")).toEqual([]);
});

test("New Document works from the Preferences window, and Settings… there asks for no second one", async ({ page }) => {
	await openPreferences(page);
	await emitToPage(page, "menu", "settings");
	await emitToPage(page, "menu", "send");
	await emitToPage(page, "menu", "new-document");
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "open_document").length).toBe(1);
	const asked = (await ipcCalls(page)).map((call) => call.cmd);
	expect(asked).not.toContain("open_preferences");
	expect(asked, "a verb that acts on a document has none here").not.toContain("pi_send");
});

test("Settings… in a document's window asks Rust for the Preferences window, and a refusal is said on the status line", async ({ page }) => {
	await openApp(page, "<!-- you -->\n\nhello\n\n");
	await emitToPage(page, "menu", "settings");
	await expect.poll(async () => (await ipcCalls(page)).filter((call) => call.cmd === "open_preferences").length).toBe(1);
	await expect(page.locator("#status")).toHaveText("");
	await answerFromNow(page, "open_preferences", { reject: "Piary is quitting" });
	await emitToPage(page, "menu", "settings");
	await expect(page.locator("#status")).toHaveText("Piary is quitting");
});

test("a preference that could not be kept stays as it was, and the window says so", async ({ page }) => {
	await openPreferences(page, { preferences_read: { cellWorkPulse: true }, preferences_write: { reject: "the disk is full" } });
	const pulse = page.getByLabel("Pulse the cell a run is working on");
	await pulse.click();
	await expect(page.locator("#status")).toHaveText("That change could not be saved: the disk is full");
	await expect(pulse, "the window shows what the file holds, not what was clicked").toBeChecked();
});

test("the Preferences window answers the host's close at once: it holds nothing to write", async ({ page }) => {
	await openPreferences(page);
	// Nothing kept and nothing read: the defaults.
	await expect(page.getByLabel("Pulse the cell a run is working on")).toBeChecked();
	await emitToPage(page, "exit-flush", { turnBoundMs: 2000 });
	await expect.poll(async () => (await ipcCalls(page)).some((call) => call.cmd === "exit_flushed")).toBe(true);
});

// The notice of a newer version (ADR 0064). Rust gives a window the turn to ask
// (`update_claim`) and tells every window what was read (`update-latest`);
// GitHub is answered here, so a spec says what is released.
const GITHUB_LATEST = "https://api.github.com/repos/divergenz-ch/piary/releases/latest";
const updatePill = (page: import("@playwright/test").Page) => page.locator(".update-pill");

/** Answers the page's request to GitHub with `answer`, and counts the requests. */
async function githubAnswers(page: import("@playwright/test").Page, answer: { status?: number; body?: unknown } | "unreachable"): Promise<{ count: number }> {
	const asked = { count: 0 };
	await page.route(GITHUB_LATEST, (route) => {
		asked.count++;
		return answer === "unreachable" ? route.abort("internetdisconnected") : route.fulfill({ status: answer.status ?? 200, contentType: "application/json", body: JSON.stringify(answer.body ?? {}) });
	});
	return asked;
}

/** A window of version `current` that is given the turn, Rust telling every
 *  window the tag it is handed, as it does. */
const withTheTurn = (current: string, tag: string): Answers => ({
	update_state: { current, latest: null },
	update_claim: { afterCall: "update_claim", before: { kind: "github" }, after: { kind: "none" } },
	update_found: { emit: ["update-latest", tag] },
	open_url: null,
});

test("a build older than the latest release says so beside the model, and its button opens the release's page", { tag: "@smoke" }, async ({ page }) => {
	// The answer's own link is not where the button goes.
	const asked = await githubAnswers(page, { body: { tag_name: "v0.2.0", html_url: "https://example.org/elsewhere" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", withTheTurn("0.1.0", "v0.2.0"));
	await expect(updatePill(page)).toHaveText("Update 0.2.0");
	expect(await ptyCalls(page, "update_found"), "Rust is handed the tag that was read").toEqual([{ tag: "v0.2.0" }]);
	expect(asked.count, "one request").toBe(1);
	// In the chip, the model right after it.
	expect(await updatePill(page).evaluate((pill) => [pill.parentElement?.className, (pill.nextElementSibling as HTMLElement | null)?.dataset["pick"]])).toEqual(["model-chip", "model"]);
	await updatePill(page).click();
	const menu = page.locator(".doc-block-menu");
	await expect(menu.locator(".doc-menu-note")).toHaveText("Piary 0.2.0 is available. This is 0.1.0.");
	await menu.getByRole("button", { name: "Open the download page" }).click();
	await expect.poll(() => ptyCalls(page, "open_url")).toEqual([{ url: "https://github.com/divergenz-ch/piary/releases/tag/v0.2.0" }]);
});

test("a build that is current shows no notice", async ({ page }) => {
	await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", withTheTurn("0.2.0", "v0.2.0"));
	await expect.poll(() => ptyCalls(page, "update_found")).toEqual([{ tag: "v0.2.0" }]);
	await expect(updatePill(page)).toBeHidden();
});

test("a window not given the turn makes no request, and shows what another window read", async ({ page }) => {
	const asked = await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	// What Rust answers with the preference off, and to every window but one
	// within the hour.
	await openApp(page, "<!-- you -->\n\nhello\n\n", { update_state: { current: "0.1.0", latest: null }, update_claim: { kind: "none" } });
	await expect.poll(async () => (await ptyCalls(page, "update_claim")).length, "the turn was asked for").toBeGreaterThan(0);
	await expect(updatePill(page)).toBeHidden();
	await emitToPage(page, "update-latest", "v0.2.0");
	await expect(updatePill(page)).toHaveText("Update 0.2.0");
	expect(asked.count, "nothing was asked of GitHub").toBe(0);
});

test("a window opened after a check shows what was read, with no request of its own", async ({ page }) => {
	const asked = await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", { update_state: { current: "0.1.0", latest: "v0.2.0" }, update_claim: { kind: "none" } });
	await expect(updatePill(page)).toHaveText("Update 0.2.0");
	expect(asked.count).toBe(0);
});

test("with the check switched off the notice goes, and comes back with it", async ({ page }) => {
	await openApp(page, "<!-- you -->\n\nhello\n\n", { update_state: { current: "0.1.0", latest: "v0.2.0" }, update_claim: { kind: "none" } });
	await expect(updatePill(page)).toBeVisible();
	await emitToPage(page, "preferences-changed", { updateCheck: false });
	await expect(updatePill(page)).toBeHidden();
	await emitToPage(page, "preferences-changed", { updateCheck: true });
	await expect(updatePill(page)).toBeVisible();
});

for (const [what, answer, said, engineSays] of [
	// The engine reports a refused request on the console itself.
	["a refusal from GitHub", { status: 404, body: { message: "Not Found" } }, "GitHub answered 404", /^Failed to load resource: the server responded with a status of 404/],
	["no network", "unreachable", "no newer version was looked up", null],
	["an answer that names no version", { body: { tag_name: "nightly" } }, "the answer names no released version", null],
] as const) {
	test(`${what} shows nothing, and is written to the log`, async ({ page }) => {
		if (engineSays) allowConsoleError(page, engineSays);
		const asked = await githubAnswers(page, answer);
		await openApp(page, "<!-- you -->\n\nhello\n\n", withTheTurn("0.1.0", "v0.2.0"));
		await expect.poll(async () => (await ptyCalls(page, "log_line")).filter((line) => (line as { level: string }).level === "update").map((line) => (line as { message: string }).message)).toEqual([expect.stringContaining(said)]);
		expect(asked.count).toBe(1);
		expect(await ptyCalls(page, "update_found"), "nothing is handed to Rust").toEqual([]);
		await expect(updatePill(page)).toBeHidden();
		await expect(page.locator("#status"), "nothing the user asked for failed").toHaveText("");
	});
}

test("a dismissed version is kept as dismissed and not announced again; the one after it is", async ({ page }) => {
	await openApp(page, "<!-- you -->\n\nhello\n\n", {
		update_state: { current: "0.1.0", latest: "v0.2.0" },
		update_claim: { kind: "none" },
		preferences_read: { cellWorkPulse: false },
		// Rust keeps the change, then tells every window.
		preferences_write: { emit: ["preferences-changed", { cellWorkPulse: false, updateDismissed: "0.2.0" }] },
	});
	await updatePill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Dismiss this version" }).click();
	await expect(updatePill(page)).toBeHidden();
	const writes = (await ptyCalls(page, "preferences_write")) as { preferences: Record<string, unknown> }[];
	expect(writes.map((write) => [write.preferences["updateDismissed"], write.preferences["cellWorkPulse"]]), "the version, and every other preference as it was").toEqual([["0.2.0", false]]);
	// Told again of the version dismissed, as the next check will.
	await emitToPage(page, "update-latest", "v0.2.0");
	await expect(updatePill(page)).toBeHidden();
	await emitToPage(page, "update-latest", "v0.3.0");
	await expect(updatePill(page)).toHaveText("Update 0.3.0");
});

test("a version dismissed before this launch is not announced at the next, not even until what is kept has been read", async ({ page }) => {
	// The version is known at once, and what the user keeps a moment later.
	await page.addInitScript(() => {
		const seen: string[] = ((window as unknown as { __pillSeen: string[] }).__pillSeen = []);
		new MutationObserver(() => {
			const pill = document.querySelector<HTMLElement>(".update-pill");
			if (pill && !pill.hidden) seen.push(pill.textContent ?? "");
		}).observe(document, { subtree: true, childList: true, attributes: true });
	});
	await openApp(page, "<!-- you -->\n\nhello\n\n", {
		update_state: { current: "0.1.0", latest: "v0.2.0" },
		update_claim: { kind: "none" },
		preferences_read: { delayMs: 600, value: { updateDismissed: "0.2.0" } },
	});
	await expect.poll(async () => (await ptyCalls(page, "update_claim")).length, "what is kept has been read").toBeGreaterThan(0);
	await expect(updatePill(page)).toBeHidden();
	expect(await page.evaluate(() => (window as unknown as { __pillSeen: string[] }).__pillSeen), "the pill was never shown").toEqual([]);
});

/** A window not given the turn at launch, whose user then chooses Help →
 *  Check for Updates…: Rust gives that one the turn whatever the hour says. */
async function checkForUpdates(page: import("@playwright/test").Page): Promise<void> {
	await expect.poll(async () => (await ptyCalls(page, "update_claim")).length, "the launch's own ask is over").toBeGreaterThan(0);
	await answerFromNow(page, "update_claim", { kind: "github" });
	await emitToPage(page, "menu", "check-updates");
}

test("Check for Updates… in a current build asks at once and says it is the newest", async ({ page }) => {
	const asked = await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", { update_state: { current: "0.2.0", latest: null }, update_claim: { kind: "none" }, update_found: { emit: ["update-latest", "v0.2.0"] } });
	await checkForUpdates(page);
	await expect(page.locator("#status")).toHaveText("Piary 0.2.0 is the newest version.");
	expect((await ptyCalls(page, "update_claim")).at(-1), "asked for as the user's own check").toEqual({ asked: true });
	expect(asked.count).toBe(1);
	await expect(updatePill(page)).toBeHidden();
});

test("Check for Updates… says a newer version is available and shows its notice, though it was dismissed and the check is off", async ({ page }) => {
	await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", {
		update_state: { current: "0.1.0", latest: null },
		update_claim: { kind: "none" },
		update_found: { emit: ["update-latest", "v0.2.0"] },
		preferences_read: { updateCheck: false, updateDismissed: "0.2.0" },
		preferences_write: { emit: ["preferences-changed", { updateCheck: false, updateDismissed: "0.2.0" }] },
	});
	await checkForUpdates(page);
	await expect(page.locator("#status")).toHaveText("Piary 0.2.0 is available. This is 0.1.0.");
	await expect(updatePill(page)).toHaveText("Update 0.2.0");
	// Dismissed again from the notice, it goes.
	await updatePill(page).click();
	await page.locator(".doc-block-menu").getByRole("button", { name: "Dismiss this version" }).click();
	await expect(updatePill(page)).toBeHidden();
});

test("Check for Updates… that could not ask says why: the user asked", async ({ page }) => {
	allowConsoleError(page, /^Failed to load resource: the server responded with a status of 404/);
	await githubAnswers(page, { status: 404, body: { message: "Not Found" } });
	await openApp(page, "<!-- you -->\n\nhello\n\n", { update_state: { current: "0.1.0", latest: null }, update_claim: { kind: "none" } });
	await checkForUpdates(page);
	await expect(page.locator("#status")).toHaveText("Could not check for a newer version: GitHub answered 404");
	await expect(updatePill(page)).toBeHidden();
});

test("a first run looks nothing up behind its splash or under its tour", async ({ page }) => {
	const asked = await githubAnswers(page, { body: { tag_name: "v0.2.0" } });
	await takeTheTour(page, { ...withTheTurn("0.1.0", "v0.2.0") });
	// Told of a version by another window, while it is walked.
	await emitToPage(page, "update-latest", "v0.2.0");
	await expect(coach(page)).toBeVisible();
	await expect(updatePill(page)).toBeHidden();
	expect(await ptyCalls(page, "update_claim"), "the turn is not asked for").toEqual([]);
	expect(asked.count).toBe(0);
});
