// Face-format experiment harness, not a test. Writes every arm's block for every case from the
// case's timeline, so no block is written by hand: signals/<case>/<arm>.md, as the eval runner
// reads them (`--signals`). `face` is the case's timeline in the chosen rendering; the arms
// named after a format are the same timeline in that format. Also the check a timeline must pass: it serializes, and its `codes`
// block reads back as itself.   Usage: node evals/spikes/face-format/build.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { target } from "../../place.ts";
import { FORMATS, type Format, filtered, noisy, parseCodes, resolved, serialize, type Threshold, type Timeline } from "./timeline.ts";

const HERE = import.meta.dirname;
/** What the app drops before sending, in the filtered arms. */
export const THRESHOLD: Threshold = JSON.parse(readFileSync(join(HERE, "threshold.json"), "utf8"));
/** The plain-words rendering the agent is shown (results/rendering.md): what every arm that is
 *  not a format of its own is written in. */
const { rendering: RENDERING } = JSON.parse(readFileSync(join(HERE, "rendering.json"), "utf8")) as { rendering: Format };
const WINDOW = 4;
const seedOf = (slug: string) => [...slug].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

rmSync(join(HERE, "signals"), { recursive: true, force: true });
let blocks = 0;
for (const slug of readdirSync(join(HERE, "cases")).sort()) {
	const dir = join(HERE, "cases", slug);
	const message = target(readFileSync(join(dir, "doc.md"), "utf8")).prompt.trim();
	const out = join(HERE, "signals", slug);
	mkdirSync(out, { recursive: true });
	const write = (arm: string, block: string) => {
		writeFileSync(join(out, `${arm}.md`), block ? `${block}\n` : "");
		blocks++;
	};
	const load = (name: string): Timeline | null => (existsSync(join(dir, name)) ? (JSON.parse(readFileSync(join(dir, name), "utf8")) as Timeline) : null);
	const check = (timeline: Timeline) => assert.deepEqual(parseCodes(serialize("codes", timeline, message), message), resolved(timeline, message), slug);

	const timeline = load("timeline.json");
	if (timeline) {
		check(timeline);
		for (const format of FORMATS) write(format, serialize(format, timeline, message));
		const raw = noisy(timeline, message, seedOf(slug));
		check(raw);
		write("face", serialize(RENDERING, timeline, message));
		write("noisy", serialize(RENDERING, raw, message));
		write("noisy-filtered", serialize(RENDERING, filtered(raw, THRESHOLD), message));
		write("filtered", serialize(RENDERING, filtered(timeline, THRESHOLD), message));
		// What a small model wrote of the same timeline (digest.ts), in place of the rendering.
		const digest = join(HERE, "digests", `${slug}.json`);
		if (existsSync(digest)) {
			const { line } = JSON.parse(readFileSync(digest, "utf8")) as { line: string };
			write("digest", /^nothing\.?$/i.test(line) ? "" : `[face] ${line}`);
		}
	}
	// A conversation with nothing typed: what the first seconds after the answer showed.
	for (const variant of ["meaningful", "meaningless"]) {
		const t = load(`timeline.${variant}.json`);
		if (!t) continue;
		check(t);
		write(variant, serialize(RENDERING, t, message));
	}
	if (slug.startsWith("alone-")) {
		const jitter = noisy({ read: { window: WINDOW, events: [] } }, "", seedOf(slug), { extra: 6 });
		write("jitter", serialize(RENDERING, jitter, message));
		write("jitter-filtered", serialize(RENDERING, filtered(jitter, THRESHOLD), message));
	}
}
process.stdout.write(`${blocks} blocks written\n`);
