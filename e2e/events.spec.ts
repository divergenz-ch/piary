// The half of the canvas's outbound protocol that needs a real engine.
//
// `tests/integration/events.test.ts` covers the rest and is where an event test belongs by
// default — this layer is slower and is spent only on what jsdom structurally
// cannot do (docs/TEST_ARCHITECTURE.md §4). Two things put these three here:
//
//   - `selection-menu` vs `block-menu` is decided by `posAtCoords`, which needs
//     real layout. Under jsdom it returns 0 for every coordinate, so the "is
//     the click inside the selection?" branch is unreachable there.
//   - `doc-files` needs `DataTransfer` and `DragEvent`, which jsdom does not
//     implement at all. A drop cannot be synthesized in that layer even badly.
import { expect, test } from "@playwright/test";

const PAGE = "<!-- you -->\n\nwhat is 2+2\n\n<!-- pi -->\n\nFour.\n\n<!-- you -->\n\nfollow up";

/** Seed the buffer, wait for render, and start recording one event's details. */
async function listen(page: import("@playwright/test").Page, md: string, name: string) {
	await page.goto(`/demo/harness.html?doc=${encodeURIComponent(md)}`);
	await expect(page.locator(".cm-line").first()).toBeVisible();
	await page.evaluate((event) => {
		const seen: unknown[] = [];
		(window as unknown as Record<string, unknown>)["__seen"] = seen;
		document.querySelector("document-chat")!.addEventListener(event, (e) => seen.push((e as CustomEvent).detail));
	}, name);
}

const seen = (page: import("@playwright/test").Page) =>
	page.evaluate(() => (window as unknown as Record<string, unknown>)["__seen"] as unknown[]);

test("right-clicking inside a selection offers the selection, not the block", async ({ page }) => {
	await listen(page, PAGE, "selection-menu");
	// Select a known span rather than double-clicking: a dblclick selects by word
	// boundary, which on "Four." is the period alone — a fixture that would pass
	// while asserting the wrong text.
	const word = "what is 2+2";
	await page.evaluate((needle) => {
		const el = document.querySelector("document-chat") as HTMLElement & {
			view?: { state: { doc: { toString(): string } }; dispatch(spec: unknown): void };
		};
		const from = el.view!.state.doc.toString().indexOf(needle);
		el.view!.dispatch({ selection: { anchor: from, head: from + needle.length } });
	}, word);
	// The click must land INSIDE the selection — that is the whole decision.
	await page.locator(".cm-line", { hasText: word }).click({ button: "right" });
	const details = (await seen(page)) as Array<{ text: string; from: number; to: number }>;
	expect(details).toHaveLength(1);
	expect(details[0].text).toBe(word);
	expect(details[0].to).toBeGreaterThan(details[0].from);
});

test("right-clicking outside the selection offers the block instead", async ({ page }) => {
	// The bug this guards: a selection left behind three blocks up used to answer
	// a right-click anywhere, so right-clicking an artifact offered to quote a
	// sentence off screen. Every menu here addresses what is under the pointer.
	await listen(page, PAGE, "block-menu");
	await page.locator(".cm-line", { hasText: "Four." }).dblclick();
	await page.locator(".cm-line", { hasText: "what is 2+2" }).click({ button: "right" });
	expect(await seen(page)).toHaveLength(1);
});

test("a dropped file is reported to the host as a real File", async ({ page }) => {
	await listen(page, PAGE, "doc-files");
	// Built AND asserted in the page: neither a DataTransfer nor a File survives
	// the Playwright boundary — a File arrives here as `{}`, so reading `.name`
	// from the test process would compare undefined to undefined.
	const reported = await page.evaluate(() => {
		const data = new DataTransfer();
		data.items.add(new File(["hello"], "note.txt", { type: "text/plain" }));
		document.querySelector("document-chat")!.dispatchEvent(
			new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
		);
		const seen = (window as unknown as Record<string, unknown>)["__seen"] as Array<{ files: File[] }>;
		// The host owns the upload and needs the bytes, so what crosses the seam
		// is the File itself rather than a name.
		return seen.map((d) => ({ count: d.files.length, first: d.files[0]?.name, isFile: d.files[0] instanceof File }));
	});
	expect(reported).toEqual([{ count: 1, first: "note.txt", isFile: true }]);
});

test("a paste carrying only text is left to the editor", async ({ page }) => {
	await listen(page, PAGE, "doc-files");
	await page.evaluate(() => {
		const data = new DataTransfer();
		data.setData("text/plain", "just text");
		document.querySelector("document-chat")!.dispatchEvent(
			new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
		);
	});
	expect(await seen(page)).toHaveLength(0);
});
