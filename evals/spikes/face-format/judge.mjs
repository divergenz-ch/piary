// Face-format experiment harness, not a test. The blind pairwise judge: one `claude -p` on Opus
// per pair, told what was true of the user and not which answer saw a block. Each pair is shown
// in one order chosen by a hash of its id; one pair in ten is also judged the other way round,
// to measure how often the order decides. Stops at five failures in a row (a usage limit looks
// like that) instead of calling the cell failed; run it again to resume.
// Usage: PHASE=typing JUDGED="codes floor" [SPLIT=test] [MODELS="…"] node judge.mjs [concurrency]
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process"; import { createHash } from "node:crypto";
import { HERE, MODELS, OUT, REPS, repDir } from "./paths.mjs";
const PHASE = process.env.PHASE; const ARMS = (process.env.JUDGED ?? "").split(" ").filter(Boolean); const SPLIT = process.env.SPLIT ?? "test";
const PREFIX = process.env.CASES ?? ""; // "read-" judges the reading cases only
const RAW = path.join(OUT, PHASE, "judge"); const CWD = path.join(OUT, "judge-cwd");
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(CWD, { recursive: true });
const truths = JSON.parse(fs.readFileSync(path.join(HERE, "truths.json"), "utf8"));
const conc = Number(process.argv[2] ?? 8);
const SHOWN_ARGS = 2000;
const answer = (dir, slug) => {
  const f = path.join(dir, "report.json"); if (!fs.existsSync(f)) return null;
  const o = JSON.parse(fs.readFileSync(f, "utf8")).outcomes.find((o) => o.slug === slug);
  if (!o || o.error) return null;
  return [o.prose, ...o.toolCalls.map((t) => `[The assistant called the tool \`${t.name}\`${t.failed ? ", which failed," : ""} with: ${JSON.stringify(t.args).slice(0, SHOWN_ARGS)}]`)].filter(Boolean).join("\n\n");
};
const conversation = (slug) => fs.readFileSync(path.join(HERE, "cases", slug, "doc.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();
const split = (slug) => fs.readFileSync(path.join(HERE, "cases", slug, "split"), "utf8").trim();
const hash = (s) => createHash("sha256").update(s).digest().readUInt32BE(0);

const prompt = (slug, truth, a, b) => `You are judging two answers an assistant gave to the last message of a conversation in a document app. Use no tools.

The conversation, ending with the user's last message (\`<!-- you -->\` is the user, \`<!-- pi -->\` the assistant):
"""
${conversation(slug)}
"""

What was true of the user at that moment. The assistant was not told this, and the user did not say it:
"""
${truth.state}
"""

Answer A:
"""
${a || "(the assistant wrote nothing)"}
"""

Answer B:
"""
${b || "(the assistant wrote nothing)"}
"""

Decide which answer serves this user better, given what was true of them. Then answer four yes/no questions for each answer:
- answers_request: does it do what the user's last message asked?
- addresses_need: does it meet the unspoken need described above, where there is one? Answer false when there is none to meet.
- proportionate: is its length and effort right for this user, with nothing they did not need?
- remarks_on_user: does it mention the user's face, expression, mood, how they look or seem, how they typed or paused, or that they are being observed?

Reply with only one JSON object, no prose around it:
{"better":"A" or "B","reason":"<one or two sentences>","A":{"answers_request":true|false,"addresses_need":true|false,"proportionate":true|false,"remarks_on_user":true|false},"B":{...same keys...}}`;

const pairs = [];
for (const model of MODELS) for (const [slug, list] of Object.entries(truths)) {
  if (!slug.startsWith(PREFIX) || slug.startsWith("alone-") || split(slug) !== SPLIT) continue;
  for (const truth of list) for (const arm of ARMS) for (let r = 1; r <= REPS; r++) {
    const armText = answer(repDir(PHASE, model, arm, r), slug); const noneText = answer(repDir(PHASE, model, "none", r), slug);
    if (armText === null || noneText === null) continue;
    const id = `${model}.${slug}.${truth.id}.${arm}.r${r}`; const first = hash(id) % 2 ? "ab" : "ba";
    for (const order of hash(`twice.${id}`) % 10 === 0 ? ["ab", "ba"] : [first]) pairs.push({ id: `${id}.${order}`, model, slug, truth, arm, r, order, armText, noneText });
  }
}

let streak = 0; let stop = false; const fails = [];
function run(p) {
  return new Promise((res) => {
    const [a, b] = p.order === "ab" ? [p.armText, p.noneText] : [p.noneText, p.armText];
    const child = spawn("claude", ["-p", prompt(p.slug, p.truth, a, b), "--model", "claude-opus-5-5", "--permission-mode", "dontAsk", "--setting-sources", "project", "--output-format", "json"], { cwd: CWD, stdio: ["ignore", "pipe", "pipe"] });
    let buf = ""; let err = ""; child.stdout.on("data", (d) => (buf += d)); child.stderr.on("data", (d) => (err += d));
    child.on("close", () => {
      let verdict = null;
      try { const result = JSON.parse(buf).result; verdict = JSON.parse(result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1)); } catch {}
      const ok = !!verdict && (verdict.better === "A" || verdict.better === "B") && !!verdict.A && !!verdict.B;
      if (ok) { streak = 0; fs.writeFileSync(path.join(RAW, p.id + ".json"), JSON.stringify({ id: p.id, model: p.model, slug: p.slug, truth: p.truth.id, kind: p.truth.kind, arm: p.arm, r: p.r, order: p.order, verdict }, null, 1)); }
      else { fails.push(p.id); if (++streak >= 5 && !stop) { stop = true; console.log(`stopping: five failures in a row. Last output: ${(err || buf).slice(0, 400)}`); } }
      res();
    });
  });
}
const todo = pairs.filter((p) => !fs.existsSync(path.join(RAW, p.id + ".json")));
let i = 0;
await Promise.all(Array.from({ length: conc }, async () => { while (i < todo.length && !stop) await run(todo[i++]); }));
console.log(`${PHASE}: ${pairs.length} pairs, ${todo.length} to judge, ${todo.length - fails.length - (todo.length - i)} judged now, ${fails.length} failed${stop ? ", STOPPED EARLY" : ""}`);
process.exit(stop ? 2 : 0);
