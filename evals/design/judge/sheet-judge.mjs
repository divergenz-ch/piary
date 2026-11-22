// Design-run judge harness, not a test. Contact-sheet judge calls: one per sheet (1-5 score), then rankings of all three (X/Y/Z, two shuffles).
import fs from "node:fs"; import path from "node:path"; import { spawnSync } from "node:child_process";
import { JUDGE as ROOT } from "./paths.mjs"; const DIR = path.join(ROOT, "blind-sheets");
const key = JSON.parse(fs.readFileSync(path.join(ROOT, "sheet-key.json"), "utf8")); const names = Object.keys(key).sort();
const CTX = `Each image is a contact sheet: 18 answers that an assistant drew inside one document app, for six different user requests (one per column) answered three times each (rows). Each tile is a crop of the drawn part of an answer; prose around it is not shown, and text cut off at a tile's edge or small grey labels of the app's chrome are crop artefacts. A tile may show a whole page where nothing was drawn.`;
function call(prompt, files) {
  const r = spawnSync("claude", ["-p", prompt, "--model", "claude-opus-5-5", "--allowedTools", "Read", "--permission-mode", "dontAsk",
    "--setting-sources", "project", "--output-format", "stream-json", "--verbose"], { cwd: DIR, encoding: "utf8", maxBuffer: 1 << 26 });
  const lines = r.stdout.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const reads = lines.filter((m) => m.type === "assistant").flatMap((m) => m.message.content).filter((c) => c.type === "tool_use").map((c) => path.basename(c.input?.file_path ?? "?"));
  const res = lines.find((m) => m.type === "result")?.result ?? "";
  const verdict = JSON.parse(res.slice(res.indexOf("{"), res.lastIndexOf("}") + 1));
  const model = lines.find((m) => m.type === "system" && m.model)?.model;
  if (!files.every((f) => reads.includes(f)) || reads.some((f) => !files.includes(f))) throw new Error("bad reads " + reads);
  return { model, reads, verdict };
}
const out = { scores: {}, rankings: [] };
for (const n of names) {
  const v = call(`${CTX}\n\nRead the file ./${n} with the Read tool (read nothing else). Do these read as one product with one design language? Score 1 (no shared language at all) to 5 (unmistakably one product), and say why. Reply with only JSON: {"score":1-5,"why":"<two or three sentences>"}`, [n]);
  out.scores[key[n]] = { file: n, ...v }; console.log(key[n], v.verdict.score);
}
for (const perm of [[0, 1, 2], [2, 0, 1]]) {
  const files = perm.map((i) => names[i]); const lab = ["X", "Y", "Z"];
  const v = call(`${CTX}\n\nThree sheets: X is ./${files[0]}, Y is ./${files[1]}, Z is ./${files[2]}. Read all three with the Read tool (read nothing else). Rank them from best to worst on: do the answers read as one finished product with one calm, consistent design language, and do they serve the requests well? Reply with only JSON: {"rank":["X|Y|Z", "...", "..."],"why":"<three or four sentences>"}`, files);
  const map = Object.fromEntries(lab.map((l, i) => [l, key[files[i]]]));
  out.rankings.push({ labels: map, ...v, rankArms: v.verdict.rank.map((l) => map[l]) }); console.log(v.verdict.rank.map((l) => map[l]));
}
fs.writeFileSync(path.join(ROOT, "sheet-verdicts.json"), JSON.stringify(out, null, 2));
