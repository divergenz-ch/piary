// Expression-signal experiment harness, not a test. Where the run's answers are and what was run.
import path from "node:path"; import { execSync } from "node:child_process";
export const HERE = import.meta.dirname;
const main = execSync("git worktree list --porcelain", { cwd: HERE, encoding: "utf8" }).split("\n")[0].replace(/^worktree /, "");
export const OUT = process.env.EXPR_OUT ?? path.join(main, "recordings/expressions");
export const MODEL_DIR = (process.env.MODEL ?? "anthropic/claude-sonnet-5-5").replaceAll("/", "__");
export const REPS = Number(process.env.REPS ?? 3);
/** The arms judged against the control, `none`. `floor` is the control's second half. */
export const ARMS = (process.env.JUDGED ?? "neutral expressive labels guided floor").split(" ");
/** The run directory an arm's rep is in: the floor is reps REPS+1… of `none`. */
export const repDir = (arm, r) => (arm === "floor" ? path.join(OUT, "none", `r${r + REPS}`) : path.join(OUT, arm, `r${r}`));
