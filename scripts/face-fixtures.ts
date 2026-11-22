#!/usr/bin/env node
// Cuts a recording made with the fixture recorder (`app/face/record.ts`,
// docs/TEST_ARCHITECTURE.md §6) into one fixture per movement asked for, under
// `tests/fixtures/face/`: the samples from a few seconds before the key press
// (the person reading what comes next, which is their face at rest) to two
// seconds after RELAX, at the rate the app reads a camera at, on a clock that
// starts at zero. Numbers only, in columns, so 29 fixtures stay about a megabyte.
//
// Run: node scripts/face-fixtures.ts <face-recording.md>
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FaceSample } from "../src/document/face-episodes.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "tests", "fixtures", "face");
/** Every second sample of a recording made at every frame: `READ_EVERY` in `app/face/mediapipe.ts`. */
const KEEP_EVERY = 2;
/** How much of the time before the key press is kept, and how long after the movement before
 *  it the face is taken to be at rest again. */
const BEFORE_MS = 6000;
const SETTLE_MS = 1500;
const AFTER_MS = 2000;

const file = process.argv[2];
if (!file) {
	process.stderr.write("usage: node scripts/face-fixtures.ts <face-recording.md>\n");
	process.exit(1);
}
const text = readFileSync(file, "utf8");
const recording = JSON.parse(text.slice(text.indexOf("```json\n") + 8, text.lastIndexOf("\n```"))) as {
	recordedAt: string;
	readEvery: number;
	asks: { name: string; say: string; readyAt: number; goAt: number; endAt: number }[];
	samples: FaceSample[];
};
if (recording.readEvery !== 1) throw new Error("the recording was not made at every frame");
// The model's own scores. The recorder once added a number of its own (`geo.…`), which nothing reads.
const names = [...new Set(recording.samples.flatMap((sample) => Object.keys(sample.scores)))].filter((name) => !name.startsWith("geo.")).sort();
const round = (n: number) => Math.round(n * 10) / 10;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [i, ask] of recording.asks.entries()) {
	const from = Math.max(ask.readyAt - BEFORE_MS, (recording.asks[i - 1]?.endAt ?? -Infinity) + SETTLE_MS, recording.samples[0]!.at);
	const rows = recording.samples
		.filter((sample) => sample.at >= from && sample.at <= ask.endAt + AFTER_MS)
		.filter((_, i) => i % KEEP_EVERY === 0)
		// A row is the time, the faces, every score in `names`' order, then the transform when there is a face.
		.map((sample) => [round(sample.at - from), sample.faces, ...names.map((name) => sample.scores[name] ?? 0), ...(sample.matrix ?? [])]);
	const fixture = { name: ask.name, say: ask.say, recorded: recording.recordedAt.slice(0, 10), readyAt: round(ask.readyAt - from), goAt: round(ask.goAt - from), endAt: round(ask.endAt - from), names, rows };
	writeFileSync(join(OUT, `${ask.name}.json`), `${JSON.stringify(fixture)}\n`);
}
process.stdout.write(`${recording.asks.length} fixtures written to tests/fixtures/face/\n`);
