// The app has one version, written in `package.json`.
//
// `tauri.conf.json` points at that file, so the bundle's version and the one
// the running app compares against a release (ADR 0063) are read from it.
// Cargo cannot read it, so `Cargo.toml` and `Cargo.lock` repeat it, and this
// holds them to it: a release cut with one of them behind would be a build
// that announces itself as older than it is.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseVersion } from "../../app/update-check.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (file: string) => readFileSync(`${ROOT}${file}`, "utf8");

const version = (JSON.parse(read("package.json")) as { version: string }).version;

test("package.json's version is one the app can compare", () => {
	assert.ok(parseVersion(version), `"${version}" is not a released version (0.2.0)`);
});

test("tauri.conf.json takes its version from package.json", () => {
	assert.equal((JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string }).version, "../package.json");
});

test("Cargo.toml and Cargo.lock repeat package.json's version", () => {
	const manifest = /^\[package\]\n(?:.*\n)*?version = "([^"]+)"/m.exec(read("src-tauri/Cargo.toml"))?.[1];
	assert.equal(manifest, version, "src-tauri/Cargo.toml");
	const locked = /\[\[package\]\]\nname = "piary"\nversion = "([^"]+)"/.exec(read("src-tauri/Cargo.lock"))?.[1];
	assert.equal(locked, version, "src-tauri/Cargo.lock");
});
