// Face-format experiment harness, not a test. Reads one phase's reports and the judge's
// verdicts and prints its tallies. A pair is one unit, counted in the order its id's hash chose;
// the pairs judged in both orders only measure how often the order decides. The cases with
// nothing typed (alone-*) are scored without a judge: spoke or stayed silent, against the truth.
// Usage: PHASE=typing ARMS="face@face floor" [SPLIT=test] [CASES=<prefix>] [EXCEPT="<prefix> …"] [MODELS="…"] node analyse.mjs > results/<phase>.md
import fs from "node:fs"; import path from "node:path"; import { createHash } from "node:crypto";
import { HERE, MODELS, OUT, REPS, SILENT, repDir } from "./paths.mjs";
const PHASE = process.env.PHASE; const ARMS = (process.env.ARMS ?? "").split(" ").filter(Boolean); const SPLIT = process.env.SPLIT ?? "test"; const PREFIX = process.env.CASES ?? "";
const RAW = path.join(OUT, PHASE, "judge");
const truths = JSON.parse(fs.readFileSync(path.join(HERE, "truths.json"), "utf8"));
const split = (slug) => fs.readFileSync(path.join(HERE, "cases", slug, "split"), "utf8").trim();
const EXCEPT = (process.env.EXCEPT ?? "").split(" ").filter(Boolean); // prefixes of cases left out
const slugs = Object.keys(truths).filter((s) => s.startsWith(PREFIX) && !EXCEPT.some((x) => s.startsWith(x)) && split(s) === SPLIT);
const raw = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"))).filter((v) => slugs.includes(v.slug) && ARMS.includes(v.arm) && MODELS.includes(v.model)) : [];
const hash = (s) => createHash("sha256").update(s).digest().readUInt32BE(0);
const out = []; const say = (s = "") => out.push(s);

/** Two-sided sign test: how likely a split at least this uneven is from a coin. */
function sign(w, l) {
  const n = w + l; if (n === 0) return 1;
  const choose = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };
  let p = 0; for (let k = Math.max(w, l); k <= n; k++) p += choose(n, k) / 2 ** n;
  return Math.min(1, 2 * p);
}
const outcomes = (model, arm) => Array.from({ length: REPS }, (_, i) => { const f = path.join(repDir(PHASE, model, arm, i + 1), "report.json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")).outcomes.filter((o) => slugs.includes(o.slug) && !o.error) : []; }).flat();
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : "–"; };
const picksArm = (v) => (v.verdict.better === "A") === (v.order === "ab");
const side = (v, mine) => v.verdict[mine === (v.order === "ab") ? "A" : "B"];
const pairId = (v) => `${v.model}.${v.slug}.${v.truth}.${v.arm}.r${v.r}`;
// The unit of a pair is its verdict in the order the hash chose; a pair judged twice has that one too.
const units = raw.filter((v) => v.order === (hash(pairId(v)) % 2 ? "ab" : "ba"));
const cell = (us) => { const w = us.filter(picksArm).length; const l = us.length - w; return us.length ? `${w}–${l} (p=${sign(w, l).toFixed(2)})` : "–"; };
const typed = slugs.filter((s) => !s.startsWith("alone-"));
const kinds = [...new Set(typed.flatMap((s) => truths[s].map((t) => t.kind)))];

say(`# Face format: ${PHASE}${PREFIX ? ` (${PREFIX}*)` : ""}, ${SPLIT} split`); say();
const applied = [...new Set(MODELS.flatMap((m) => ["none", ...ARMS].flatMap((a) => outcomes(m, a).map((o) => `${m} ${o.effort ?? "?"}`))))];
say(`Effort asked: off; applied: ${applied.join(", ") || "–"}.`); say();

if (typed.length) {
  say(`${raw.length} judge calls, ${units.length} pairs. A cell reads **arm's answer preferred–control's preferred (sign-test p)**. \`floor\` is control against control. The judge is told what was true of the user: under an \`adapt\` truth the block was right about them, under a \`wrong\` truth the same block was sent and meant nothing of the kind, under \`nothing\` the block held only what a face does when it means nothing.`); say();
  say("## Which answer the judge preferred"); say();
  say(`| Model | Arm | ${kinds.join(" | ")} |`); say(`| --- | --- | ${kinds.map(() => "---").join(" | ")} |`);
  for (const model of [...MODELS, "all"]) for (const arm of ARMS) say(`| ${model} | ${arm} | ${kinds.map((k) => cell(units.filter((u) => (model === "all" || u.model === model) && u.arm === arm && u.kind === k))).join(" | ")} |`);
  say(); say("## By case and truth (all models)"); say(); say(`| Case · truth | ${ARMS.join(" | ")} |`); say(`| --- | ${ARMS.map(() => "---").join(" | ")} |`);
  for (const slug of typed) for (const t of truths[slug]) say(`| ${slug} · ${t.id} (${t.kind}) | ${ARMS.map((arm) => cell(units.filter((u) => u.slug === slug && u.truth === t.id && u.arm === arm))).join(" | ")} |`);

  say(); say("## What the judge said of the answers (yes / readings)"); say();
  const QS = ["answers_request", "addresses_need", "proportionate", "remarks_on_user"];
  const rate = (rows, q) => (rows.length ? `${rows.filter((x) => x[q]).length}/${rows.length}` : "–");
  for (const kind of kinds) {
    say(`**${kind}**`); say(); say(`| Model | Answers of | ${QS.join(" | ")} |`); say(`| --- | --- | ${QS.map(() => "---").join(" | ")} |`);
    for (const model of MODELS) {
      const mine = (v) => v.model === model && v.kind === kind;
      say(`| ${model} | none | ${QS.map((q) => rate(units.filter((v) => mine(v) && v.arm !== "floor").map((v) => side(v, false)), q)).join(" | ")} |`);
      for (const arm of ARMS) say(`| ${model} | ${arm} | ${QS.map((q) => rate(units.filter((v) => mine(v) && v.arm === arm).map((v) => side(v, true)), q)).join(" | ")} |`);
    }
    say();
  }
  const twice = new Map();
  for (const v of raw) twice.set(pairId(v), [...(twice.get(pairId(v)) ?? []), v]);
  const both = [...twice.values()].filter((vs) => vs.length === 2);
  say(`Order: "A" preferred in ${raw.filter((v) => v.verdict.better === "A").length}/${raw.length} calls. Of ${both.length} pairs judged in both orders, ${both.filter(([a, b]) => picksArm(a) !== picksArm(b)).length} changed with the order.`);
}

// Mechanical, straight from the answers.
const FACE = /\b(frown\w*|smil\w*|camera|facial|\[face\]|your (face|expression|brows?)\b|you (seem|look|appear)(ed)?\b|brows?\b|squint\w*|head (shake|nod|tilt)\w*|yawn\w*|lips?\b|paus(ed|ing)\b|hesitat\w*)/i;
const shown = ["none", ...ARMS.filter((a) => a !== "floor")];
if (typed.length) {
  say(); say("## Words, seconds and tools per answer"); say();
  say("| Model | Arm | answers | median words | median seconds | names the face (word search) | tool calls |"); say("| --- | --- | --- | --- | --- | --- | --- |");
  for (const model of MODELS) for (const arm of shown) {
    const os = outcomes(model, arm).filter((o) => typed.includes(o.slug)); const tools = os.flatMap((o) => o.toolCalls.map((t) => `${o.slug} ${t.name}${t.failed ? " (failed)" : ""}`));
    say(`| ${model} | ${arm} | ${os.length} | ${median(os.map((o) => words(o.prose)))} | ${median(os.map((o) => Math.round(o.ms / 1000)))} | ${os.filter((o) => FACE.test(o.prose)).length} | ${tools.length ? [...new Set(tools)].map((t) => `${t} ×${tools.filter((x) => x === t).length}`).join(", ") : "none"} |`);
  }
  say(); say("## Median words per case: " + shown.join(" → ")); say(); say(`| Case | ${MODELS.join(" | ")} |`); say(`| --- | ${MODELS.map(() => "---").join(" | ")} |`);
  for (const slug of typed) say(`| ${slug} | ${MODELS.map((m) => shown.map((arm) => median(outcomes(m, arm).filter((o) => o.slug === slug).map((o) => words(o.prose)))).join(" → ")).join(" | ")} |`);
  say(); say("## Answers that name the user's face or how they typed (word search)"); say();
  for (const model of MODELS) for (const arm of shown) for (const o of outcomes(model, arm).filter((o) => typed.includes(o.slug) && FACE.test(o.prose))) say(`- ${model} · ${arm} · ${o.slug}: “${o.prose.match(new RegExp(`.{0,70}${FACE.source}.{0,70}`, "i"))?.[0].replace(/\s+/g, " ")}”`);
}

const alone = slugs.filter((s) => s.startsWith("alone-"));
if (alone.length) {
  // An arm is `<truth id>` or `<truth id>@<guidance>`: the block sent is the one that truth describes.
  const truthOf = (slug, arm) => truths[slug].find((t) => t.id === arm.split("@")[0]);
  say(); say("## Nothing typed: spoke or stayed silent"); say();
  say("An answer is silent when it is empty, `[silent]` or `∅`. **right** is answers that did what the truth says (speak, or stay silent)."); say();
  say("| Model | Arm | truth says silent: silent / answers | truth says speak: spoke / answers | right | median words when it spoke | median seconds |"); say("| --- | --- | --- | --- | --- | --- | --- |");
  const spoken = [];
  for (const model of MODELS) for (const arm of ARMS) {
    const os = outcomes(model, arm).filter((o) => alone.includes(o.slug) && truthOf(o.slug, arm));
    const rows = os.map((o) => ({ o, want: truthOf(o.slug, arm).kind, silent: SILENT.test(o.prose) && o.toolCalls.length === 0 }));
    const s = rows.filter((r) => r.want === "silent"); const k = rows.filter((r) => r.want === "speak");
    for (const r of rows.filter((r) => !r.silent)) spoken.push(`- ${model} · ${arm} · ${r.o.slug} (truth: ${r.want}), ${words(r.o.prose)} words${r.o.toolCalls.length ? `, tools: ${r.o.toolCalls.map((t) => t.name).join(", ")}` : ""}: “${r.o.prose.replace(/\s+/g, " ").slice(0, 260)}”`);
    say(`| ${model} | ${arm} | ${s.filter((r) => r.silent).length}/${s.length} | ${k.filter((r) => !r.silent).length}/${k.length} | ${rows.filter((r) => (r.want === "silent") === r.silent).length}/${rows.length} | ${median(rows.filter((r) => !r.silent).map((r) => words(r.o.prose)))} | ${median(os.map((o) => Math.round(o.ms / 1000)))} |`);
  }
  say(); say("### What was said"); say(); for (const line of spoken) say(line);
}
process.stdout.write(out.join("\n") + "\n");
