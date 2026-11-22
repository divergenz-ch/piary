#!/usr/bin/env node
// Builds the Piary.app that is given to other people: one bundle that runs on
// Apple silicon and on Intel, the capture helper included, and then checks the
// bundle it made, because what goes wrong with it is invisible on the machine
// that built it. A slice for the other architecture is never run here, a helper
// built for a newer macOS launches here regardless, and a stray file in
// `Contents/MacOS/` only fails once Developer ID signing meets it
// (`docs/packaging.md`).
//
// Signing is the environment's alone: with `APPLE_SIGNING_IDENTITY` and the
// notarization variables set, Tauri signs and notarizes this same build. With
// none the identity is `-`, an ad-hoc signature: Tauri leaves a bundle with no
// identity unsigned, and an ad-hoc one is sealed, carries the entitlements and
// runs under the Hardened Runtime as a Developer ID build does, though
// Gatekeeper refuses it on any Mac but the one that made it.
//
// Run: pnpm app:release          Piary.app
//      pnpm app:release --dmg    and a disk image of it (needs a logged-in
//                                session: the step drives Finder)
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const TARGET = "universal-apple-darwin";
const ARCHS = ["arm64", "x86_64"];
const BUNDLE = join(ROOT, "src-tauri", "target", TARGET, "release", "bundle");

function fail(message: string): never {
	process.stderr.write(`app:release: ${message}\n`);
	process.exit(1);
}

function step(command: string, args: string[], env: Record<string, string> = {}): void {
	const run = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
	if (run.status !== 0) fail(`\`${command} ${args.join(" ")}\` failed`);
}

/** A command's output, or null when it refuses its input. */
function read(command: string, args: string[]): string | null {
	const run = spawnSync(command, args, { encoding: "utf8" });
	return run.status === 0 ? run.stdout : null;
}

/** Whether dotted version `a` is newer than `b`. */
function newer(a: string, b: string): boolean {
	const [x, y] = [a, b].map((version) => version.split(".").map(Number));
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
	}
	return false;
}

const config = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"));
const minimum: string = config.bundle.macOS.minimumSystemVersion;
const app = join(BUNDLE, "macos", `${config.productName}.app`);
const dmg = process.argv.includes("--dmg");
const identity = process.env.APPLE_SIGNING_IDENTITY || "-";

step("node", [join(ROOT, "scripts", "sidecar-build.ts"), "--universal"]);
step("pnpm", ["tauri", "build", "--target", TARGET, "--bundles", dmg ? "app,dmg" : "app"], { APPLE_SIGNING_IDENTITY: identity });

// Every file beside the app's binary is code to a Developer ID signature, so
// each must be a Mach-O file, holding both architectures, that the oldest macOS
// the app accepts can load.
const binaries = join(app, "Contents", "MacOS");
for (const name of readdirSync(binaries)) {
	const file = join(binaries, name);
	const archs = read("lipo", ["-archs", file])?.trim().split(" ");
	if (!archs) fail(`Contents/MacOS/${name} is not a Mach-O file, and nothing else may be there`);
	for (const arch of ARCHS) {
		if (!archs.includes(arch)) fail(`Contents/MacOS/${name} has no ${arch} slice (it has ${archs.join(", ")})`);
		const built = read("otool", ["-l", "-arch", arch, file])?.match(/LC_BUILD_VERSION[\s\S]*?minos (\S+)/)?.[1];
		if (!built) fail(`Contents/MacOS/${name} does not say which macOS its ${arch} slice needs`);
		if (newer(built, minimum)) fail(`Contents/MacOS/${name} needs macOS ${built} on ${arch}, and the app says it runs on ${minimum}`);
	}
}

try {
	execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
} catch (error) {
	fail(`the bundle's signature does not verify:\n${String((error as { stderr?: unknown }).stderr)}`);
}

process.stdout.write(
	`app:release: ${app}\n` +
		`  ${ARCHS.join(" and ")}, macOS ${minimum} or newer, ${identity === "-" ? "ad-hoc signed: Gatekeeper refuses it on any other Mac" : `signed as ${identity}`}\n` +
		(dmg ? `  ${join(BUNDLE, "dmg")}\n` : ""),
);
