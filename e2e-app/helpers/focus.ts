// Whether a run took the user's focus.
//
// A run the harness drives must never make Piary the active app: the developer
// is using the machine while it runs (`src-tauri/src/main.rs`). This watches the
// frontmost app for the length of a spec file and names every moment one of the
// binaries under test held it. An installed Piary the developer is using is not
// a binary under test, and is never counted.
//
// What it cannot see: the service's own app is launched by the WDIO launcher
// before the worker that loads this exists, so that one launch is sampled only
// if its activation lasts into the first test. The apps a spec launches itself
// (`Instance`, `Launched`) are watched from before they start.
//
// `lsappinfo` rather than `osascript … System Events`: it needs no Automation
// permission, so the check cannot itself put up a prompt.

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename } from "node:path";
import { promisify } from "node:util";
import { BINARY } from "./instance.ts";

const run = promisify(execFile);

/** How often the frontmost app is sampled. Activation that lasts less than
 *  this can go unseen; activation that matters to a person lasts longer. */
const SAMPLE_MS = 200;

const TMP = realpathSync(tmpdir());

/** The executable of the frontmost app, or undefined when none can be read. */
async function frontmost(): Promise<string | undefined> {
	try {
		const asn = (await run("lsappinfo", ["front"])).stdout.trim();
		if (!asn) return undefined;
		const info = (await run("lsappinfo", ["info", "-only", "pid", asn])).stdout;
		const pid = /"pid"=(\d+)/.exec(info)?.[1];
		if (!pid) return undefined;
		return (await run("ps", ["-o", "comm=", "-p", pid])).stdout.trim() || undefined;
	} catch {
		// A process that exits between the two calls has no answer; the next
		// sample has one.
		return undefined;
	}
}

/** The binary `pnpm app:e2e:build` made, or a bundled copy of it in a scratch
 *  directory (`Launched.open`). */
function underTest(executable: string): boolean {
	return executable === BINARY || (basename(executable) === "piary" && executable.startsWith(TMP));
}

export class FocusWatch {
	readonly #taken: string[] = [];
	#during = "";
	#timer: ReturnType<typeof setInterval> | undefined;
	#sampling = false;

	start(): void {
		this.#timer = setInterval(() => {
			if (this.#sampling) return;
			this.#sampling = true;
			void frontmost().then((executable) => {
				this.#sampling = false;
				const during = `"${this.#during || "launch"}"`;
				if (executable && underTest(executable) && !this.#taken.some((seen) => seen.startsWith(during))) {
					this.#taken.push(`${during} (${executable})`);
				}
			});
		}, SAMPLE_MS);
	}

	/** Names the test the next samples belong to. */
	during(title: string): void {
		this.#during = title;
	}

	/** Stops watching; throws naming every test during which Piary was frontmost. */
	stop(): void {
		clearInterval(this.#timer);
		if (this.#taken.length) {
			throw new Error(
				`the app under test took the user's focus during: ${this.#taken.join(", ")}`,
			);
		}
	}
}
