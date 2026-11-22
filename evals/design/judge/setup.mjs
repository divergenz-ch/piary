// Design-run judge harness, not a test. Builds judge/blind/ (random names), judge/key.json and judge/pairs.json. Seeded.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { RUNS as ROOT } from "./paths.mjs";
const SEED = "design-judge-2026-11-15";
let ctr = 0;
const rnd = () => { const h = crypto.createHash("sha256").update(SEED + ":" + ctr++).digest(); return h.readUInt32BE(0) / 2 ** 32; };
const ARMS = ["baseline", "self-made", "a2ui"];
const CASES = ["ui-bench-results","ui-compound-interest","ui-runway","ui-support-kpis","ui-survey","ui-vendor-pick"];
const key = {}; const byItem = {};
for (const arm of ARMS) for (const c of CASES) for (const r of [1,2,3]) {
  const base = path.join(ROOT, arm, "shots", `${c}--r${r}`);
  const src = fs.existsSync(base + "--answer.png") ? base + "--answer.png" : base + "--page.png";
  const name = crypto.createHash("sha256").update(SEED + src).digest("hex").slice(0, 10) + ".png";
  fs.copyFileSync(src, path.join(ROOT, "judge/blind", name));
  key[name] = { arm, case: c, rep: r, source: path.relative(ROOT, src) };
  byItem[`${arm}|${c}|${r}`] = name;
}
const pairs = [];
for (const c of CASES) for (const r of [1,2,3]) for (const [x, y] of [["baseline","self-made"],["baseline","a2ui"],["self-made","a2ui"]]) {
  const first = rnd() < 0.5 ? [x, y] : [y, x];
  for (const [ord, [a, b]] of [["o1", first], ["o2", [first[1], first[0]]]])
    pairs.push({ id: `${c}--r${r}--${x}_vs_${y}--${ord}`, case: c, rep: r, A: byItem[`${a}|${c}|${r}`], B: byItem[`${b}|${c}|${r}`], armA: a, armB: b });
}
fs.writeFileSync(path.join(ROOT, "judge/key.json"), JSON.stringify({ seed: SEED, files: key }, null, 2));
fs.writeFileSync(path.join(ROOT, "judge/pairs.json"), JSON.stringify(pairs, null, 2));
console.log(Object.keys(key).length, "images,", pairs.length, "pair calls");
