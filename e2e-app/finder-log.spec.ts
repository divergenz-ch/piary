// A page-side throw in an app launched from Finder lands in the app's log file
// (`src-tauri/src/diag.rs`, `docs/packaging.md` §5) — the one place it can
// reach when the process has no terminal.
//
// The launch is `open` on a bundle, so LaunchServices starts the process with
// launchd as its parent, no controlling terminal, and launchd's environment —
// the conditions a Finder double-click creates. The bundle wraps the `e2e`
// binary rather than a `tauri build` one (`helpers/instance.ts`), so what this
// does not see is a release bundle's own layout and signature; that it resolves
// the log directory and writes there from a Finder-shaped launch is the claim.
//
// The log is the user's own, read and never truncated: the throw carries a
// marker no other line could hold, and the spec looks for that.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { Launched, rmScratch, running, scratch, until } from "./helpers/instance.ts";

/** Where Tauri's `app_log_dir` puts the log on macOS, for the identifier in
 *  `src-tauri/tauri.conf.json`. Console.app lists it under Log Reports. */
const LOG_DIR = join(homedir(), "Library", "Logs", "ch.divergenz.piary");
/** How long a forwarded throw may take to reach the file: one IPC call and an
 *  unbuffered append, with room for a slow machine. */
const LOGGED_MS = 10_000;
/** How long the launched app has to quit once asked. */
const QUIT_MS = 15_000;

/** Both generations, so a rotation landing mid-spec does not hide the line. */
const logged = (marker: string) =>
	["piary.log", "piary.1.log"]
		.map((name) => join(LOG_DIR, name))
		.some((path) => existsSync(path) && readFileSync(path, "utf8").includes(marker));

describe("the log a Finder launch leaves", () => {
	let docDir = "";
	let app: Launched | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	it("holds a page-side throw from an app with no terminal", async () => {
		docDir = scratch("finder-docs");
		const opened = await Launched.open({ PI_DOC_DIR: docDir });
		app = opened.app;
		const { driver } = opened;

		// What makes this a Finder launch rather than a child of the test:
		// launchd is the parent, and there is no terminal for stdout to reach.
		expect(app.proc!.ppid).toBe(1);
		expect(app.proc!.tty).toBe("??");

		const marker = `finder-launch-throw-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		expect(logged(marker)).toBe(false);
		// Thrown from a timer, so it is uncaught by anything — the case the
		// page's own forwarding (`src/forward-console.ts`) exists for.
		await driver.execute((text: string) => {
			setTimeout(() => {
				throw new Error(text);
			});
		}, marker);

		await until(() => logged(marker), LOGGED_MS, `the throw never reached ${LOG_DIR}/piary.log`);

		process.kill(app.proc!.pid, "SIGTERM");
		await until(() => !running(app!.proc!), QUIT_MS, "the Finder-launched app did not quit on SIGTERM");
	});
});
