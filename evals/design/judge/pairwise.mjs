// Design-run judge harness, not a test. Runs the blind pairwise judge calls: one `claude -p` per pair and order, cwd = judge/blind.
// Usage: node pairwise.mjs [concurrency] [onlyId]
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process";
import { CASES_DIR, RUNS as ROOT } from "./paths.mjs";
const BLIND = path.join(ROOT, "judge/blind"); const RAW = path.join(ROOT, "judge/raw");
const pairs = JSON.parse(fs.readFileSync(path.join(ROOT, "judge/pairs.json"), "utf8"));
const conc = Number(process.argv[2] ?? 6); const only = process.argv[3];
export const prompt = (persona, a, b) => `You are judging two screenshots of answers that an assistant drew inside a document app, for one user's request.

The user's request (verbatim):
"""
${persona.trim()}
"""

Image A is the file ./${a} and image B is the file ./${b}, in the current directory. Read both files with the Read tool before answering; read nothing else.

Each image is usually a crop of the drawn part of an answer from a longer document: the answer's surrounding prose is not shown, and text cut off at the top or bottom edge, or small grey labels of the app's own chrome at an edge, are artefacts of the crop and not defects. An image may instead show a whole page when nothing was drawn.

Decide which image better serves this user for this request. Then answer four yes/no questions for each image:
- finished: does it look finished, like a polished product rather than a draft?
- consistent: is it consistent with a calm, neutral app whose look is black on white, one blue accent, rounded cards?
- data_correct: does the data read correctly — order, labels, units, and values that match the request?
- not_broken: is nothing broken, overlapping, clipped inside the drawing, or failing to render?

Reply with only one JSON object, no prose around it:
{"better":"A" or "B","reason":"<one or two sentences>","A":{"finished":true|false,"consistent":true|false,"data_correct":true|false,"not_broken":true|false},"B":{...same keys...}}`;
function run(p) {
  return new Promise((res) => {
    const out = path.join(RAW, p.id + ".jsonl");
    const persona = fs.readFileSync(path.join(CASES_DIR, p.case, "doc.md"), "utf8");
    const child = spawn("claude", ["-p", prompt(persona, p.A, p.B), "--model", "claude-opus-5-5", "--allowedTools", "Read",
      "--permission-mode", "dontAsk", "--setting-sources", "project", "--output-format", "stream-json", "--verbose"],
      { cwd: BLIND, stdio: ["ignore", "pipe", "pipe"] });
    let buf = ""; child.stdout.on("data", (d) => (buf += d)); child.stderr.on("data", (d) => (buf += ""));
    child.on("close", () => { fs.writeFileSync(out + ".tmp", buf); res(check(p, buf, out)); });
  });
}
export function check(p, buf, out) {
  const lines = buf.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const reads = []; let model = null; let result = null; const errs = [];
  for (const m of lines) {
    if (m.type === "system" && m.model) model = m.model;
    if (m.type === "assistant") for (const c of m.message?.content ?? []) if (c.type === "tool_use") reads.push(c.name + ":" + path.basename(c.input?.file_path ?? "?"));
    if (m.type === "user") for (const c of m.message?.content ?? []) if (c.type === "tool_result" && c.is_error) errs.push(String(JSON.stringify(c.content)).slice(0, 200));
    if (m.type === "result") result = m.result;
  }
  let verdict = null; try { verdict = JSON.parse(result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1)); } catch {}
  const okReads = reads.includes("Read:" + p.A) && reads.includes("Read:" + p.B) && reads.every((r) => r === "Read:" + p.A || r === "Read:" + p.B);
  const ok = !!verdict && (verdict.better === "A" || verdict.better === "B") && okReads && errs.length === 0;
  if (ok) { fs.renameSync(out + ".tmp", out); fs.writeFileSync(path.join(RAW, p.id + ".json"), JSON.stringify({ ...p, model, reads, verdict }, null, 1)); }
  return { id: p.id, ok, model, reads, errs, better: verdict?.better };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const todo = pairs.filter((p) => (!only || p.id === only) && !fs.existsSync(path.join(RAW, p.id + ".json")));
  let i = 0; const fails = [];
  const worker = async () => { while (i < todo.length) { const p = todo[i++];
    let r = await run(p); if (!r.ok) r = await run(p);
    console.log(JSON.stringify(r)); if (!r.ok) fails.push(p.id); } };
  await Promise.all(Array.from({ length: conc }, worker));
  console.log("done; failed:", fails.length, fails.join(" "));
}
