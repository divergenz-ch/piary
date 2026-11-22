// An app instance a spec launches and ends itself, rather than the one the WDIO
// service holds open for `shell.spec.ts`.
//
// The service's instance cannot answer what these specs ask. A quit ends the
// process the session is driving, so it cannot be the session's own app; an
// outside edit needs a document directory the test can write behind the app's
// back; a Finder launch is a different parent altogether. So each spec starts
// its own binary on its own WebDriver port, with its own scratch documents,
// and speaks the W3C protocol to it directly — four requests, which is less
// than a second client library would cost (docs/HANDBOOK.md §Dependency Policy).
//
// Every process this module starts is tracked by pid and ended in `dispose`,
// and nothing else is ever signalled: a developer's own `pnpm app` is
// typically running beside the suite, from the same binary path.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "..", "..");

/** The binary layer 4 drives. `pnpm app:e2e:build` leaves it here; a RELEASE
 *  binary has no WebDriver server at all (`src-tauri/src/main.rs`). */
export const BINARY = join(REPO, "src-tauri", "target", "debug", "piary");

/** The stand-in for `pi --mode rpc` the Rust tests use: a real process on the
 *  real wire, whose behaviour is chosen by the `--fake <mode>` it is handed. */
export const FAKE_PI = join(REPO, "src-tauri", "tests", "fixtures", "fake-pi");

/** How long a launched app has to answer `/status`. The page is embedded in the
 *  e2e build (`tauri/custom-protocol`) and boots a real editor; a cold WebKit
 *  takes several seconds. */
const SERVER_READY_MS = 30_000;
/** How long the canvas has to draw its first line once the server answers. */
const CANVAS_READY_MS = 15_000;
/** How often a condition outside the process is re-read. */
const POLL_MS = 100;

/** The shared temp root every scratch directory goes under. */
export function scratch(prefix: string): string {
	return mkdtempSync(join(tmpdir(), `piary-${prefix}-`));
}

/** Removes a scratch directory, if one was made. */
export function rmScratch(dir: string): void {
	if (dir) rmSync(dir, { recursive: true, force: true });
}

/** A port nothing is listening on, so an instance never meets the service's
 *  fixed 4445 or a developer's own test run. */
export function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			server.close(() => resolve(port));
		});
	});
}

/** Polls `condition` until it holds, or fails with `message`. */
export async function until<T>(
	condition: () => T | undefined | false | Promise<T | undefined | false>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await condition();
		if (value) return value;
		if (Date.now() > deadline) throw new Error(message);
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
}

/** One W3C WebDriver session against an app's embedded server. */
export class Driver {
	readonly #base: string;
	readonly #session: string;

	private constructor(base: string, session: string) {
		this.#base = base;
		this.#session = session;
	}

	/** Waits for the server on `port`, opens a session, and waits for the
	 *  canvas — the floor every spec stands on. */
	static async attach(port: number, alive: () => boolean = () => true): Promise<Driver> {
		const base = `http://127.0.0.1:${port}`;
		await until(
			async () => {
				if (!alive()) throw new Error("the app exited before its WebDriver server answered");
				return fetch(`${base}/status`).then(
					(response) => response.ok,
					() => false,
				);
			},
			SERVER_READY_MS,
			`no WebDriver server answered on ${port} — is the binary an \`e2e\` build, and is the dev server up?`,
		);
		const created = (await post(`${base}/session`, { capabilities: { alwaysMatch: {} } })) as {
			sessionId: string;
		};
		const driver = new Driver(base, created.sessionId);
		await until(
			() => driver.execute(() => document.querySelectorAll(".cm-line").length > 0),
			CANVAS_READY_MS,
			"the canvas never rendered a line",
		);
		return driver;
	}

	/** Runs `fn` in the page and returns what it resolves to. `fn` is sent as
	 *  source, so it may close over nothing but its arguments. */
	execute<T, A extends unknown[]>(fn: (...args: A) => T | Promise<T>, ...args: A): Promise<T> {
		return post(`${this.#base}/session/${this.#session}/execute/sync`, {
			script: `return (${fn.toString()}).apply(null, arguments);`,
			args,
		}) as Promise<T>;
	}

	/** Any other W3C command on this session, by method and the path after
	 *  `/session/{id}`: `GET /screenshot`, `POST /actions`, `POST /window/rect`. */
	command(method: "GET" | "POST", path: string, body: unknown = {}): Promise<unknown> {
		const url = `${this.#base}/session/${this.#session}${path}`;
		return method === "POST" ? post(url, body) : get(url);
	}

	/** Every window's handle, in the order they were opened. */
	windows(): Promise<string[]> {
		return this.command("GET", "/window/handles") as Promise<string[]>;
	}

	/** Makes `handle`'s window the one every later command acts in. */
	async switchTo(handle: string): Promise<void> {
		await this.command("POST", "/window", { handle });
	}

	/** Runs an IPC command the way the page would, resolving a refusal to a
	 *  thrown error here rather than an opaque driver failure. */
	async invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
		const outcome = await this.execute(
			(cmd: string, params: Record<string, unknown>) =>
				(
					window as unknown as { __TAURI_INTERNALS__: { invoke: (c: string, a: unknown) => Promise<unknown> } }
				).__TAURI_INTERNALS__.invoke(cmd, params).then(
					(value: unknown) => ({ value }),
					(error: unknown) => ({ error: String(error) }),
				),
			command,
			args,
		);
		const { value, error } = outcome as { value?: T; error?: string };
		if (error !== undefined) throw new Error(`${command}: ${error}`);
		return value as T;
	}
}

async function get(url: string): Promise<unknown> {
	const response = await fetch(url);
	const { value } = (await response.json()) as { value: unknown };
	if (!response.ok) throw new Error(`${url}: ${JSON.stringify(value)}`);
	return value;
}

async function post(url: string, body: unknown): Promise<unknown> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	const { value } = (await response.json()) as { value: unknown };
	if (!response.ok) throw new Error(`${url}: ${JSON.stringify(value)}`);
	return value;
}

/** A process as `ps` reported it when it was recorded. */
export interface Proc {
	pid: number;
	ppid: number;
	pgid: number;
	tty: string;
	command: string;
}

function table(): Proc[] {
	return execFileSync("ps", ["-axww", "-o", "pid=,ppid=,pgid=,tty=,command="], { encoding: "utf8" })
		.split("\n")
		.map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
		.filter((match): match is RegExpMatchArray => match !== null)
		.map(([, pid, ppid, pgid, tty, command]) => ({
			pid: Number(pid),
			ppid: Number(ppid),
			pgid: Number(pgid),
			tty: tty!,
			command: command!,
		}));
}

/** Every process below `root`, however deep. */
export function descendants(root: number): Proc[] {
	const all = table();
	const found: Proc[] = [];
	let frontier = [root];
	while (frontier.length > 0) {
		const children = all.filter((proc) => frontier.includes(proc.ppid));
		found.push(...children);
		frontier = children.map((proc) => proc.pid);
	}
	return found;
}

/** The process with this pid, when there is one. */
export function find(pid: number): Proc | undefined {
	return table().find((proc) => proc.pid === pid);
}

/** Whether `proc` is still running: the same pid with the same command line,
 *  so a pid reused by something else since is not mistaken for it, and not a
 *  zombie, which has ended and only waits to be collected. */
export function running(proc: Proc): boolean {
	try {
		const [stat, ...command] = execFileSync("ps", ["-ww", "-o", "stat=,command=", "-p", String(proc.pid)], {
			encoding: "utf8",
		})
			.trim()
			.split(/\s+/);
		return !stat!.startsWith("Z") && command.join(" ") === proc.command.replace(/\s+/g, " ");
	} catch {
		// `ps -p` exits non-zero when the pid does not exist, which is the answer.
		return false;
	}
}

/** Ends `procs` that are still running. Only ever handed processes a spec
 *  recorded below an app it launched itself. */
export function killAll(procs: readonly Proc[]): void {
	for (const proc of procs) {
		if (!running(proc)) continue;
		try {
			process.kill(proc.pid, "SIGKILL");
		} catch {
			// Gone between the check and the kill, which is what was wanted.
		}
	}
}

/** What a launched app needs to know about its own world. */
export interface LaunchOptions {
	/** The document directory (`PI_DOC_DIR`). Created by the caller: the store
	 *  watches only a directory that exists at launch (`src-tauri/src/store.rs`). */
	docDir: string;
	env?: Record<string, string>;
	/** The executable; the e2e build at `BINARY` when unset. */
	binary?: string;
	/** The working directory, which is the workspace pi answers in. */
	cwd?: string;
}

/** An app this spec started, as a child of the test process. */
export class Instance {
	readonly child: ChildProcess;
	readonly port: number;
	/** Resolves with how the process ended. */
	readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
	#ended = false;
	/** Everything recorded below this app, ended with it in `dispose`. */
	readonly recorded: Proc[] = [];

	private constructor(child: ChildProcess, port: number) {
		this.child = child;
		this.port = port;
		this.exited = new Promise((resolve) => {
			child.once("exit", (code, signal) => {
				this.#ended = true;
				resolve({ code, signal });
			});
		});
	}

	static async launch(options: LaunchOptions): Promise<{ app: Instance; driver: Driver }> {
		const port = await freePort();
		const child = spawn(options.binary ?? BINARY, [], {
			cwd: options.cwd,
			env: {
				...process.env,
				// The third gate on the embedded server (src-tauri/src/main.rs).
				PIARY_E2E: "1",
				TAURI_WEBDRIVER_PORT: String(port),
				PI_DOC_DIR: options.docDir,
				// Its own preferences, beside its documents: never the user's.
				PIARY_PREFERENCES: join(options.docDir, "preferences.json"),
				...options.env,
			},
			// Nobody reads the app's console here; what a spec needs it asks
			// for through the driver, and a full pipe would stall the app.
			stdio: "ignore",
		});
		const app = new Instance(child, port);
		const driver = await Driver.attach(port, () => !app.#ended).catch(async (error: unknown) => {
			await app.dispose();
			throw error;
		});
		return { app, driver };
	}

	get pid(): number {
		return this.child.pid!;
	}

	/** Records what is running below the app now, so `dispose` can end it.
	 *  A pid seen before is re-recorded as it is now: a child that has exec'd
	 *  since (`fake-pi --fake deaf` becomes `sleep`) is the same process under
	 *  a new command line, and `running` would not recognise the old one. */
	record(): Proc[] {
		const now = descendants(this.pid);
		for (const proc of now) {
			const at = this.recorded.findIndex((known) => known.pid === proc.pid);
			if (at === -1) this.recorded.push(proc);
			else this.recorded[at] = proc;
		}
		return now;
	}

	/** Ends the app and everything recorded below it, however the spec went. */
	async dispose(): Promise<void> {
		if (!this.#ended) {
			this.record();
			this.child.kill("SIGKILL");
			await this.exited;
		}
		killAll(this.recorded);
	}
}

const LSREGISTER =
	"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

/** An app launched the way Finder launches one: by LaunchServices, from a
 *  bundle, with launchd as its parent and no terminal. */
export class Launched {
	readonly root: string;
	readonly executable: string;
	readonly port: number;
	proc: Proc | undefined;

	private constructor(root: string, executable: string, port: number) {
		this.root = root;
		this.executable = executable;
		this.port = port;
	}

	/** Wraps the e2e binary in a bundle and `open`s it.
	 *
	 *  The bundle is built here rather than by `tauri build`, because the binary
	 *  under test has to be the `e2e` one — a bundled release has no WebDriver
	 *  server to cause a throw through. Its bundle id is not the app's, so
	 *  LaunchServices never confuses it with an installed Piary; the log
	 *  directory is unaffected, since Tauri names it from the identifier
	 *  compiled into the binary (`tauri.conf.json`), not from `Info.plist`. */
	static async open(env: Record<string, string>): Promise<{ app: Launched; driver: Driver }> {
		// Resolved, because `ps` names the executable by its real path and the
		// temp directory is behind a symlink (`/var` → `/private/var`).
		const root = realpathSync(scratch("finder"));
		const bundle = join(root, "Piary.app");
		const executable = join(bundle, "Contents", "MacOS", "piary");
		mkdirSync(join(bundle, "Contents", "MacOS"), { recursive: true });
		copyFileSync(BINARY, executable);
		writeFileSync(
			join(bundle, "Contents", "Info.plist"),
			`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>piary</string>
<key>CFBundleIdentifier</key><string>ch.divergenz.piary.e2e-launch</string>
<key>CFBundleName</key><string>Piary</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
`,
		);
		const port = await freePort();
		const app = new Launched(root, executable, port);
		try {
			// `--env` is the only environment the process gets beyond launchd's:
			// `open` does not pass this one's along, which is what makes it a
			// Finder launch rather than a child with a detour.
			const vars = { PIARY_E2E: "1", TAURI_WEBDRIVER_PORT: String(port), ...env };
			// `-g`: in the background. A Finder launch activates the app; this
			// one must not take the focus of the developer whose machine runs it.
			execFileSync("open", ["-n", "-g", ...Object.entries(vars).flatMap(([k, v]) => ["--env", `${k}=${v}`]), bundle]);
			app.proc = await until(
				() => table().find((proc) => proc.command === executable),
				SERVER_READY_MS,
				"the bundle was opened but its executable never appeared",
			);
			const driver = await Driver.attach(port, () => !!app.proc && running(app.proc));
			return { app, driver };
		} catch (error) {
			await app.dispose();
			throw error;
		}
	}

	/** Ends the process if it is still up and removes the bundle. */
	async dispose(): Promise<void> {
		const proc = this.proc ?? table().find((candidate) => candidate.command === this.executable);
		if (proc) killAll([proc]);
		try {
			execFileSync(LSREGISTER, ["-u", join(this.root, "Piary.app")], { stdio: "ignore" });
		} catch {
			// Unregistering only tidies LaunchServices' database; a stale entry for
			// a deleted scratch bundle costs nothing.
		}
		rmSync(this.root, { recursive: true, force: true });
	}
}
