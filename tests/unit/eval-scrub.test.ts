// A report is committed, so it names no directory of the machine that ran it.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { scrubbed, scrubPaths } from "../../evals/scrub.ts";

const roots = { scratch: "/var/folders/ab/cd/T/piary-eval-fix-and-run-X1", repo: "/Users/someone/code/piary", home: "/Users/someone" };

test("a report names the scratch directory, the checkout and the home directory by placeholder", () => {
	const said = [
		"ran in /var/folders/ab/cd/T/piary-eval-fix-and-run-X1/workspace",
		"cwd /private/var/folders/ab/cd/T/piary-eval-fix-and-run-X1/workspace/a.ts",
		"loaded /Users/someone/code/piary/pi-extension/index.ts",
		"read /Users/someone/.pi/agent/settings.json",
	].join("\n");
	assert.equal(
		scrubPaths(said, roots),
		["ran in <scratch>/workspace", "cwd <scratch>/workspace/a.ts", "loaded <repo>/pi-extension/index.ts", "read ~/.pi/agent/settings.json"].join("\n"),
	);
});

test("an outcome is scrubbed wherever a path sits in it, and nothing else changes", () => {
	const outcome = { slug: "fix-and-run", ms: 12, toolCalls: [{ name: "bash", args: { command: "cd /Users/someone/code/piary && ls" } }], prose: "It is in /Users/someone/notes." };
	assert.deepEqual(scrubbed(outcome, roots), { slug: "fix-and-run", ms: 12, toolCalls: [{ name: "bash", args: { command: "cd <repo> && ls" } }], prose: "It is in ~/notes." });
});

test("a run with no scratch directory still loses its checkout and home", () => {
	assert.equal(scrubPaths("/Users/someone/code/piary/evals", { repo: roots.repo, home: roots.home }), "<repo>/evals");
});

test("no committed report names a home or a temp directory of the machine that ran it", () => {
	const reports = join(import.meta.dirname, "../../evals/reports");
	const named: string[] = [];
	for (const entry of readdirSync(reports, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !/\.(md|json)$/.test(entry.name)) continue;
		const file = join(entry.parentPath, entry.name);
		if (/\/Users\/|\/home\/[a-z]|\/var\/folders\//.test(readFileSync(file, "utf8"))) named.push(file);
	}
	assert.deepEqual(named, [], "run the report through evals/scrub.ts before committing it");
});
