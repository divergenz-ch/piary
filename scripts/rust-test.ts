#!/usr/bin/env node
// `cargo test` for the app's Rust half, with its two build inputs checked first.
//
// `tauri-build` resolves `bundle.externalBin` (the Swift capture helper) and
// `build.frontendDist` (the built page) while generating the context, so the
// crate does not compile without both. Missing, cargo reports
// `resource path … doesn't exist` from deep inside a build script, which names
// neither the cause nor the fix — so this names both before cargo runs.
//
// Run: pnpm rust:test    (the lint-free half of `pnpm rust:check`)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const host = execFileSync("rustc", ["--print", "host-tuple"]).toString().trim();
const inputs = [join(ROOT, "sidecar", "bin", `piary-capture-${host}`), join(ROOT, "app", "dist", "index.html")];
const missing = inputs.filter((path) => !existsSync(path));
if (missing.length) {
	process.stderr.write(
		`rust:test: the crate's build inputs are missing:\n${missing.map((path) => `  ${path}\n`).join("")}` +
			"run `pnpm sidecar:build && pnpm app:build` once, then again.\n",
	);
	process.exit(1);
}
const run = spawnSync("cargo", ["test", ...process.argv.slice(2)], { cwd: join(ROOT, "src-tauri"), stdio: "inherit" });
process.exit(run.status ?? 1);
