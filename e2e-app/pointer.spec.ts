// Real events in the real app (ADR 0068). WebDriver's own clicks and keys on
// macOS are made in the page by script: no hover follows them, the engine
// places no caret for them and the page is told they are not trusted. A driven
// build can be handed an event as the system would hand it, from inside the
// process (`harness_pointer`), and these hold what that gives: a hover that
// lights what a pointer lights, a click the engine itself places a caret for,
// a key that types, a wheel that scrolls. And what it must never cost: the
// user's own cursor, and the window in front.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import type { HarnessSent } from "../src/bridge-types.ts";
import { type Driver, FAKE_PI, Instance, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long the page has to show what an event did. */
const SEEN_MS = 5_000;

/** Short enough to need no scrolling: a point measured is the point pressed. */
const SHORT = "<!-- you -->\n\nwhat should the party cost\n\n<!-- pi -->\n\nThe balloons are the largest line of the budget.\n\n<!-- you -->\n\n";

const LONG = `<!-- you -->\n\nlist them\n\n<!-- pi -->\n\n${Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1} of the answer.\n\n`).join("")}<!-- you -->\n\n`;

/** The point just after `after` in the line holding it, in the page's pixels. */
function pointAfter(driver: Driver, after: string): Promise<{ x: number; y: number }> {
	return driver.execute((text: string) => {
		const walker = document.createTreeWalker(document.querySelector(".cm-content")!, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const at = node.textContent!.indexOf(text);
			if (at < 0) continue;
			const range = document.createRange();
			range.setStart(node, at + text.length);
			range.setEnd(node, at + text.length);
			const box = range.getBoundingClientRect();
			return { x: box.left, y: box.top + box.height / 2 };
		}
		throw new Error(`no text "${text}" on the page`);
	}, after);
}

/** Records the pointer and key events the page is given from now on. */
function listen(driver: Driver): Promise<void> {
	return driver.execute(() => {
		const seen: { type: string; trusted: boolean }[] = [];
		(window as unknown as { __seen: typeof seen }).__seen = seen;
		for (const type of ["mousemove", "mousedown", "mouseup", "click", "keydown", "wheel"]) {
			document.addEventListener(type, (event) => seen.push({ type, trusted: event.isTrusted }), true);
		}
	});
}

function seen(driver: Driver): Promise<{ type: string; trusted: boolean }[]> {
	return driver.execute(() => (window as unknown as { __seen: { type: string; trusted: boolean }[] }).__seen);
}

function documentOf(driver: Driver): Promise<string> {
	return driver.execute(() => (document.querySelector("document-chat") as unknown as { getDocument(): string }).getDocument());
}

describe("an event handed to the window as the system would", () => {
	let docDir = "";
	let app: Instance | undefined;
	/** Every answer of the harness in the test, for what it left of the user's. */
	let sent: HarnessSent[] = [];

	async function launch(doc: string): Promise<Driver> {
		docDir = scratch("pointer");
		writeFileSync(join(docDir, "welcome.md"), doc);
		const launched = await Instance.launch({ docDir, env: { PI_CLI: FAKE_PI } });
		app = launched.app;
		sent = [];
		return launched.driver;
	}

	afterEach(async () => {
		// The user's cursor is where their hand left it, and the window was never
		// the one their keys go to: the two things a posted event would take. The
		// two readings of the cursor are microseconds apart, so a hand moving it
		// meanwhile is not what a difference would mean.
		for (const one of sent) {
			expect(one.cursorAfter).toEqual(one.cursorBefore);
			expect(one.keyWindow).toBe(false);
		}
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	it("moves a pointer the page hovers under: the block it is over is marked as near", async () => {
		const driver = await launch(SHORT);
		expect(await driver.execute(() => document.querySelectorAll(".doc-cell-handle.doc-near").length)).toBe(0);
		await listen(driver);
		const at = await pointAfter(driver, "largest");
		sent.push(await driver.pointer({ kind: "move", x: at.x, y: at.y }));
		// The mark is set by the canvas on `mouseover`. The grip it lights fades
		// in by a transition, which a window that is not being drawn never
		// finishes, so the mark is what is held.
		await until(() => driver.execute(() => document.querySelectorAll(".doc-cell-handle.doc-near").length > 0), SEEN_MS, "no block was marked as under the pointer");
		expect(await seen(driver)).toContainEqual({ type: "mousemove", trusted: true });
	});

	it("clicks where the engine places the caret itself, and types there with a real key", async () => {
		const driver = await launch(SHORT);
		await listen(driver);
		const at = await pointAfter(driver, "balloons");
		sent.push(...(await driver.click(at.x, at.y)));
		await until(async () => (await seen(driver)).some((event) => event.type === "click"), SEEN_MS, "the press and release made no click");
		for (const type of ["mousedown", "mouseup", "click"]) {
			expect(await seen(driver)).toContainEqual({ type, trusted: true });
		}
		// `q` on a keyboard of any layout: the event names what it types.
		sent.push(await driver.pointer({ kind: "keyDown", chars: "q", code: 12, shift: false, control: false, option: false, command: false }));
		sent.push(await driver.pointer({ kind: "keyUp", chars: "q", code: 12, shift: false, control: false, option: false, command: false }));
		await until(async () => (await documentOf(driver)).includes("The balloonsq are the largest"), SEEN_MS, "the key did not type where the click put the caret");
		expect(await seen(driver)).toContainEqual({ type: "keydown", trusted: true });
	});

	it("turns the wheel over a point, and what is under it scrolls by that much", async () => {
		const driver = await launch(LONG);
		const top = () => driver.execute(() => document.querySelector(".cm-scroller")!.scrollTop);
		await listen(driver);
		const at = await pointAfter(driver, "Paragraph 3 ");
		const before = await top();
		sent.push(await driver.pointer({ kind: "wheel", x: at.x, y: at.y, dx: 0, dy: 240 }));
		await until(async () => (await top()) >= before + 240, SEEN_MS, "the wheel did not scroll the page");
		expect(await seen(driver)).toContainEqual({ type: "wheel", trusted: true });
	});
});
