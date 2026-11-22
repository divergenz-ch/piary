// Expression-signal experiment harness, not a test. One row per model and effort: reads every
// cell under $EXPR_OUT/matrix/<model>__<effort>/ (each a run.sh output with its own judge/raw)
// and prints the same tallies side by side.
// Usage: node matrix.mjs > matrix.md
import fs from "node:fs"; import path from "node:path";
import { OUT, REPS } from "./paths.mjs";
const ROOT = path.join(OUT, "matrix");
const SIGNAL = ["expressive", "guided"];
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const outcomes = (cell, arm) => Array.from({ length: REPS }, (_, i) => { const f = path.join(ROOT, cell, arm, `r${i + 1}`, "report.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).outcomes : []; }).flat();
const out = []; const say = (s = "") => out.push(s);
const cells = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "judge/raw"))).sort();
const KINDS = [["adapt", ["adapt"]], ["ignore + noisy", ["ignore", "noisy"]], ["misleading", ["misleading"]], ["proactive", ["proactive"]]];

say("# Expression signal: models and effort"); say();
say("A cell reads **arm wins–control wins (ties)** over the units of that kind; both judge orders agreeing is a win."); say();
say("The effort in a row's name is what the run asked pi for. pi gives a model the nearest level it takes (`off` is `low` on Sonnet and Opus), and the level is a budget: whether an answer was thought about first is not recorded here."); say();
for (const arm of SIGNAL) {
  say(`## ${arm} against control`); say();
  say(`| Model · effort | ${KINDS.map(([k]) => k).join(" | ")} | remarks on the user | met the need (adapt) | control met it |`); say(`| --- | ${KINDS.map(() => "---").join(" | ")} | --- | --- | --- |`);
  for (const cell of cells) {
    const raw = fs.readdirSync(path.join(ROOT, cell, "judge/raw")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, cell, "judge/raw", f), "utf8"))).filter((v) => v.arm === arm);
    const units = new Map();
    for (const v of raw) { const key = `${v.slug}.${v.truth}.r${v.r}`; const u = units.get(key) ?? { kind: v.kind, picks: [] }; u.picks.push((v.verdict.better === "A") === (v.order === "ab")); units.set(key, u); }
    const tally = (kinds) => { const us = [...units.values()].filter((u) => kinds.includes(u.kind) && u.picks.length === 2); const w = us.filter((u) => u.picks[0] && u.picks[1]).length; const l = us.filter((u) => !u.picks[0] && !u.picks[1]).length; return `${w}–${l} (${us.length - w - l})`; };
    const side = (v, mine) => v.verdict[mine === (v.order === "ab") ? "A" : "B"];
    const flagged = new Set(raw.filter((v) => side(v, true).remarks_on_user).map((v) => `${v.slug} r${v.r}`));
    const need = (mine) => { const rows = raw.filter((v) => v.kind === "adapt").map((v) => side(v, mine)); return `${rows.filter((x) => x.addresses_need).length}/${rows.length}`; };
    say(`| ${cell.replace("__", " · ")} | ${KINDS.map(([, k]) => tally(k)).join(" | ")} | ${flagged.size}/${outcomes(cell, arm).length} | ${need(true)} | ${need(false)} |`);
  }
  say();
}
say("## Words per answer (median of reps): control → expressive → guided"); say();
const slugs = [...new Set(cells.flatMap((c) => outcomes(c, "none").map((o) => o.slug)))].sort();
say(`| Model · effort | ${slugs.join(" | ")} |`); say(`| --- | ${slugs.map(() => "---").join(" | ")} |`);
for (const cell of cells) say(`| ${cell.replace("__", " · ")} | ${slugs.map((slug) => ["none", ...SIGNAL].map((arm) => median(outcomes(cell, arm).filter((o) => o.slug === slug).map((o) => words(o.prose)))).join(" → ")).join(" | ")} |`);
say(); say("## Tool calls"); say();
for (const cell of cells) say(`- **${cell.replace("__", " · ")}:** ${["none", ...SIGNAL].map((arm) => `${arm}: ${outcomes(cell, arm).flatMap((o) => o.toolCalls.map((t) => `${o.slug} ${t.name}${t.failed ? " (failed)" : ""}`)).join(", ") || "none"}`).join("; ")}`);
say(); say("## Seconds per answer (median)"); say();
for (const cell of cells) say(`- **${cell.replace("__", " · ")}:** ${["none", ...SIGNAL].map((arm) => `${arm} ${Math.round(median(outcomes(cell, arm).map((o) => o.ms)) / 1000)}`).join(", ")}`);
process.stdout.write(out.join("\n") + "\n");
