// Face-format experiment harness, not a test. Scores the decode runs against the timelines
// they were serialized from, field by field and by exact match, and prints what each format
// costs in input tokens.   Usage: node evals/spikes/face-format/decode/score.ts > decode.md
// HARNESS=claude scores the `claude -p` run (decode-claude/); WRONG=<format> prints, instead,
// every line of that format an answer got wrong, to be read before a format is ruled out.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CODES, INTENSITY, type Step, type Timeline } from "../timeline.ts";

const HERE = import.meta.dirname;
const OUT = process.env.FACE_OUT ?? join(HERE, "../../../../recordings/face-format");
const items = JSON.parse(readFileSync(join(HERE, "items.json"), "utf8")) as { id: string; message: string; timeline: Timeline }[];

interface Entry {
	phase: string;
	at?: number;
	text?: string;
	occurrence?: number;
	pause?: number;
	steps: { movements: string[]; intensities: string[]; seconds: number }[];
}
const steps = (run: Step[]) => run.map((s) => ({ movements: s.units.map(([c]) => CODES[c]!.words), intensities: s.units.map(([, l]) => INTENSITY[l]), seconds: s.dur }));
const lastWord = (text: string) => text.trim().split(/\s+/).at(-1)!.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
const count = (message: string, text: string) => message.split(text).length - 1;

/** What a perfect transcription of an item says. */
function truth(item: (typeof items)[number]): (Entry & { twice?: boolean })[] {
	const out: (Entry & { twice?: boolean })[] = [];
	for (const e of item.timeline.read?.events ?? []) out.push({ phase: "reading", at: e.at, steps: steps(e.run) });
	for (const e of item.timeline.type ?? []) {
		if (e.kind === "during") out.push({ phase: "typing", text: e.text, occurrence: e.nth ?? 1, twice: count(item.message, e.text) > 1, steps: steps(e.run) });
		else if (e.kind === "pause") out.push({ phase: "pause", text: lastWord(e.after), pause: e.pause, steps: steps(e.run) });
		else out.push({ phase: "deleted", text: e.text, steps: steps(e.run) });
	}
	return out;
}
const near = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.051;
const same = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => String(x).trim().toLowerCase() === b[i]);
// A transcription may keep the "…" a format wrote around an excerpt: that is not a misreading.
const squash = (s: unknown) => String(s ?? "").replace(/^…|…$/g, "").replace(/\s+/g, " ").trim();
/** Whether `got` is the typed text `want`: all of it, or its two ends around the "…" a block
 *  writes for a long stretch. Repeating the block's own anchor is a transcription, not a
 *  misreading; `expanded` counts how often the whole stretch came back. */
const typed = (got: unknown, want: string) => {
	const g = squash(got);
	if (g === squash(want)) return true;
	const [head, tail, more] = g.split("…");
	return !!head && !!tail && more === undefined && want.length > ELIDED && squash(want).startsWith(head.trim()) && squash(want).endsWith(tail.trim());
};
/** A typed stretch longer than this is one a block may have elided (`LONG_ANCHOR`, spec.md). */
const ELIDED = 48;

const FIELDS = ["phase", "anchor", "movements", "intensities", "seconds"] as const;
type Tally = Record<(typeof FIELDS)[number] | "whole" | "entries" | "unparsed" | "answers" | "tokens" | "long" | "expanded", number>;
const tallies = new Map<string, Tally>();
const baseline = new Map<string, number>();
const dir = join(OUT, process.env.HARNESS === "claude" ? "decode-claude" : "decode");
const wrong: string[] = [];
const answers = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { kind: string; model: string; item: string; format: string; legend: string; text: string; tokens: number; effort: string }) : [];
for (const a of answers) if (a.kind === "tokens" && a.format === "baseline") baseline.set(`${a.model}.${a.item}`, a.tokens);
const cost = new Map<string, number[]>();
for (const a of answers) if (a.kind === "tokens" && a.format !== "baseline") cost.set(`${a.format} | ${a.model}`, [...(cost.get(`${a.format} | ${a.model}`) ?? []), a.tokens - baseline.get(`${a.model}.${a.item}`)!]);
const legendCost = new Map<string, number>();
for (const a of answers) if (a.kind === "legend") legendCost.set(`${a.format} · ${a.legend} | ${a.model}`, a.tokens - baseline.get(`${a.model}.${a.item}`)!);

for (const a of answers) {
	if (a.kind !== "decode") continue;
	const key = `${a.format} · ${a.legend} | ${a.model}`;
	const t = tallies.get(key) ?? { phase: 0, anchor: 0, movements: 0, intensities: 0, seconds: 0, whole: 0, entries: 0, unparsed: 0, answers: 0, tokens: 0, long: 0, expanded: 0 };
	tallies.set(key, t);
	t.answers++;
	const want = truth(items.find((i) => i.id === a.item)!);
	let got: Entry[] = [];
	try {
		got = (JSON.parse(a.text.slice(a.text.indexOf("{"), a.text.lastIndexOf("}") + 1)) as { entries: Entry[] }).entries;
		if (!Array.isArray(got)) throw new Error("no entries");
	} catch {
		t.unparsed++;
		got = [];
	}
	want.forEach((w, i) => {
		const g = got[i];
		t.entries++;
		if (w.phase === "typing" && w.text!.length > ELIDED) {
			t.long++;
			if (squash(g?.text) === squash(w.text)) t.expanded++;
		}
		if (!g) {
			if (a.format === process.env.WRONG) wrong.push(`${a.model} ${a.item} #${i}: no such entry in ${a.text.slice(0, 200)}`);
			return;
		}
		const ok = {
			phase: g.phase === w.phase,
			anchor:
				w.phase === "reading" ? near(g.at, w.at!)
				: w.phase === "typing" ? typed(g.text, w.text!) && (!w.twice || g.occurrence === w.occurrence)
				: w.phase === "pause" ? lastWord(squash(g.text) || "-") === w.text && near(g.pause, w.pause!)
				: squash(g.text) === squash(w.text),
			movements: Array.isArray(g.steps) && g.steps.length === w.steps.length && w.steps.every((s, j) => same(g.steps[j]?.movements, s.movements)),
			intensities: Array.isArray(g.steps) && g.steps.length === w.steps.length && w.steps.every((s, j) => same(g.steps[j]?.intensities, s.intensities)),
			seconds: Array.isArray(g.steps) && g.steps.length === w.steps.length && w.steps.every((s, j) => near(g.steps[j]?.seconds, s.seconds)),
		};
		for (const f of FIELDS) if (ok[f]) t[f]++;
		if (FIELDS.every((f) => ok[f])) t.whole++;
		else if (a.format === process.env.WRONG) wrong.push(`${a.model} ${a.item} #${i} wrong ${FIELDS.filter((f) => !ok[f]).join(",")}: wanted ${JSON.stringify(w)} got ${JSON.stringify(g)}`);
	});
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const out = ["# Face format: decode accuracy and cost", "", `${answers.length} turns. Effort asked: ${process.env.HARNESS === "claude" ? "none (`claude -p` could not be held to one; a turn either thought first or did not)" : "off"}; applied: ${[...new Set(answers.map((a) => `${a.model.replace("claude-", "")} ${a.effort}`))].join(", ")}.`, "", "An entry is one line of a block. **whole** is entries with every field right. A typed stretch is right when it is given whole, or as the two ends around the `…` a block may write for a long one; **long anchors given whole** counts the first. **Block** is what a block costs in input tokens (the same turn with it less without, mean over the items); **legend** is what its paragraph in the system prompt costs, once per turn.", "", "| Format · legend | Model | whole | phase | anchor | movements | intensities | seconds | unparsed answers | long anchors given whole | block | legend |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
const mean = (xs: number[] | undefined) => (xs?.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(0) : "–");
for (const [key, t] of [...tallies].sort()) {
	const [format, model] = key.split(" | ");
	out.push(`| ${format} | ${model!.replace("claude-", "")} | ${pct(t.whole, t.entries)} (${t.whole}/${t.entries}) | ${FIELDS.map((f) => pct(t[f], t.entries)).join(" | ")} | ${t.unparsed}/${t.answers} | ${t.expanded}/${t.long} | ${mean(cost.get(`${format!.split(" · ")[0]} | ${model}`))} | ${legendCost.get(key) ?? 0} |`);
}
process.stdout.write((process.env.WRONG ? wrong : out).join("\n") + "\n");
