// Expression-signal experiment harness, not a test. Runs the blind pairwise judge: one `claude -p`
// on Opus per pair and order, told what was true of the user and not which answer saw a block.
// Usage: node judge.mjs [concurrency]
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process";
import { ARMS, HERE, OUT, REPS, repDir } from "./paths.mjs";
const RAW = path.join(OUT, "judge/raw"); const CWD = path.join(OUT, "judge/cwd");
fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(CWD, { recursive: true });
const truths = JSON.parse(fs.readFileSync(path.join(HERE, "truths.json"), "utf8"));
const conc = Number(process.argv[2] ?? 6);
/** What the judge is shown of an answer: its prose, then what each tool call was given, so an
 *  answer that put its work in a file or a cell is not read as one that did none. */
const SHOWN_ARGS = 2000;
const prose = (dir, slug) => {
  const o = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8")).outcomes.find((o) => o.slug === slug);
  if (!o) return "";
  return [o.prose, ...o.toolCalls.map((t) => `[The assistant called the tool \`${t.name}\`${t.failed ? ", which failed," : ""} with: ${JSON.stringify(t.args).slice(0, SHOWN_ARGS)}]`)].filter(Boolean).join("\n\n");
};
const conversation = (slug) => fs.readFileSync(path.join(HERE, "cases", slug, "doc.md"), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();

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
- remarks_on_user: does it mention the user's face, expression, mood, how they look or seem, or that they are being observed?

Reply with only one JSON object, no prose around it:
{"better":"A" or "B","reason":"<one or two sentences>","A":{"answers_request":true|false,"addresses_need":true|false,"proportionate":true|false,"remarks_on_user":true|false},"B":{...same keys...}}`;

const pairs = [];
for (const [slug, list] of Object.entries(truths)) for (const truth of list) for (const arm of ARMS) for (let r = 1; r <= REPS; r++) for (const order of ["ab", "ba"]) {
  const armDir = repDir(arm, r); const noneDir = repDir("none", r);
  if (!fs.existsSync(path.join(armDir, "report.json")) || !fs.existsSync(path.join(noneDir, "report.json"))) continue;
  pairs.push({ id: `${slug}.${truth.id}.${arm}.r${r}.${order}`, slug, truth, arm, r, order, armText: prose(armDir, slug), noneText: prose(noneDir, slug) });
}

function run(p) {
  return new Promise((res) => {
    const [a, b] = p.order === "ab" ? [p.armText, p.noneText] : [p.noneText, p.armText];
    const child = spawn("claude", ["-p", prompt(p.slug, p.truth, a, b), "--model", "claude-opus-5-5", "--permission-mode", "dontAsk", "--setting-sources", "project", "--output-format", "json"],
      { cwd: CWD, stdio: ["ignore", "pipe", "ignore"] });
    let buf = ""; child.stdout.on("data", (d) => (buf += d));
    child.on("close", () => {
      let verdict = null;
      try { const result = JSON.parse(buf).result; verdict = JSON.parse(result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1)); } catch {}
      const ok = !!verdict && (verdict.better === "A" || verdict.better === "B") && !!verdict.A && !!verdict.B;
      if (ok) fs.writeFileSync(path.join(RAW, p.id + ".json"), JSON.stringify({ id: p.id, slug: p.slug, truth: p.truth.id, kind: p.truth.kind, arm: p.arm, r: p.r, order: p.order, verdict }, null, 1));
      res(ok);
    });
  });
}
const todo = pairs.filter((p) => !fs.existsSync(path.join(RAW, p.id + ".json")));
let i = 0; const fails = [];
const worker = async () => { while (i < todo.length) { const p = todo[i++]; if (!(await run(p)) && !(await run(p))) fails.push(p.id); } };
await Promise.all(Array.from({ length: conc }, worker));
console.log(`${pairs.length} pairs, ${todo.length} judged now, failed: ${fails.length} ${fails.join(" ")}`);
