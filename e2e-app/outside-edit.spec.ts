// Another program writes the open conversation's file, and the window copes
// (ADR 0001: the file is the truth; ADR 0018 §3: an outside edit is reconciled
// in place). Layer 4, because the event here is FSEvents reporting a real write
// — the page layer (`e2e/flows.spec.ts`) raises the watcher's event itself, and
// `src-tauri/src/store.rs` proves the watcher without a page.
//
// What stays manual (`docs/running-the-app.md` step 15) is a real editor's own
// save strategy: this spec writes the file in place and by rename, which is
// what `git checkout` and most editors do, but not every editor is most.
//
// The app is this spec's own, so the file it writes is in a scratch directory
// and never a conversation anyone keeps (`helpers/instance.ts`).
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { type Driver, Instance, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long FSEvents, the page's read and its reconcile may take to show an
 *  edit. FSEvents coalesces; the store's own test allows the same. */
const REPORTED_MS = 10_000;
/** How long the window's own save may take to replace the outside edit: the
 *  canvas's save debounce (500 ms) and a write, with room over. */
const SAVED_MS = 5_000;

const NOTES = "# Notes\n\nFirst line.\n\nSecond line.\n";

type Chat = {
	getDocument(): string;
	edit(resolve: (md: string) => { changes: { from: number; insert: string }; caret: number }): void;
	view: { state: { selection: { main: { head: number } } }; dispatch(spec: { selection: { anchor: number } }): void };
};

const documentText = (driver: Driver) =>
	driver.execute(() => (document.querySelector("document-chat") as unknown as Chat).getDocument());

const caret = (driver: Driver) =>
	driver.execute(() => (document.querySelector("document-chat") as unknown as Chat).view.state.selection.main.head);

/** What the window draws, as a reader sees it — not the buffer behind it. */
const drawnText = (driver: Driver) =>
	driver.execute(() => document.querySelector(".cm-content")?.textContent ?? "");

/** The status line's text, when it is drawn at all. */
const statusLine = (driver: Driver) =>
	driver.execute(() => {
		const status = document.getElementById("status")!;
		const box = status.getBoundingClientRect();
		const shown = box.width > 0 && box.height > 0 && getComputedStyle(status).visibility !== "hidden";
		return shown ? (status.textContent ?? "") : "";
	});

describe("an edit made outside the app", () => {
	let docDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	it("reaches the open window in place, and an unsaved window keeps its copy and says so", async () => {
		docDir = scratch("outside-edit");
		const file = join(docDir, "welcome.md");
		writeFileSync(file, NOTES);

		const launched = await Instance.launch({ docDir });
		app = launched.app;
		const { driver } = launched;
		expect(await documentText(driver)).toBe(NOTES);

		// The caret at the end of "First line." — where a writer who clicked
		// there left it. The edit below lands after it, so an in-place
		// reconcile keeps the offset, and a reload (`setDocument`) would move
		// it to the end of the page. Asserting the two differ is what makes
		// "it stayed" mean something.
		const at = NOTES.indexOf("First line.") + "First line.".length;
		await driver.execute((anchor: number) => {
			(document.querySelector("document-chat") as unknown as Chat).view.dispatch({ selection: { anchor } });
		}, at);
		expect(await caret(driver)).toBe(at);

		// Written in place, with the plain filesystem API — no part of the app
		// is involved in making the change.
		const edited = `${NOTES}\nEdited from the shell.\n`;
		expect(at).toBeLessThan(edited.length);
		writeFileSync(file, edited);
		await until(
			async () => (await drawnText(driver)).includes("Edited from the shell."),
			REPORTED_MS,
			"an edit written in place never reached the window",
		);
		expect(await documentText(driver)).toBe(edited);
		expect(await caret(driver)).toBe(at);
		expect(await statusLine(driver)).toBe("");

		// Written beside and renamed over, as `git checkout` and most editors
		// save: the document's own name is a different file afterwards.
		const renamed = `${edited}\nSaved by rename.\n`;
		writeFileSync(join(docDir, "welcome.md.tmp"), renamed);
		renameSync(join(docDir, "welcome.md.tmp"), file);
		await until(
			async () => (await drawnText(driver)).includes("Saved by rename."),
			REPORTED_MS,
			"an edit saved by rename never reached the window",
		);
		expect(await documentText(driver)).toBe(renamed);
		expect(await caret(driver)).toBe(at);

		// Now the window has text no save has taken — an authored edit, still
		// inside the canvas's save debounce — when the file changes underneath.
		// The keystrokes exist only here and the outside edit is still in
		// whatever made it, so the window keeps its copy and says so.
		await driver.execute(() => {
			(document.querySelector("document-chat") as unknown as Chat).edit((md) => ({
				changes: { from: md.length, insert: "kept here\n" },
				caret: md.length + "kept here\n".length,
			}));
		});
		writeFileSync(file, `${renamed}\nfrom elsewhere\n`);

		const notice = await until(
			async () => {
				const text = await statusLine(driver);
				return text.includes("changed outside") ? text : undefined;
			},
			REPORTED_MS,
			"the window never said it kept its copy over the outside edit",
		);
		expect(notice).toContain("this window's copy was kept");
		const kept = await documentText(driver);
		expect(kept).toContain("kept here");
		expect(kept).not.toContain("from elsewhere");

		// And its next save is what the file holds: the outside edit is
		// replaced on disk, not merged and not left standing.
		await until(
			() => readFileSync(file, "utf8").includes("kept here"),
			SAVED_MS,
			"the window's save never replaced the outside edit",
		);
		expect(readFileSync(file, "utf8")).not.toContain("from elsewhere");
	});
});
