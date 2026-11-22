// Not a test — a measurement, kept next to the budget it justifies (CODING_GUIDELINES.md, "The parse budget").
// Run: pnpm build && node tests/helpers/bench-parse.ts
//
// What one transaction costs `docField` (src/components/editor-state.ts): the rope
// flatten `tr.newDoc.toString()` plus `parseState`'s four passes, against document
// size — then the streaming case, N appended chunks each paying for the whole document.
import { Text } from "@codemirror/state";
import { blocksFrom, parseDocument, serializeCell } from "../../dist/document/format.js";
import { artifactsFrom, cellsFrom } from "../../dist/document/cells.js";

/** One turn of the shape a real conversation has: prose, thinking, a tool call
 *  and its result, a markdown answer with a fence, and a notebook cell. `prose`
 *  pads the answer — the cost follows marker count far more than bytes, so the
 *  table runs a tool-dense document (every turn ~1 KB) and a prose-heavy one. */
const turn = (i: number, prose: number) => `Turn ${i}: how many TypeScript files are in this repo, and what do they do?

<!-- pi:thinking -->

A quick count with find is enough, then read the largest few.

<!-- pi:tool bash #call_${i} -->

\`\`\`json
{ "command": "find src -name '*.ts' | wc -l" }
\`\`\`

<!-- pi:result #call_${i} -->

\`\`\`
14
\`\`\`

<!-- pi -->

There are **14** TypeScript files under \`src/\`. The largest is the canvas:

- \`DocumentChat.ts\` — the editor host
- \`format.ts\` — the marker grammar, *one* specified parser

${"The rest of the answer is prose, the way a long explanation reads. ".repeat(prose)}

\`\`\`ts
export function parseDocument(md: string): ParsedDocument { /* … */ }
\`\`\`

${serializeCell("js", `c${i.toString(16).padStart(6, "0")}`, `const n${i} = ${i} * 2;\nn${i}`)}

<!-- you -->

`;

const docOf = (bytes: number, prose: number) => {
	let md = "";
	for (let i = 0; md.length < bytes; i++) md += turn(i, prose);
	return md;
};

/** `parseState`, verbatim in what it calls — it is module-private there. */
const parseState = (md: string) => {
	const parsed = parseDocument(md);
	blocksFrom(parsed.segments);
	cellsFrom(md, parsed.segments);
	artifactsFrom(md, parsed.segments);
};

/** One transaction: flatten the rope, parse the string. */
const transaction = (doc: Text) => parseState(doc.toString());

const median = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];

/** Median ms per call over enough runs that a sub-millisecond figure is stable. */
const time = (fn: () => void) => {
	for (let i = 0; i < 20; i++) fn(); // warm the JIT
	const runs: number[] = [];
	for (let i = 0; i < 60; i++) {
		const t0 = performance.now();
		fn();
		runs.push(performance.now() - t0);
	}
	return median(runs);
};

const SIZES_KB = [100, 400, 1600, 6400];
/** Prose padding per turn: none (a tool-heavy session) and ~3 KB (a long-form one). */
const SHAPES = [
	{ name: "tool-dense", prose: 0 },
	{ name: "prose-heavy", prose: 45 },
];
/** A streamed answer of this many chunks — what one long reply delivers. */
const CHUNKS = 200;
const CHUNK = "streamed token text, ".repeat(2);

console.log(`node ${process.version} · ${process.platform}/${process.arch}`);
for (const shape of SHAPES) {
	console.log(`\n${shape.name}\n    size  segments   per transaction   ms/MB   ${CHUNKS}-chunk stream`);
	for (const kb of SIZES_KB) {
		const md = docOf(kb * 1024, shape.prose);
		const doc = Text.of(md.split("\n"));
		const per = time(() => transaction(doc));
		let streamed = doc;
		const t0 = performance.now();
		for (let i = 0; i < CHUNKS; i++) {
			streamed = streamed.replace(streamed.length, streamed.length, Text.of([CHUNK]));
			transaction(streamed);
		}
		const stream = performance.now() - t0;
		const mb = md.length / (1024 * 1024);
		const segs = parseDocument(md).segments.length;
		console.log(
			`${(md.length / 1024).toFixed(0).padStart(5)} KB  ${String(segs).padStart(8)}  ${per.toFixed(2).padStart(13)} ms  ${(per / mb).toFixed(2).padStart(6)}  ${stream.toFixed(0).padStart(14)} ms`,
		);
	}
}
