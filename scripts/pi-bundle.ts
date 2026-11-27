#!/usr/bin/env node
// Puts the pi a release ships beside the app (ADR 0069): pi's own standalone
// build for each architecture, which needs no Node, fetched from pi's release
// and held to a checksum. It lands in `src-tauri/pi-bundled/<arch>/`, which
// `scripts/release-build.ts` names as a resource, so a Mac with no pi of its
// own still has one to run. It is not committed: 170 MB of binaries that are
// already pinned here.
//
// The version is the `@earendil-works/pi-coding-agent` the repository is
// checked against, and the two move together (ADR 0020 §6): a pin moved alone
// fails here, by name, as it fails `tests/contract/pi-bundle.test.ts`.
//
// Run: pnpm pi:bundle    (`pnpm app:release` runs it; a release that cannot
// get them fails here rather than shipping an app that runs nothing)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
/** Where the builds land, a directory per architecture. */
export const OUT = join(ROOT, "src-tauri", "pi-bundled");

/** The pi that ships, and the checksum of each build of it as pi's release
 *  lists them (`SHA256SUMS`). */
export const PI_VERSION = "1.1.0";
export const BUILDS = {
	arm64: "3455b13de35c15a5893cdebc922678199e90a7ce99b06cbc23f37860e90d63c7",
	x64: "8fdd9149ae27e7470a6a10ed8a7c0ed80738d55adec80a8d7764f6386d1e658b",
} as const;

const url = (arch: string) => `https://github.com/earendil-works/pi/releases/download/v${PI_VERSION}/pi-darwin-${arch}.tar.gz`;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fail(message: string): never {
	process.stderr.write(`pi:bundle: ${message}\n`);
	process.exit(1);
}

async function fetchBuild(arch: keyof typeof BUILDS): Promise<void> {
	const dir = join(OUT, arch);
	// Which archive the directory was unpacked from, kept beside it and out of
	// what ships.
	const stamp = join(OUT, `${arch}.sha256`);
	const expected = BUILDS[arch];
	if (existsSync(join(dir, "pi")) && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === expected) return;

	const response = await fetch(url(arch)).catch((error: unknown) => fail(`could not fetch ${url(arch)}: ${String(error)}`));
	if (!response.ok) fail(`could not fetch ${url(arch)}: HTTP ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const got = sha256(bytes);
	if (got !== expected) fail(`${url(arch)} is not the build that was tested: sha256 ${got}, expected ${expected}`);

	// Unpacked beside and moved into place, so a build never ships half a pi.
	const archive = join(OUT, `${arch}.tar.gz`);
	const unpacking = join(OUT, `${arch}.part`);
	rmSync(unpacking, { recursive: true, force: true });
	mkdirSync(unpacking, { recursive: true });
	writeFileSync(archive, bytes);
	// The archive holds one directory, `pi/`; its contents are what ships.
	execFileSync("/usr/bin/tar", ["-xzf", archive, "-C", unpacking, "--strip-components", "1"]);
	rmSync(archive);
	if (!existsSync(join(unpacking, "pi"))) fail(`${url(arch)} holds no \`pi/pi\``);
	rmSync(dir, { recursive: true, force: true });
	renameSync(unpacking, dir);
	writeFileSync(stamp, `${expected}\n`);
}

if (import.meta.main) {
	const pinned = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string> }).dependencies["@earendil-works/pi-coding-agent"];
	if (pinned !== PI_VERSION) fail(`package.json pins pi ${pinned} and this script ships ${PI_VERSION}: move them together, with the checksums`);
	mkdirSync(OUT, { recursive: true });
	for (const arch of Object.keys(BUILDS) as (keyof typeof BUILDS)[]) await fetchBuild(arch);
	process.stdout.write(`pi:bundle: pi ${PI_VERSION} for ${Object.keys(BUILDS).join(" and ")} is in src-tauri/pi-bundled/\n`);
}
