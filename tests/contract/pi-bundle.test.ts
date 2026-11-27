// The pi a release ships is the pi the repository is checked against.
//
// `package.json` pins `@earendil-works/pi-coding-agent`, which the typecheck
// reads and the pi peers follow (ADR 0020 §6). `scripts/pi-bundle.ts` names the
// version a release ships and the checksum of each of its builds (ADR 0069).
// Were the pin to move alone, a release would ship a pi no check here had
// read; were the script to move alone, the checks would describe a pi nobody
// is given.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { BUILDS, PI_VERSION } from "../../scripts/pi-bundle.ts";

const ROOT = new URL("../..", import.meta.url).pathname;

test("the pi that ships is the one package.json pins", () => {
	const pinned = (JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as { dependencies: Record<string, string> }).dependencies["@earendil-works/pi-coding-agent"];
	assert.equal(PI_VERSION, pinned);
});

test("each build that ships is held to a checksum", () => {
	assert.deepEqual(Object.keys(BUILDS).sort(), ["arm64", "x64"], "one build for each architecture the app runs on");
	for (const [build, sum] of Object.entries(BUILDS)) assert.match(sum, /^[0-9a-f]{64}$/, `${build}'s sha256`);
});

test("the release build ships both, under the names the app looks for", () => {
	// `pi_cli::bundled_in` looks for `Resources/pi/<build>/pi`.
	const release = readFileSync(`${ROOT}scripts/release-build.ts`, "utf8");
	const builds = /const PI_BUILDS = (\[[^\]]*\]);/.exec(release)?.[1];
	assert.deepEqual(JSON.parse(builds ?? "[]"), Object.keys(BUILDS));
	assert.match(release, /\[`pi-bundled\/\$\{build\}\/`, `pi\/\$\{build\}\/`\]/);
	const rust = readFileSync(`${ROOT}src-tauri/src/pi_cli.rs`, "utf8");
	for (const build of Object.keys(BUILDS)) assert.ok(rust.includes(`=> "${build}"`), `pi_cli.rs names the ${build} build`);
	assert.match(rust, /resource_dir\.join\("pi"\)\.join\(build\)\.join\("pi"\)/);
});
