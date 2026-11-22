// Design-run judge harness, not a test: where a judging reads its runs and writes its verdicts.
import path from "node:path"; import { execFileSync } from "node:child_process";
export const REPO = path.resolve(import.meta.dirname, "../../..");
export const CASES_DIR = path.join(REPO, "evals/cases");
// The rule of evals/design/run.sh: DESIGN_OUT, else the main checkout's git-ignored recordings/design.
const main = execFileSync("git", ["-C", REPO, "worktree", "list", "--porcelain"], { encoding: "utf8" }).split("\n")[0].replace(/^worktree /, "");
export const RUNS = process.env.DESIGN_OUT ?? path.join(main, "recordings/design");
export const JUDGE = path.join(RUNS, "judge");
