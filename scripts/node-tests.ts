#!/usr/bin/env node
// Runs node test tiers, and refuses a skip in any of them.
//
// node:test reports a `{ skip }` as skipped and exits 0, so a test that skips
// itself because something it needs is missing is a green run that covered
// nothing (docs/TEST_ARCHITECTURE.md §4). The tiers run as one `node --test`,
// and its skipped count is printed where it is seen.
//
// Run: node scripts/node-tests.ts [tier…]   (default: every tier)
import { spawn } from "node:child_process";

const TIERS = ["unit", "contract", "integration"] as const;

const asked = process.argv.slice(2);
for (const tier of asked) {
	if (!(TIERS as readonly string[]).includes(tier)) {
		process.stderr.write(`node-tests: unknown tier "${tier}" (one of ${TIERS.join(", ")})\n`);
		process.exit(2);
	}
}
const tiers = asked.length ? asked : [...TIERS];

/** Runs the tiers, echoing their output, and resolves the exit code and skip count. */
function run(group: string[]): Promise<{ code: number; skipped: number }> {
	return new Promise((resolve) => {
		const child = spawn(process.execPath, ["--test", ...group.map((tier) => `tests/${tier}/*.test.ts`)], {
			stdio: ["ignore", "pipe", "inherit"],
		});
		let tail = "";
		child.stdout.on("data", (chunk: Buffer) => {
			process.stdout.write(chunk);
			tail = (tail + chunk.toString()).slice(-4096);
		});
		child.on("close", (code) => {
			const skipped = Number(/ℹ skipped (\d+)/.exec(tail)?.[1] ?? 0);
			resolve({ code: code ?? 1, skipped });
		});
	});
}

const { code, skipped } = await run(tiers);
const name = tiers.join(" + ");
if (skipped) process.stderr.write(`\n✗ ${name}: ${skipped} test(s) skipped — a skip is a test that ran nothing\n`);
else process.stdout.write(`\n✓ ${name}: 0 skipped\n`);
process.exit(code !== 0 || skipped ? 1 : 0);
