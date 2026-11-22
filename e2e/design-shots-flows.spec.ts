// The design-language experiment's harness (ADR 0043), not a test: renders answered eval documents in
// the app's own page (IPC stubbed, the store answering the document) and
// screenshots what the answer drew. With SHOTS_IN unset it defines no test.
//
//   SHOTS_IN=<dir of answered *.md> SHOTS_OUT=<dir> \
//     npx playwright test -c playwright.app.config.ts e2e/design-shots-flows.spec.ts
//
// Writes, per document: <name>--answer.png (the union of every element the
// answer drew: SHOTS_SELECTOR, default below), <name>--page.png (full page),
// and <name>.json ({ widgets, errors, settledMs }). A branch that adds a new
// kind of answer widget marks its root with `data-answer-ui` so it is cropped,
// and marks a widget that failed to render with `data-answer-ui-error`.
import { test } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { KNOWN_COMMANDS, refusal } from "./helpers/ipc-surface.ts";

const IN = process.env["SHOTS_IN"] ?? "";
const OUT = process.env["SHOTS_OUT"] ?? "";
const SELECTOR =
	process.env["SHOTS_SELECTOR"] ??
	"pi-artifact, [data-answer-ui], .doc-view-cards, .doc-view-props, .doc-view-diff, .doc-view-matches, .doc-view-tree, document-chat table";
/** What a failed answer draws: a cell that threw, a cell whose source does not
 *  compile (`PiCell` draws that itself, since it never reaches the runtime), and
 *  a widget that marked itself failed. */
const ERRORS = ".observablehq--error, .cell-syntax-error, [data-answer-ui-error]";
/** Cells import from npm and run; the answer is settled once the canvas has not
 *  changed for this long. */
const QUIET_MS = 1500;
const SETTLE_CAP_MS = 25_000;
/** How often the canvas is sampled while settling. */
const POLL_MS = 250;
const files = IN ? readdirSync(IN).filter((f) => f.endsWith(".md")) : [];

test.describe.configure({ mode: "parallel" });
for (const file of files) {
	test(`shot ${file}`, async ({ page }) => {
		test.setTimeout(90_000);
		mkdirSync(OUT, { recursive: true });
		const doc = readFileSync(join(IN, file), "utf8");
		await page.setViewportSize({ width: 1000, height: 1200 });
		await page.addInitScript(
			({ known, refused, doc }) => {
				type Handler = (event: { event: string; id: number; payload: unknown }) => void;
				const listeners: Record<string, Handler[]> = {};
				(window as any).__TAURI_INTERNALS__ = {
					metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
					invoke: (cmd: string, args: any) => {
						if (cmd === "plugin:event|listen" && args?.event && args.handler) {
							(listeners[args.event] ??= []).push(args.handler);
							return Promise.resolve(listeners[args.event]!.length);
						}
						if (!known.includes(cmd)) return Promise.reject(new Error(refused.replace("<cmd>", cmd)));
						if (cmd === "docs_read" && args?.id === "shot") return Promise.resolve(doc);
						return Promise.resolve(undefined);
					},
					transformCallback: (callback: unknown) => callback,
				};
				(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
			},
			{ known: KNOWN_COMMANDS, refused: refusal("<cmd>"), doc },
		);
		await page.goto("/?id=shot");
		await page.locator(".cm-line").first().waitFor();
		const started = Date.now();
		let last = "";
		let stableSince = Date.now();
		while (Date.now() - started < SETTLE_CAP_MS) {
			const now = await page.evaluate(
				() => `${document.querySelector("document-chat")?.innerHTML.length}:${document.querySelectorAll("*").length}`,
			);
			if (now !== last) {
				last = now;
				stableSince = Date.now();
			} else if (Date.now() - stableSince >= QUIET_MS) break;
			await new Promise((resolve) => setTimeout(resolve, POLL_MS));
		}
		const settledMs = Date.now() - started;
		const name = basename(file, ".md");
		const widgets = page.locator(SELECTOR);
		const n = await widgets.count();
		const errors = await page.locator(ERRORS).count();
		const boxes: { x: number; y: number; w: number; h: number }[] = [];
		for (let i = 0; i < n; i++) {
			const box = await widgets.nth(i).evaluate((el) => {
				const r = el.getBoundingClientRect();
				return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
			});
			if (box.w > 0 && box.h > 0) boxes.push(box);
		}
		if (boxes.length) {
			const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 8);
			const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 8);
			const right = Math.max(...boxes.map((b) => b.x + b.w)) + 8;
			const bottom = Math.max(...boxes.map((b) => b.y + b.h)) + 8;
			await page.screenshot({ path: join(OUT, `${name}--answer.png`), fullPage: true, clip: { x, y, width: right - x, height: bottom - y } });
		}
		await page.screenshot({ path: join(OUT, `${name}--page.png`), fullPage: true });
		writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ name, widgets: boxes.length, errors, settledMs }));
	});
}
