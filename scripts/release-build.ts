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
// notarization variables set, Tauri signs and notarizes this same build, and
// the disk image is notarized here, which Tauri leaves undone. With
// none the identity is `-`, an ad-hoc signature: Tauri leaves a bundle with no
// identity unsigned, and an ad-hoc one is sealed, carries the entitlements and
// runs under the Hardened Runtime as a Developer ID build does, though
// Gatekeeper refuses it on any Mac but the one that made it.
//
// Run: pnpm app:release          Piary.app
//      pnpm app:release --dmg    and a disk image of it (needs a logged-in
//                                session: the step drives Finder)
//      --notarized               refuse, before building, to make anything
//                                but a signed and notarized disk image: what
//                                a release is built with (`scripts/release.ts`)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const credentials = identity === "-" ? null : notaryArgs();
if (process.argv.includes("--notarized") && !(dmg && credentials)) {
	fail("--notarized needs --dmg, APPLE_SIGNING_IDENTITY and notarization credentials (docs/packaging.md §4)");
}

// The disk image step mounts its working image under the product's name and
// arranges that volume through Finder. With a volume of that name already
// mounted, an earlier image left open, it gets another name and fails, after
// the whole build and the app's notarization.
const volume = join("/Volumes", config.productName);
if (dmg && existsSync(volume)) fail(`${volume} is mounted, and the disk image step needs that name: eject it first`);

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

// Tauri notarizes the app and signs the disk image, and stops there: the image
// is what is downloaded, so it is the image Gatekeeper judges first, and it
// refuses one with no ticket of its own as unnotarized.
const version: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const image = dmg ? readdirSync(join(BUNDLE, "dmg")).find((name) => name.endsWith(".dmg") && name.includes(`_${version}_`)) : undefined;
let notarized = false;
if (dmg && !image) fail(`no disk image of ${version} was built`);
if (image && credentials) {
	const file = join(BUNDLE, "dmg", image);
	// Not `step`, which names its arguments when it fails: one of these is a password.
	const sent = spawnSync("xcrun", ["notarytool", "submit", file, "--wait", ...credentials], { cwd: ROOT, stdio: "inherit" });
	if (sent.status !== 0) fail(`the notary service did not take ${image}`);
	// `notarytool` exits 0 on a submission Apple refused; the ticket is the proof.
	step("xcrun", ["stapler", "staple", file]);
	step("spctl", ["-a", "-t", "open", "--context", "context:primary-signature", file]);
	notarized = true;
}

/** What tells `notarytool` who is asking, from the variables Tauri reads, or null with none set. */
function notaryArgs(): string[] | null {
	const { APPLE_API_KEY, APPLE_API_ISSUER, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
	if (APPLE_API_KEY && APPLE_API_ISSUER) {
		const home = process.env.HOME ?? "";
		const name = `AuthKey_${APPLE_API_KEY}.p8`;
		// Where Tauri looks for a key whose path is not named.
		const places = [join(ROOT, "private_keys"), join(home, "private_keys"), join(home, ".private_keys"), join(home, ".appstoreconnect", "private_keys")];
		const key = process.env.APPLE_API_KEY_PATH || places.map((place) => join(place, name)).find((path) => existsSync(path));
		if (!key) fail(`no ${name} was found, and APPLE_API_KEY_PATH names none`);
		return ["--key", key, "--key-id", APPLE_API_KEY, "--issuer", APPLE_API_ISSUER];
	}
	if (APPLE_ID && APPLE_PASSWORD && APPLE_TEAM_ID) {
		return ["--apple-id", APPLE_ID, "--password", APPLE_PASSWORD, "--team-id", APPLE_TEAM_ID];
	}
	return null;
}

process.stdout.write(
	`app:release: ${app}\n` +
		`  ${ARCHS.join(" and ")}, macOS ${minimum} or newer, ${identity === "-" ? "ad-hoc signed: Gatekeeper refuses it on any other Mac" : `signed as ${identity}`}\n` +
		(image ? `  ${join(BUNDLE, "dmg", image)}\n  ${notarized ? "notarized, with its ticket stapled" : "not notarized: Gatekeeper refuses it on any other Mac"}\n` : ""),
);
