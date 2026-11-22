#!/usr/bin/env node
// Compiles the Swift capture helper (ADR 0015) into `sidecar/bin/`, under the
// names Tauri's `bundle.externalBin` looks for: the helper's name followed by
// the target triple of the build that bundles it.
//
// Every slice is compiled for the macOS version the app says it runs on
// (`bundle.macOS.minimumSystemVersion`), never the compiler's default, which is
// the SDK's own: a helper built that way does not launch on an older system the
// app itself accepts, and no run on the build machine shows it. Compiling for
// the older system is also what makes the compiler refuse an API newer than it
// that no `#available` guards.
//
// Run: pnpm sidecar:build              the machine's own architecture
//      pnpm sidecar:build --universal  Apple silicon and Intel in one file,
//                                      for `tauri build --target universal-apple-darwin`
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE = join(ROOT, "sidecar", "capture.swift");
const OUT = join(ROOT, "sidecar", "bin");
const NAME = "piary-capture";

/** A Rust target triple's architecture, as `swiftc -target` spells it. */
const SWIFT_ARCH: Record<string, string> = {
	"aarch64-apple-darwin": "arm64",
	"x86_64-apple-darwin": "x86_64",
};

function fail(message: string): never {
	process.stderr.write(`sidecar:build: ${message}\n`);
	process.exit(1);
}

function run(command: string, args: string[]): void {
	try {
		execFileSync(command, args, { stdio: "inherit" });
	} catch {
		fail(`\`${command}\` failed`);
	}
}

const config = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const minimum: unknown = config.bundle?.macOS?.minimumSystemVersion;
if (typeof minimum !== "string") fail("src-tauri/tauri.conf.json names no bundle.macOS.minimumSystemVersion");

/** One architecture's helper, written under its triple's name. */
function compile(triple: string): string {
	const out = join(OUT, `${NAME}-${triple}`);
	run("xcrun", ["swiftc", "-O", "-target", `${SWIFT_ARCH[triple]}-apple-macos${minimum}`, SOURCE, "-o", out]);
	return out;
}

mkdirSync(OUT, { recursive: true });
if (process.argv.includes("--universal")) {
	const slices = Object.keys(SWIFT_ARCH).map(compile);
	run("lipo", ["-create", ...slices, "-output", join(OUT, `${NAME}-universal-apple-darwin`)]);
	process.stdout.write(`sidecar:build: ${NAME}-universal-apple-darwin, for macOS ${minimum}\n`);
} else {
	const host = execFileSync("rustc", ["--print", "host-tuple"]).toString().trim();
	if (!(host in SWIFT_ARCH)) fail(`the capture helper is built on macOS only, and this is ${host}`);
	// The bare name is what a debug build of the app spawns.
	copyFileSync(compile(host), join(OUT, NAME));
	process.stdout.write(`sidecar:build: ${NAME}-${host}, for macOS ${minimum}\n`);
}
