// The harness's own proof: the real <document-chat> boots in a real engine and
// the things jsdom cannot see are observable here.
//
// Each spec below asserts something the unit suite structurally CANNOT
// (docs/TEST_ARCHITECTURE.md §4, "asserting on pixels under jsdom"): real line
// geometry, real focus, real caret placement. A spec that would pass under jsdom
// belongs in tests/, not here — this layer is slower and is spent only on what
// needs an engine.
import { expect, test } from "@playwright/test";

/** Seed the buffer and wait for CodeMirror to have rendered it. */
async function open(page: import("@playwright/test").Page, md: string) {
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(md)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
}

test("the real editor renders the document's lines", async ({ page }) => {
	await open(page, "# Title\n\nSome prose.\n");
	// Text content, not an absolute line count: geometry assertions below are
	// what this layer is for, and a count would rot on any whitespace change
	// (docs/HANDBOOK.md testing rules).
	await expect(page.locator(".cm-editor")).toContainText("Some prose.");
});

test("lines have real height and stack down the page", async ({ page }) => {
	await open(page, "# Title\n\nFirst line.\n\nSecond line.\n");
	const first = page.locator(".cm-line", { hasText: "First line." });
	const second = page.locator(".cm-line", { hasText: "Second line." });
	const a = await first.boundingBox();
	const b = await second.boundingBox();
	// This is the assertion jsdom cannot make: there, every rect is zeros, so
	// `a.height > 0` and `b.y > a.y` both compare 0 to 0 and pass vacuously.
	expect(a!.height).toBeGreaterThan(0);
	expect(b!.y).toBeGreaterThan(a!.y);
});

test("clicking a line puts the caret in the editor", async ({ page }) => {
	await open(page, "# Title\n\nClick into me.\n");
	await page.locator(".cm-line", { hasText: "Click into me." }).click();
	// Focus is the other thing a simulated DOM gets wrong. CodeMirror's editable
	// surface is .cm-content; the click must land there, not on the host element.
	await expect(page.locator(".cm-content")).toBeFocused();
});

test("an agent segment renders as a labelled, attributed line", async ({ page }) => {
	await open(page, "<!-- pi -->\n\nThe agent wrote this.\n");
	// Every line of the segment carries the assistant class, the marker line
	// included — so this asserts on the PROSE line rather than `.first()`, which
	// is the marker and reads "agent" (its rendered label, the marker itself being
	// machine structure that renders as nothing).
	const prose = page.locator(".cm-line.doc-line-pi", { hasText: "The agent wrote this." });
	await expect(prose).toHaveCount(1);
	// The label is what a reader sees in place of the HTML comment: proof the
	// marker was parsed and decorated, not merely hidden.
	await expect(page.locator(".cm-line.doc-line-marker").first()).toContainText("agent");
});

/** The one remote request a page may make before it has a cell: Observable
 *  Inputs' stylesheet, which the engine's own CSS `@import`s. esbuild gathers
 *  every chunk's CSS into the entry's stylesheet, so it cannot wait for the
 *  engine the way the app's split CSS does. */
const INPUTS_CSS = "https://cdn.jsdelivr.net/npm/@observablehq/inputs/dist/index.css";

test("a document with no cells opens without loading the cell engine's libraries", async ({ page }) => {
	// The cell engine's libraries come from a CDN. Hoisted to the top of the
	// harness bundle, all of them loaded on every page open — 127 requests for
	// a page of prose — and `page.goto` waited on them: a slow CDN timed out
	// specs that have nothing to do with cells. They load with the engine.
	const remote: string[] = [];
	page.on("request", (request) => {
		const host = new URL(request.url()).hostname;
		if (host !== "127.0.0.1" && host !== "localhost" && request.url() !== INPUTS_CSS) remote.push(request.url());
	});
	await open(page, "<!-- you -->\n\nOnly prose here.\n");
	await page.waitForLoadState("networkidle");
	expect(remote).toEqual([]);
});

test("a rendered table cell is edited as its markdown, and a look alone edits nothing", async ({ page }) => {
	const md = "<!-- pi -->\n\n| Item | Price |\n|---|---|\n| **Subtotal** | **696.00** |\n\n<!-- you -->\n\n";
	await open(page, md);
	const read = () => page.evaluate(() => (globalThis as unknown as { __harness: { getDocument(): string } }).__harness.getDocument());
	const cell = page.locator(".doc-md-table td").first();
	await expect(cell.locator("strong")).toHaveText("Subtotal");
	// A real click: focus, and the caret, are what a simulated DOM cannot place.
	await cell.click();
	await expect(cell).toBeFocused();
	await expect(cell).toHaveText("**Subtotal**");
	await page.locator(".cm-line").last().click();
	expect(await read()).toBe(md);
	await expect(page.locator(".doc-md-table td strong").first()).toHaveText("Subtotal");
	// The source replaced the rendered nodes under the click, and the caret is
	// still in the cell: what is typed lands in it and nowhere else.
	await page.locator(".doc-md-table td").first().click();
	await page.keyboard.type("X");
	await page.locator(".cm-line").last().click();
	const after = await read();
	const typed = after.split("\n").find((line) => line.includes("X")) ?? "";
	expect(typed.replace("X", "")).toBe("| **Subtotal** | **696.00** |");
	expect(after.replace("X", "")).toBe(md);
});

test("a click into a plain table cell puts the caret where it was clicked", async ({ page }) => {
	const md = "<!-- pi -->\n\n| Item | Price |\n|---|---|\n| Helium balloons | 276.00 |\n\n<!-- you -->\n\n";
	await open(page, md);
	const cell = page.locator(".doc-md-table td").first();
	// The gap between "Helium" and " balloons", from the engine's own geometry.
	const at = await cell.evaluate((el) => {
		const range = document.createRange();
		range.setStart(el.firstChild!, 6);
		range.setEnd(el.firstChild!, 6);
		const caret = range.getBoundingClientRect();
		const box = el.getBoundingClientRect();
		return { x: caret.left - box.left, y: caret.top + caret.height / 2 - box.top };
	});
	await cell.click({ position: at });
	await page.keyboard.type("X");
	await expect(cell).toHaveText("HeliumX balloons");
});

test("a prose code block's fence lines take no height until the caret enters it", async ({ page }) => {
	await open(page, "<!-- pi -->\n\nBefore.\n\n```text\nsrc/\n  app.ts\n```\n\nAfter.\n\n<!-- you -->\n\n");
	const height = (text: string) =>
		page.evaluate(
			(t) => [...document.querySelectorAll(".cm-line")].filter((l) => l.textContent === t).map((l) => l.getBoundingClientRect().height),
			text,
		);
	const code = page.locator(".cm-line", { hasText: "app.ts" });
	await page.locator(".cm-line", { hasText: "After." }).click();
	// Zero height is the assertion jsdom cannot make: a line whose text is merely
	// hidden still has a line box, and the block would stand in two blank lines.
	expect(await height("```text")).toEqual([0]);
	expect(await height("```")).toEqual([0]);
	const away = (await code.boundingBox())!;
	// The block still reads as one: its lines are tinted and its language named.
	expect(await code.evaluate((l) => getComputedStyle(l).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
	expect(await page.locator(".cm-line", { hasText: "src/" }).evaluate((l) => getComputedStyle(l, "::after").content)).toBe('"text"');
	// Arrowing up from below walks into the block, which brings both lines back.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowUp");
	const [opened] = await height("```text");
	expect(opened).toBeGreaterThan(0);
	expect((await height("```"))[0]).toBeGreaterThan(0);
	expect((await code.boundingBox())!.y).toBeCloseTo(away.y + opened!, 0);
});
