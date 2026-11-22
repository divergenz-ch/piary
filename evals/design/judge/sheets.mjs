// Design-run judge harness, not a test. Builds the per-arm contact sheets (unlabelled) and the per-case rep-1 figures (labelled), as HTML
// grids screenshotted with Playwright's Chromium.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import crypto from "node:crypto";
const require = createRequire(path.join(REPO, "package.json"));
const { chromium } = require("@playwright/test");
import { REPO, RUNS as ROOT } from "./paths.mjs";
const ARMS = ["baseline", "self-made", "a2ui"]; const LABEL = { baseline: "baseline", "self-made": "self-made", a2ui: "A2UI" };
const CASES = ["ui-bench-results","ui-compound-interest","ui-runway","ui-support-kpis","ui-survey","ui-vendor-pick"];
const shot = (arm, c, r) => { const b = path.join(ROOT, arm, "shots", `${c}--r${r}`); return fs.existsSync(b + "--answer.png") ? b + "--answer.png" : b + "--page.png"; };
const url = (f) => "file://" + f;
const CSS = `body{margin:0;padding:24px;background:#d9d9d9;font:600 18px -apple-system,Helvetica,sans-serif}
.g{display:grid;gap:16px;align-items:start}.g img{width:100%;display:block;background:#fff;box-shadow:0 0 0 1px #bbb}
.h{padding:4px 0 8px}`;
const browser = await chromium.launch();
async function snap(html, out, width, dpr) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: dpr });
  const f = out.replace(/\.png$/, ".html"); fs.writeFileSync(f, html);
  await page.goto(url(f)); await page.waitForLoadState("load");
  await page.screenshot({ path: out, fullPage: true }); await page.close();
}
// Contact sheets: one per arm, 6 columns (cases) x 3 rows (reps), no labels, identical template.
const sheetKey = {};
for (const arm of ARMS) {
  const cells = [1,2,3].flatMap((r) => CASES.map((c) => `<img src="${url(shot(arm, c, r))}">`)).join("");
  const out = path.join(ROOT, "judge/sheets", `sheet-${arm}.png`);
  await snap(`<!doctype html><style>${CSS}</style><div class="g" style="grid-template-columns:repeat(6,1fr)">${cells}</div>`, out, 1900, 1);
  const blindName = "sheet-" + crypto.createHash("sha256").update("design-sheet" + arm).digest("hex").slice(0, 8) + ".png";
  fs.copyFileSync(out, path.join(ROOT, "judge/blind-sheets", blindName)); sheetKey[blindName] = arm;
}
fs.writeFileSync(path.join(ROOT, "judge/sheet-key.json"), JSON.stringify(sheetKey, null, 2));
// Figures: per case, rep 1, baseline | self-made | A2UI, labelled.
for (const [i, c] of CASES.entries()) {
  const cols = ARMS.map((a) => `<div><div class="h">${LABEL[a]}</div><img src="${url(shot(a, c, 1))}"></div>`).join("");
  await snap(`<!doctype html><style>${CSS}</style><div class="h" style="font-size:22px">${c} — rep 1</div><div class="g" style="grid-template-columns:repeat(3,1fr)">${cols}</div>`,
    path.join(ROOT, "judge/figures", `fig-${i + 1}-${c}.png`), 1900, 2);
}
await browser.close(); console.log("ok");
