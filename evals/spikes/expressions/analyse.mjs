// Expression-signal experiment harness, not a test. Reads the judge's verdicts and the run's
// reports and prints the tallies the decision rule names (decision-rule.md).
// Usage: node analyse.mjs > analysis.md
import fs from "node:fs"; import path from "node:path";
import { ARMS, HERE, MODEL_DIR, OUT, REPS, repDir } from "./paths.mjs";
const RAW = path.join(OUT, "judge/raw");
const truths = JSON.parse(fs.readFileSync(path.join(HERE, "truths.json"), "utf8"));
const raw = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(RAW, f), "utf8"))) : [];
const out = []; const say = (s = "") => out.push(s);

/** Two-sided sign test: how likely a split at least this uneven is from a coin. */
function sign(w, l) {
  const n = w + l; if (n === 0) return 1;
  const choose = (n, k) => { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); return c; };
  let p = 0; for (let k = Math.max(w, l); k <= n; k++) p += choose(n, k) / 2 ** n;
  return Math.min(1, 2 * p);
}
const outcomes = (dir) => (fs.existsSync(path.join(dir, "report.json")) ? JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")).outcomes : []);
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const armReps = (arm) => Array.from({ length: REPS }, (_, i) => outcomes(repDir(arm, i + 1))).flat();
// One unit per (case, truth, arm, rep): both orders agreeing is a win, a flip a tie.
const units = new Map();
for (const v of raw) {
  const key = `${v.slug}.${v.truth}.${v.arm}.r${v.r}`;
  const picksArm = (v.verdict.better === "A") === (v.order === "ab");
  const u = units.get(key) ?? { slug: v.slug, truth: v.truth, kind: v.kind, arm: v.arm, picks: [], aPicks: 0 };
  u.picks.push(picksArm); if (v.verdict.better === "A") u.aPicks++;
  units.set(key, u);
}
const all = [...units.values()].filter((u) => u.picks.length === 2);
const tally = (us) => { const w = us.filter((u) => u.picks[0] && u.picks[1]).length; const l = us.filter((u) => !u.picks[0] && !u.picks[1]).length; return { w, l, t: us.length - w - l }; };
const cell = (us) => { const { w, l, t } = tally(us); return us.length ? `${w}–${l} (${t} tie, p=${sign(w, l).toFixed(2)})` : "–"; };

say("# Expression signal: analysis"); say();
say(`${raw.length} judge calls, ${all.length} units. A cell reads **arm wins–control wins (ties, sign-test p)**.`); say();
const kinds = ["adapt", "ignore", "noisy", "misleading", "proactive"];
say("## By kind of truth"); say(); say(`| Kind | ${ARMS.join(" | ")} |`); say(`| --- | ${ARMS.map(() => "---").join(" | ")} |`);
for (const kind of kinds) say(`| ${kind} | ${ARMS.map((arm) => cell(all.filter((u) => u.kind === kind && u.arm === arm))).join(" | ")} |`);
// The judge reads prose only. Where the control put its answer in a file or a cell and a signal
// arm wrote it out, the pair compares an answer with its payload to one without.
const offPage = (slug) => ["none", ...ARMS].some((arm) => armReps(arm).some((o) => o.slug === slug && o.toolCalls.length > 0));
const mixed = Object.keys(truths).filter(offPage);
say(`| adapt, without ${mixed.join(", ") || "–"} | ${ARMS.map((arm) => cell(all.filter((u) => u.kind === "adapt" && u.arm === arm && !mixed.includes(u.slug)))).join(" | ")} |`);
say(`| ignore + noisy | ${ARMS.map((arm) => cell(all.filter((u) => (u.kind === "ignore" || u.kind === "noisy") && u.arm === arm))).join(" | ")} |`);
say(); say(`Left out of the second adapt row: cases where some answer called a tool (${mixed.join(", ") || "none"}), so part of it was not prose the judge could read.`);
say(); say("## By case and truth"); say(); say(`| Case · truth | ${ARMS.join(" | ")} |`); say(`| --- | ${ARMS.map(() => "---").join(" | ")} |`);
for (const [slug, list] of Object.entries(truths)) for (const t of list) say(`| ${slug} · ${t.id} (${t.kind}) | ${ARMS.map((arm) => cell(all.filter((u) => u.slug === slug && u.truth === t.id && u.arm === arm))).join(" | ")} |`);

// Rubric yes-rates: each answer is read once per call it appears in.
say(); say("## What the judge said of each arm's answers (yes / readings)"); say();
const QS = ["answers_request", "addresses_need", "proportionate", "remarks_on_user"];
const rate = (rows, q) => { const yes = rows.filter((x) => x[q]).length; return rows.length ? `${yes}/${rows.length}` : "–"; };
const readings = (pred, arm) => raw.filter((v) => pred(v) && (arm === "none" ? true : v.arm === arm)).map((v) => v.verdict[(arm === "none") === (v.order === "ab") ? "B" : "A"]);
for (const kind of kinds) {
  say(`**${kind}**`); say(); say(`| Arm | ${QS.join(" | ")} |`); say(`| --- | ${QS.map(() => "---").join(" | ")} |`);
  for (const arm of ["none", ...ARMS]) say(`| ${arm} | ${QS.map((q) => rate(readings((v) => v.kind === kind, arm), q)).join(" | ")} |`);
  say();
}
say("**addresses_need, adapt truths, per case**"); say(); say(`| Case | none | ${ARMS.join(" | ")} |`); say(`| --- | --- | ${ARMS.map(() => "---").join(" | ")} |`);
for (const [slug, list] of Object.entries(truths)) if (list.some((t) => t.kind === "adapt")) say(`| ${slug} | ${["none", ...ARMS].map((arm) => rate(readings((v) => v.slug === slug && v.kind === "adapt", arm), "addresses_need")).join(" | ")} |`);
const aShare = raw.filter((v) => v.verdict.better === "A").length;
say(); say(`Position: "A" picked in ${aShare}/${raw.length} calls. Flips: ${all.filter((u) => u.picks[0] !== u.picks[1]).length}/${all.length} units.`);

// Mechanical: words, and words about the user's face, straight from the answers.
const FACE = /\b(frown\w*|smil\w*|camera|facial|your (face|expression|brows?)|you (seem|look|appear)(ed)?\b|brows?\b|squint\w*|head shake|yawn\w*|tired\b)/i;
say(); say("## Words per answer (median of reps)"); say(); say(`| Case | none | ${ARMS.join(" | ")} |`); say(`| --- | --- | ${ARMS.map(() => "---").join(" | ")} |`);
for (const slug of Object.keys(truths)) say(`| ${slug} | ${["none", ...ARMS].map((arm) => median(armReps(arm).filter((o) => o.slug === slug).map((o) => words(o.prose)))).join(" | ")} |`);
say(); say("## Answers whose prose names the user's face or state (word search)"); say();
for (const arm of ["none", ...ARMS]) { const os = armReps(arm); const hits = os.filter((o) => FACE.test(o.prose)); say(`- **${arm}:** ${hits.length}/${os.length}${hits.length ? " — " + hits.map((o) => `${o.slug}: “${o.prose.match(new RegExp(`.{0,60}${FACE.source}.{0,60}`, "i"))?.[0].replace(/\s+/g, " ")}”`).join("; ") : ""}`); }
say(); say("## Answers the judge said remark on the user (flagged in any reading / answers)"); say();
for (const arm of ARMS.filter((a) => a !== "floor")) {
  const flagged = new Set(raw.filter((v) => v.arm === arm && v.verdict[v.order === "ab" ? "A" : "B"].remarks_on_user).map((v) => `${v.slug} r${v.r}`));
  say(`- **${arm}:** ${flagged.size}/${armReps(arm).length}${flagged.size ? " — " + [...flagged].sort().join(", ") : ""}`);
}
say(); say("## Checks and tools on the spike cases"); say();
for (const arm of ["none", ...ARMS]) { const os = armReps(arm); const cs = os.flatMap((o) => o.checks); say(`- **${arm}:** ${cs.filter((c) => c.pass).length}/${cs.length} checks; failing: ${os.flatMap((o) => o.checks.filter((c) => !c.pass).map((c) => `${o.slug} (${c.check})`)).join(", ") || "none"}; tools: ${os.flatMap((o) => o.toolCalls.map((t) => `${o.slug} ${t.name}${t.failed ? " (failed)" : ""}`)).join(", ") || "none"}`); }

say(); say("## Regression cases (checks passed in each of the reps)"); say();
const REG = ["none", "frown", "guided-frown"]; const regs = (arm) => Array.from({ length: REPS }, (_, i) => outcomes(path.join(OUT, "regression", arm, `r${i + 1}`)));
const checkKeys = [...new Set(regs("none").flat().flatMap((o) => o.checks.map((c) => `${o.slug} · ${c.check}`)))];
say(`| Check | ${REG.join(" | ")} |`); say(`| --- | ${REG.map(() => "---").join(" | ")} |`);
for (const key of checkKeys) {
  const cells = REG.map((arm) => regs(arm).map((os) => { const [slug, check] = key.split(" · "); const c = os.find((o) => o.slug === slug)?.checks.find((c) => c.check === check); return c ? (c.pass ? "✓" : "✗") : "·"; }).join(""));
  if (new Set(cells).size > 1 || cells.some((c) => c.includes("✗"))) say(`| ${key} | ${cells.join(" | ")} |`);
}
say(); say(`${checkKeys.length} checks; rows shown only where an arm differs or fails.`);
for (const arm of REG) { const os = regs(arm).flat(); const hits = os.filter((o) => FACE.test(o.prose)); say(`- **${arm}:** median ${median(os.map((o) => words(o.prose)))} words; names the user's face in ${hits.length}/${os.length}`); }
process.stdout.write(out.join("\n") + "\n");
