// The ports the Playwright configs run their servers on, shared so both
// configs (playwright.config.ts, playwright.app.config.ts) agree with themselves
// across the runner's worker processes.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The repo never hardcodes a test port (docs/HANDBOOK.md, Key facts) — several checkouts
// have to coexist, and a fixed constant makes two of them collide.
//
// The port therefore has to be CHOSEN once and then AGREED ON, and the second half
// is the part that bites: this config module is evaluated once per process, and the
// runner spawns workers as separate processes. A port picked freshly in each
// evaluation hands `webServer` one number and the polling `url` another — the server
// comes up, nothing answers where Playwright is looking, and the run dies 60s later
// on "Timed out waiting from config.webServer", which reads as a broken server and
// is not one. `process.env` does not carry it either, for the same reason.
//
// So the choice is written to a file under the OS temp dir, keyed by this checkout's
// path: the first evaluation claims a free port and records it, every later one reads
// it back, and a second checkout gets its own file and its own port. PORT in the
// environment overrides everything, which is what CI and a developer pointing specs
// at an already-running server both want.
export function sessionPort(role = "harness"): number {
	// PORT names the harness's port only. A developer pointing specs at an
	// already-running harness still needs the app page's own server, so the
	// override does not extend to it.
	const fromEnv = Number(process.env["PORT"]);
	if (fromEnv && role === "harness") return fromEnv;
	const key = createHash("sha256").update(import.meta.dirname).digest("hex").slice(0, 16);
	const lock = join(tmpdir(), `piary-e2e-port-${key}-${role}`);
	try {
		const recorded = Number(readFileSync(lock, "utf8").trim());
		// A recorded port is reused as-is. It is deliberately NOT re-probed for
		// being free: the server this run just started is holding it, so a
		// liveness check would reject the very port it is meant to agree on. A
		// genuinely stale file (the port now belongs to something else) surfaces
		// as the server failing to bind, which names the problem where it happens.
		if (recorded) return recorded;
	} catch {} // no claim yet (or an unreadable one): make a fresh one below
	// A free port, found synchronously because this function's callers are a
	// module's top level. `net.Server.listen()` is ASYNCHRONOUS — `address()` is
	// null until its callback runs — so probing a real socket here cannot work and
	// silently yields port 0, which becomes `http://127.0.0.1:0` and a 60s timeout
	// that looks like a broken server. `execFileSync` gives the OS the same
	// question and waits for the answer.
	const port = Number(
		execFileSync(process.execPath, [
			"-e",
			'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})',
		])
			.toString()
			.trim(),
	);
	writeFileSync(lock, String(port));
	return port;
}
