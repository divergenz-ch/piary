// A quit writes what the window held and ends every child the app started
// (ADR 0019 §2). Layer 4, because the whole sequence — a signal, the page's
// flush over the real event loop, the reap — exists only in a running app.
//
// The quit is a SIGTERM to the app's own process, which enters the same
// sequence the Quit item does (`src-tauri/src/teardown.rs`: both go through
// `AppHandle::exit`). What stays manual is ⌘Q's menu binding itself: layer 4
// must not assert a keystroke (ADR 0014, docs/TEST_ARCHITECTURE.md §6), and a
// page cannot click a native menu item — `docs/running-the-app.md` step 13.
//
// The app is this spec's own, not the WDIO service's: the quit ends the process
// the session would be driving (`helpers/instance.ts`).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { FAKE_PI, Instance, rmScratch, running, scratch, until } from "./helpers/instance.ts";

/** How long the children have to appear once the commands that start them
 *  have returned — a spawn is immediate, but `ps` sees a fork before its exec. */
const CHILDREN_START_MS = 5_000;
/** How long the quit may take: the page's bound (`exit::ANSWER_BOUND`, 4 s)
 *  plus a stop's grace for the pi that ignores its stdin, with room over. */
const QUIT_MS = 15_000;
/** How long an ended child may still show in `ps`: one killed by a group kill
 *  is collected by launchd, not by the app, a beat after the app is gone. */
const COLLECTED_MS = 2_000;

/** 128 + SIGTERM: what the sequence exits with for a signal
 *  (`exit::Exit::signalled`). The default action's death by signal would
 *  arrive as `signal: "SIGTERM"` instead, and mean no sequence ran. */
const SIGTERM_EXIT = { code: 143, signal: null };

/** The canvas's save debounce (`SAVE_DEBOUNCE_MS` in DocumentChat.ts). An exit
 *  inside it means the page's own save timer never fired. */
const SAVE_DEBOUNCE_MS = 500;

describe("quitting the app", () => {
	let docDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	/** Launches an app on a scratch document — the window's own ("welcome"
	 *  without `?doc=`, `app/main.ts`), seeded so the store has a directory to
	 *  watch from the first frame. */
	async function launch() {
		docDir = scratch("quit");
		const file = join(docDir, "welcome.md");
		writeFileSync(file, "# Before the quit\n");
		const launched = await Instance.launch({ docDir, env: { PI_CLI: FAKE_PI } });
		app = launched.app;
		return { file, app: launched.app, driver: launched.driver };
	}

	async function quit(target: Instance) {
		process.kill(target.pid, "SIGTERM");
		return Promise.race([
			target.exited,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the app did not quit")), QUIT_MS)),
		]);
	}

	it("writes the window's last edit when sent SIGTERM", async () => {
		// Nothing else is running, so the quit is over in well under the
		// canvas's save debounce — which is what makes the flush the only thing
		// that can have written the edit. With a pi to stop, the quit lasts long
		// enough for the debounce to land it on its own, and this would pass with
		// no flush at all. So that premise is asserted, not assumed: an exit
		// later than the debounce fails here, saying why, rather than passing
		// on a save the flush did not make.
		const { file, app: target, driver } = await launch();

		// An authored edit through the canvas's own API (layer 4 does not type,
		// ADR 0014), so the save path is a writer's.
		const line = `written just before the quit ${Date.now()}`;
		await driver.execute((text: string) => {
			const chat = document.querySelector("document-chat") as unknown as {
				edit(resolve: (md: string) => { changes: { from: number; insert: string }; caret: number }): void;
			};
			chat.edit((md) => ({ changes: { from: md.length, insert: `\n${text}\n` }, caret: md.length + text.length + 2 }));
		}, line);
		const editedAt = Date.now();
		expect(readFileSync(file, "utf8")).not.toContain(line);

		expect(await quit(target)).toEqual(SIGTERM_EXIT);
		const quitTook = Date.now() - editedAt;
		if (quitTook >= SAVE_DEBOUNCE_MS) {
			throw new Error(
				`the app exited ${quitTook} ms after the edit, past the save debounce, so the edit may be the debounce's and not the flush's`,
			);
		}
		expect(readFileSync(file, "utf8")).toContain(line);
	});

	it("leaves no child running when sent SIGTERM", async () => {
		const { app: target, driver } = await launch();

		// Two sessions, because pi can outlive a quit two ways. `tools` starts a
		// long-running child and lingers: closing its stdin ends the shell but
		// not the child, which is the orphan only a group kill ends. `deaf`
		// ignores its stdin closing, so only the kill ends it at all.
		await driver.invoke("pi_start", { sid: "quit-tools", args: ["--fake", "tools"] });
		await driver.invoke("pi_start", { sid: "quit-deaf", args: ["--fake", "deaf"] });
		await driver.invoke("pty_open", {
			request: { sid: "quit-term", termId: "quit-term-1", command: "/bin/sh", pi: false, args: [], cwd: docDir, cols: 80, rows: 24 },
		});
		// The helper starts without a Screen Recording grant: it is asked for one
		// only when a capture begins, and this spec starts none.
		await driver.invoke("capture_start");

		// Every child, by role, before the quit — so "none survives" below is a
		// claim about processes that were demonstrably there.
		const roles = await until(
			() => {
				const below = target.record();
				const tools = below.find((proc) => proc.command.includes("--session-id quit-tools"));
				const toolChild = tools && below.find((proc) => proc.ppid === tools.pid);
				// `deaf` execs `sleep`, so its command line no longer names the
				// session; it is the session leader (pi runs in a group of its
				// own) directly under the app.
				const deaf = below.find(
					(proc) => proc.ppid === target.pid && proc.pgid === proc.pid && proc.command.startsWith("sleep"),
				);
				// The PTY's shell is the only child with a terminal of its own.
				const shell = below.find((proc) => proc.ppid === target.pid && proc.tty !== "??");
				const capture = below.find((proc) => proc.command.endsWith("piary-capture"));
				return tools && toolChild && deaf && shell && capture
					? { pi: tools, "pi's tool child": toolChild, "a pi that ignores stdin": deaf, shell, capture }
					: undefined;
			},
			CHILDREN_START_MS,
			"not every child the spec started showed up under the app",
		);

		expect(await quit(target)).toEqual(SIGTERM_EXIT);

		await until(() => Object.values(roles).every((proc) => !running(proc)), COLLECTED_MS, "").catch(() => {
			// Timing out is not the failure; the survivors named below are.
		});
		const survivors = Object.entries(roles)
			.filter(([, proc]) => running(proc))
			.map(([role, proc]) => `${role} (${proc.pid} ${proc.command})`);
		expect(survivors).toEqual([]);
	});
});
