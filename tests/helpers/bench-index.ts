// Not a test — a measurement, kept next to the change it justifies.
// Run: node tests/helpers/bench-index.ts <a-document.md>
import { readFileSync } from "node:fs";
import { parseDocument } from "../../dist/document/format.js";
import { indexFromDocument, indexFromSegments } from "../../dist/components/ChatIndex.js";

const md = readFileSync(process.argv[2] ?? "pi-docs/web-6b7854ea.md", "utf8");
const N = 40;

const time = (label: string, fn: () => void) => {
	fn(); // warm
	const t0 = performance.now();
	for (let i = 0; i < N; i++) fn();
	const per = (performance.now() - t0) / N;
	console.log(`${label.padEnd(46)} ${per.toFixed(2)} ms`);
	return per;
};

console.log(`document: ${(md.length / 1024).toFixed(0)} KB\n`);
const before = time("per chunk, before (parse + indexFromDocument)", () => {
	parseDocument(md); // refreshIndex's own parse
	indexFromDocument(md); // and the one inside it
});
const segments = parseDocument(md).segments; // the editor's, already done
const after = time("per frame, after (reuse editor's parse)", () => indexFromSegments(segments));
console.log(`\nsaved per call: ${(before - after).toFixed(2)} ms (${(100 - (after / before) * 100).toFixed(0)}%)`);
