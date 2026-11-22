// Design-run judge harness, not a test. Sensitivity check: self-made vs A2UI on whole-window page shots (rep 1, both orders), cwd = blind-pages.
import fs from "node:fs"; import path from "node:path"; import { spawn } from "node:child_process";
import { CASES_DIR, JUDGE as ROOT } from "./paths.mjs"; const DIR = path.join(ROOT, "blind-pages");
const k = JSON.parse(fs.readFileSync(path.join(ROOT, "pages-key.json"), "utf8"));
const jobs = k.pairs.flatMap((p) => ["o1", "o2"].map((o) => ({ id: `${p.case}--${o}`, case: p.case, A: p[o][0], B: p[o][1] })));
const prompt = (persona, a, b) => `You are judging two screenshots of an assistant's answer in a document app, for one user's request.

The user's request (verbatim):
"""
${persona.trim()}
"""

Image A is ./${a} and image B is ./${b}, in the current directory. Read both with the Read tool; read nothing else.

Each image is the app's window: the request at the top, then the answer (drawn elements and prose). The window may cut the answer off at the bottom; that is the screenshot, not a defect. Small grey labels are the app's chrome. Decide which answer, as far as visible, better serves this user. Reply with only JSON: {"better":"A" or "B","reason":"<one or two sentences>"}`;
const run = (j) => new Promise((res) => {
  const persona = fs.readFileSync(path.join(CASES_DIR, j.case, "doc.md"), "utf8");
  const c = spawn("claude", ["-p", prompt(persona, j.A, j.B), "--model", "claude-opus-5-5", "--allowedTools", "Read", "--permission-mode", "dontAsk",
    "--setting-sources", "project", "--output-format", "stream-json", "--verbose"], { cwd: DIR, stdio: ["ignore", "pipe", "ignore"] });
  let buf = ""; c.stdout.on("data", (d) => (buf += d));
  c.on("close", () => {
    const lines = buf.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
    const reads = lines.filter((m) => m.type === "assistant").flatMap((m) => m.message.content).filter((x) => x.type === "tool_use").map((x) => path.basename(x.input?.file_path ?? "?"));
    const result = lines.find((m) => m.type === "result")?.result ?? ""; let v = null;
    try { v = JSON.parse(result.slice(result.indexOf("{"), result.lastIndexOf("}") + 1)); } catch {}
    const ok = v && ["A", "B"].includes(v.better) && reads.includes(j.A) && reads.includes(j.B) && reads.every((r) => r === j.A || r === j.B);
    if (ok) fs.writeFileSync(path.join(ROOT, "page-raw", j.id + ".json"), JSON.stringify({ ...j, armA: k.key[j.A], armB: k.key[j.B], model: lines.find((m) => m.model)?.model, reads, verdict: v }, null, 1));
    res({ id: j.id, ok, reads, result: ok ? v.better : result.slice(0, 120) });
  });
});
const todo = jobs.filter((j) => !fs.existsSync(path.join(ROOT, "page-raw", j.id + ".json"))); let i = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (i < todo.length) { const j = todo[i++]; let r = await run(j); if (!r.ok) r = await run(j); console.log(JSON.stringify(r)); } }));
const all = fs.readdirSync(path.join(ROOT, "page-raw")).map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "page-raw", f), "utf8")));
const byCase = {}; for (const r of all) (byCase[r.case] ??= []).push(r.verdict.better === "A" ? r.armA : r.armB);
console.log(JSON.stringify(Object.fromEntries(Object.entries(byCase).map(([c, w]) => [c, w.length === 2 && w[0] === w[1] ? w[0] : w.length === 2 ? "tie" : w]))));
