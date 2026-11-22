// Design-run judge harness, not a test. Unblinds judge/raw/*.json into verdicts.json and prints the tallies summary.md is written from.
import fs from "node:fs"; import path from "node:path";
import { JUDGE as ROOT } from "./paths.mjs";
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, "pairs.json"), "utf8"));
const raw = pairs.filter((p) => fs.existsSync(path.join(ROOT, "raw", p.id + ".json"))).map((p) => JSON.parse(fs.readFileSync(path.join(ROOT, "raw", p.id + ".json"), "utf8")));
const winner = (r) => (r.verdict.better === "A" ? r.armA : r.armB);
const groups = {};
for (const r of raw) { const k = r.id.replace(/--o[12]$/, ""); (groups[k] ??= []).push(r); }
const pairsOut = []; const tally = {}; const perCase = {}; let flips = 0, aPicks = 0;
for (const [k, [r1, r2]] of Object.entries(groups)) { if (!r2) continue;
  const w1 = winner(r1), w2 = winner(r2); const pair = k.split("--")[2]; const c = r1.case;
  const outcome = w1 === w2 ? w1 : "tie"; if (outcome === "tie") flips++;
  pairsOut.push({ pair: k, case: c, rep: r1.rep, arms: pair, order1: { A: r1.armA, B: r1.armB, winner: w1, reason: r1.verdict.reason }, order2: { A: r2.armA, B: r2.armB, winner: w2, reason: r2.verdict.reason }, outcome });
  const t = (tally[pair] ??= { wins: {}, ties: 0, n: 0 }); t.n++; if (outcome === "tie") t.ties++; else t.wins[outcome] = (t.wins[outcome] ?? 0) + 1;
  const pc = ((perCase[c] ??= {})[pair] ??= []); pc.push(outcome === "tie" ? "tie" : outcome);
}
for (const r of raw) if (r.verdict.better === "A") aPicks++;
const rub = {};
for (const r of raw) for (const [side, arm] of [["A", r.armA], ["B", r.armB]]) {
  const x = (rub[arm] ??= { n: 0, finished: 0, consistent: 0, data_correct: 0, not_broken: 0 }); x.n++;
  for (const q of ["finished", "consistent", "data_correct", "not_broken"]) if (r.verdict[side][q]) x[q]++;
}
const sheets = JSON.parse(fs.readFileSync(path.join(ROOT, "sheet-verdicts.json"), "utf8"));
const out = { method: "see evals/README.md", calls: raw.length, models: [...new Set(raw.map((r) => r.model))], positionA: aPicks, flips, tally, perCase, rubric: rub, pairs: pairsOut, sheets };
fs.writeFileSync(path.join(ROOT, "verdicts.json"), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ calls: raw.length, models: out.models, aPicks, flips, tally, perCase, rub }, null, 1));
