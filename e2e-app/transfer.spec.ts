// A conversation leaves the app as a zip and comes back in (ADR 0049). Layer
// 4, because the halves under test are only joined here: the menu's event
// opening a window of its own, that window's page, the commands, a real
// archive written and read back, and the store. The page layer
// (`e2e/app-page.spec.ts`) holds what each window asks for and says;
// `src-tauri/src/bundle.rs` holds the file work.
//
// What stays manual (`docs/running-the-app.md` step 14) is the system panel:
// WebDriver cannot drive one, so a driven build takes its answers from
// `PIARY_E2E_PICK` and `PIARY_E2E_EXPORT_DIR` instead of showing it
// (`docs/TEST_ARCHITECTURE.md` §6).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect } from "@wdio/globals";
import { type Driver, Instance, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long a window, a save and an archive made or read may take. */
const DONE_MS = 15_000;

/** How long a conversation may take to be drawn and written: the canvas is
 *  loaded, its cells run and what they drew stands still before it is taken. */
const DRAWN_MS = 45_000;

/** How long a script may take while a new window's page is still loading,
 *  and the driver's own default, put back once it has answered. */
const FIRST_SCRIPT_MS = 2_000;
const SCRIPT_MS = 30_000;

const SHOT = "shot-a1b2c3d4.png";
const NOTES = `---\npi: v1\nsession: welcome\n---\n\n<!-- pi:file image/png #${SHOT} -->\n\n![shot.png](/attachments/${SHOT})\n\n<!-- you -->\n\nwhat is in the picture\n`;

type Chat = {
	getDocument(): string;
	edit(resolve: (md: string) => { changes: { from: number; insert: string }; caret: number }): void;
};

const documentText = (driver: Driver) =>
	driver.execute(() => (document.querySelector("document-chat") as unknown as Chat).getDocument());

/** Chooses a File menu item the way the menu does — its event, to the page in
 *  front — and moves to the window that opens. */
async function openFromMenu(driver: Driver, id: string): Promise<void> {
	const before = await driver.windows();
	await driver.execute(
		(payload: string) =>
			(window as unknown as { __TAURI_INTERNALS__: { invoke(cmd: string, args: unknown): Promise<unknown> } }).__TAURI_INTERNALS__
				.invoke("plugin:event|emit", { event: "menu", payload })
				.then(() => true),
		id,
	);
	const opened = await until(
		async () => (await driver.windows()).find((handle) => !before.includes(handle)),
		DONE_MS,
		`the ${id} item opened no window`,
	);
	await driver.switchTo(opened);
	// A script sent to a webview that has not loaded yet is not refused: it
	// waits out the whole script timeout. So the page is asked with a short
	// one until it answers, and a try that timed out is one more "not yet".
	await driver.command("POST", "/timeouts", { script: FIRST_SCRIPT_MS });
	try {
		await until(
			() => driver.execute(() => document.querySelector(".transfer-actions") !== null).catch(() => false),
			DONE_MS,
			`the ${id} window never drew`,
		);
	} finally {
		await driver.command("POST", "/timeouts", { script: SCRIPT_MS });
	}
}

/** Clicks the first button or labelled choice whose text starts with `label`;
 *  false while there is none. Clicked in the page: a driven window is
 *  click-through. */
const choose = (driver: Driver, label: string) =>
	driver.execute((starts: string) => {
		const found = [...document.querySelectorAll<HTMLElement>("button, label")].find((el) => (el.textContent ?? "").trim().startsWith(starts));
		found?.click();
		return found !== undefined;
	}, label);

const outcome = (driver: Driver) => driver.execute(() => document.getElementById("outcome")?.textContent ?? "");

const statusLine = (driver: Driver) => driver.execute(() => document.getElementById("status")?.textContent ?? "");

/** A launch, tried again once. A cold WebKit right after another instance
 *  ended can time out the first script that asks whether the canvas has
 *  drawn, and this file starts three in a row. The failed try ends its own
 *  app. */
const launch = (options: Parameters<typeof Instance.launch>[0]) => Instance.launch(options).catch(() => Instance.launch(options));

describe("a conversation exported and imported", () => {
	let docDir = "";
	let outDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
		rmScratch(outDir);
	});

	/** A store holding `welcome` with its picture, and an empty place to export to. */
	function store(): string {
		docDir = scratch("transfer-docs");
		outDir = scratch("transfer-out");
		mkdirSync(join(docDir, "attachments"));
		writeFileSync(join(docDir, "welcome.md"), NOTES);
		writeFileSync(join(docDir, "attachments", SHOT), "the picture");
		return join(docDir, "welcome.md");
	}

	it("leaves as a zip with the attachment it references, and comes back beside the original", async () => {
		store();
		// Another conversation's file, which must stay behind.
		writeFileSync(join(docDir, "attachments", "other-ffffffff.png"), "not this one's");

		const zip = join(outDir, "welcome.zip");
		const launched = await launch({ docDir, env: { PIARY_E2E_EXPORT_DIR: outDir, PIARY_E2E_PICK: zip } });
		app = launched.app;
		const { driver } = launched;
		const [main] = await driver.windows();

		await openFromMenu(driver, "export");
		// The conversation that was in front is the one chosen.
		expect(await driver.execute(() => [...document.querySelectorAll<HTMLInputElement>(".transfer-list input:checked")].map((box) => box.value))).toEqual(["welcome"]);
		await choose(driver, "Zip");
		await choose(driver, "Export…");
		await until(() => existsSync(zip), DONE_MS, "the export wrote no zip");
		await until(async () => (await outcome(driver)) === `welcome → ${basename(outDir)}/welcome.zip.`, DONE_MS, "the export was never reported");
		// Listed by the system's own tool, not the code that wrote it: the
		// archive is for other programs to open too.
		const listing = execFileSync("/usr/bin/zipinfo", ["-1", zip], { encoding: "utf8" }).split("\n");
		expect(listing).toContain("welcome/welcome.md");
		expect(listing).toContain(`welcome/attachments/${SHOT}`);
		expect(listing.some((entry) => entry.includes("other-ffffffff.png"))).toBe(false);

		// The same file is what the import's panel answers with. The name is
		// taken by the conversation it came from, so the window asks.
		await driver.switchTo(main!);
		await openFromMenu(driver, "import");
		await choose(driver, "Choose a Markdown file");
		await until(() => choose(driver, "Keep both: import this one as welcome-2"), DONE_MS, "a taken name was not asked about");
		await choose(driver, "Import");
		const copy = join(docDir, "welcome-2.md");
		await until(() => existsSync(copy), DONE_MS, "the import wrote no document");
		await until(async () => (await outcome(driver)) === "Imported as welcome-2.", DONE_MS, "the import was never reported");
		// Its own pi session, the rest byte for byte; the original untouched.
		expect(readFileSync(copy, "utf8")).toBe(NOTES.replace("session: welcome", "session: welcome-2"));
		expect(readFileSync(join(docDir, "welcome.md"), "utf8")).toBe(NOTES);
		// The store already held the same bytes under the name: nothing new.
		expect(readFileSync(join(docDir, "attachments", SHOT), "utf8")).toBe("the picture");

		// A row's ⋯ asks for the copy's export while the Export window is still
		// open: the same window, now on the copy alone, which it had never listed.
		const before = await driver.windows();
		await driver.switchTo(main!);
		await driver.invoke("open_transfer", { kind: "export", from: "welcome-2" });
		const chosen = () => driver.execute(() => [...document.querySelectorAll<HTMLInputElement>(".transfer-list input:checked")].map((box) => box.value));
		const exportWindow = await until(
			async () => {
				for (const handle of await driver.windows()) {
					await driver.switchTo(handle);
					if (await driver.execute(() => document.getElementById("export") !== null)) return handle;
				}
				return undefined;
			},
			DONE_MS,
			"the Export window is gone",
		);
		await driver.switchTo(exportWindow);
		await until(async () => JSON.stringify(await chosen()) === '["welcome-2"]', DONE_MS, "the open Export window never took the conversation asked for");
		// And no second Export window.
		expect((await driver.windows()).length).toBe(before.length);
	});

	it("leaves drawn, as a web page and as a PDF, with what its cell computed in both", async () => {
		// The halves joined only here (ADR 0066): the Export window running the
		// conversation's cell in a canvas nobody sees, Rust writing the page it
		// is handed, and the system printing that window to a file.
		docDir = scratch("transfer-docs");
		outDir = scratch("transfer-out");
		// The view is the first a2ui surface this app has shown: its renderer is
		// loaded for the export, and the export waits for it.
		const surface = {
			components: [
				{ id: "root", component: "Column", children: ["said", "days"] },
				{ id: "said", component: "Text", variant: "caption", text: "Kilometres walked each day." },
				{ id: "days", component: "Chart", mark: "bar", x: "day", y: "km", data: [{ day: "Mon", km: 12 }, { day: "Tue", km: 30 }] },
			],
		};
		const drawn = `---\npi: v1\nsession: welcome\n---\n\n# The walk\n\n<!-- you -->\n\nhow far is it\n\n<!-- pi -->\n\nIt is **42 km**.\n\n<!-- pi:view a2ui #toolu_a -->\n\n\`\`\`json\n${JSON.stringify(surface)}\n\`\`\`\n\n<!-- pi:result #toolu_a -->\n\n\`\`\`\nok\n\`\`\`\n\n<!-- pi:cell js #sum -->\n\n\`\`\`js\n6 * 7 * 1000\n\`\`\`\n\n<!-- you -->\n\n`;
		writeFileSync(join(docDir, "welcome.md"), drawn);
		const launched = await launch({ docDir, env: { PIARY_E2E_EXPORT_DIR: outDir } });
		app = launched.app;
		const { driver } = launched;

		await openFromMenu(driver, "export");
		await choose(driver, "Web page");
		await choose(driver, "Export…");
		const page = join(outDir, "welcome.html");
		await until(async () => (await outcome(driver)) === `welcome → ${basename(outDir)}/welcome.html.`, DRAWN_MS, "the web page was never reported");
		const html = readFileSync(page, "utf8");
		expect(html).toContain("<title>The walk</title>");
		expect(html).toContain("It is <strong>42 km</strong>.");
		// What the cell computed, not only its source.
		expect(html.replace(/<[^>]*>/g, "")).toContain("42000");
		expect(html).toContain("6 * 7 * 1000");
		// The surface as it was drawn: its words, and its chart as a drawing.
		expect(html).toContain("Kilometres walked each day.");
		expect(html).toMatch(/<svg[^>]*class="plot-/);
		expect(html).not.toContain("<script");

		await choose(driver, "PDF");
		await choose(driver, "Export…");
		const pdf = join(outDir, "welcome.pdf");
		await until(async () => (await outcome(driver)) === `welcome → ${basename(outDir)}/welcome.pdf.`, DRAWN_MS, "the PDF was never reported");
		expect(readFileSync(pdf).subarray(0, 5).toString("latin1")).toBe("%PDF-");
		// Read by the system's own PDF reader, not the code that asked for it:
		// the file is for other programs, and its text is text.
		const read = execFileSync(
			"/usr/bin/osascript",
			["-l", "JavaScript", "-e", `ObjC.import("PDFKit"); const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(${JSON.stringify(pdf)})); d.pageCount + "\\n" + d.string.js`],
			{ encoding: "utf8" },
		);
		const [pages, ...text] = read.split("\n");
		expect(Number(pages)).toBeGreaterThanOrEqual(1);
		expect(text.join(" ")).toContain("It is 42 km.");
		expect(text.join(" ")).toContain("42000");
		expect(text.join(" ")).toContain("Kilometres walked each day.");
		// The form the window shows on screen is not on the paper.
		expect(text.join(" ")).not.toContain("Which conversations");
		// And the same name is never printed over.
		await choose(driver, "Export…");
		await until(async () => (await outcome(driver)).includes("welcome.pdf is already there"), DRAWN_MS, "a second PDF under the same name was not refused");
	});

	it("replaces a conversation a window shows, keeps what it replaced, and the window follows", async () => {
		const file = store();
		const saved = join(outDir, "welcome.md");
		const launched = await launch({ docDir, env: { PIARY_E2E_EXPORT_DIR: outDir, PIARY_E2E_PICK: saved } });
		app = launched.app;
		const { driver } = launched;
		const [main] = await driver.windows();

		await openFromMenu(driver, "export");
		await choose(driver, "Export…");
		await until(() => existsSync(saved), DONE_MS, "the export wrote no file");
		expect(readFileSync(saved, "utf8")).toBe(NOTES);

		// The conversation moves on after the export, and the store has it.
		await driver.switchTo(main!);
		await driver.execute(() => {
			(document.querySelector("document-chat") as unknown as Chat).edit((md) => ({
				changes: { from: md.length, insert: "written since\n" },
				caret: md.length + "written since\n".length,
			}));
		});
		const moved = `${NOTES}written since\n`;
		await until(() => readFileSync(file, "utf8") === moved, DONE_MS, "the edit was never saved");

		await openFromMenu(driver, "import");
		await choose(driver, "Choose a Markdown file");
		await until(() => choose(driver, "Replace welcome"), DONE_MS, "a taken name was not asked about");
		await choose(driver, "Import");
		await until(() => readFileSync(file, "utf8") === NOTES, DONE_MS, "the import did not replace the document");
		await until(async () => (await outcome(driver)) === "Imported as welcome.", DONE_MS, "the import was never reported");
		// The window showing it takes the file in as an outside edit is taken
		// (ADR 0018), with nothing said about a file changed behind it.
		await driver.switchTo(main!);
		await until(async () => (await documentText(driver)) === NOTES, DONE_MS, "the window kept the replaced text");
		expect(await statusLine(driver)).toBe("");
		// What was replaced can be had back.
		const backups = join(docDir, ".backups", "welcome");
		const kept = readdirSync(backups).map((name) => readFileSync(join(backups, name), "utf8"));
		expect(kept).toContain(moved);
	});

	it("leaves alert and confirm answering as the webview always has", async () => {
		store();
		const launched = await launch({ docDir });
		app = launched.app;
		// The dialog plugin swaps both for calls the page is not granted: a
		// `confirm` that returned its rejected promise would read as a yes.
		expect(await launched.driver.execute(() => [window.confirm("sure?"), window.alert("hi") ?? null])).toEqual([false, null]);
	});
});
