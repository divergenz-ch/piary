// Plot ships in the app (ADR 0043): an a2ui chart and a cell's `Plot` are one
// copy, loaded by src/utils/plot.ts from the bundle, at the version
// package.json pins. A second loader that names the CDN would bring back a
// chart that needs the network and draws with whatever version is newest.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const PLOT_ON_THE_CDN = "cdn.jsdelivr.net/npm/@observablehq/plot";

const sources = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : [],
	);

test("no source file loads Plot from the CDN", () => {
	const naming = sources(join(ROOT, "src"))
		.filter((file) => readFileSync(file, "utf8").includes(PLOT_ON_THE_CDN))
		.map((file) => relative(ROOT, file));
	assert.deepEqual(naming, [], `these files name ${PLOT_ON_THE_CDN}; load Plot with src/utils/plot.ts`);
});

test("Plot is a pinned dependency, so the chart drawn is the version that was tested", () => {
	const { dependencies } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string> };
	assert.match(dependencies["@observablehq/plot"] ?? "(absent)", /^\d+\.\d+\.\d+$/);
});
