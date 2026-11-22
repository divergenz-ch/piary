// Showing a conversation leaves the conversation list as it was. Layer 4,
// because the order is the store's: the list is sorted by each file's
// modification time (`docs::entries`), and what moves one is a real write
// through the real IPC boundary, which the page layer replaces.
//
// The app is this spec's own, so its documents are in a scratch directory
// (`helpers/instance.ts`).
import { statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { type Driver, Instance, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long a page may take to boot on the conversation it switched to. */
const BOOTED_MS = 15_000;
/** How long a window that has just opened is given to save, if it is going
 *  to: the canvas's save debounce (500 ms) and a write, with room over. */
const SETTLED_MS = 2_000;

const conversation = (id: string, title: string) =>
	`---\npi: v1\nsession: ${id}\n---\n\n# ${title}\n\n<!-- you -->\n\nwhat is ${title.toLowerCase()}\n\n<!-- pi -->\n\nA word.\n\n<!-- you -->\n\n`;

/** The list's rows as a reader sees them, top to bottom. */
const rows = (driver: Driver) =>
	driver.execute(() => {
		const list = document.querySelector("session-list");
		const labels = (list?.shadowRoot ?? list)?.querySelectorAll(".session-label") ?? [];
		return [...labels].map((label) => label.textContent?.trim() ?? "");
	});

const booted = (driver: Driver, id: string) =>
	driver.execute(
		(docId: string) => new URL(location.href).searchParams.get("id") === docId && !!document.querySelector("document-chat .cm-line"),
		id,
	);

describe("the conversation list", () => {
	let docDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	it("keeps its order when a conversation is only shown", async () => {
		docDir = scratch("list-order");
		// Newest first is Gamma, Beta, Welcome: each file a minute older than
		// the one above it, so a write to any of them reorders the list.
		const now = Date.now() / 1000;
		const seeded = [
			{ id: "gamma", title: "Gamma", age: 60 },
			{ id: "beta", title: "Beta", age: 120 },
			{ id: "welcome", title: "Welcome", age: 180 },
		];
		for (const { id, title, age } of seeded) {
			const file = join(docDir, `${id}.md`);
			writeFileSync(file, conversation(id, title));
			utimesSync(file, now - age, now - age);
		}
		const modified = () => seeded.map(({ id }) => statSync(join(docDir, `${id}.md`)).mtimeMs);
		const before = modified();
		const order = ["Gamma", "Beta", "Welcome"];

		const launched = await Instance.launch({ docDir });
		app = launched.app;
		const { driver } = launched;
		await until(async () => (await rows(driver)).length === order.length, BOOTED_MS, "the list never showed its three conversations");
		expect(await rows(driver)).toEqual(order);

		// A row's click raises this event (`app/conversations.ts`). The window
		// leaves Welcome for Beta, then Beta for Gamma: every conversation is
		// either left or shown, and none of them is changed.
		for (const id of ["beta", "gamma"]) {
			await driver.execute((docId: string) => {
				document.dispatchEvent(new CustomEvent("piary-switch", { detail: { id: docId } }));
			}, id);
			await until(() => booted(driver, id), BOOTED_MS, `the window never showed ${id}`);
			await new Promise((resolve) => setTimeout(resolve, SETTLED_MS));
			await until(async () => (await rows(driver)).length === order.length, BOOTED_MS, `the list never came back after showing ${id}`);
			expect(await rows(driver)).toEqual(order);
			expect(modified()).toEqual(before);
		}
	});
});
