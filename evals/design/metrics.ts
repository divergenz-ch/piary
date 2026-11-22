// Design-run harness, not a test: prints one arm's summary (`counts.ts`) from
// the reports and shots `evals/design/run.sh` wrote.
//
//   node evals/design/metrics.ts <arm directory>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Answer, type Shot, summarise } from "./counts.ts";

const out = process.argv[2]!;
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const answers: Answer[] = readdirSync(join(out, "reports")).flatMap((f) => json(join(out, "reports", f)).outcomes);
const shots: Shot[] = existsSync(join(out, "shots"))
	? readdirSync(join(out, "shots"))
			.filter((f) => f.endsWith(".json"))
			.map((f) => json(join(out, "shots", f)))
	: [];
process.stdout.write(`${JSON.stringify(summarise(answers, shots), null, 2)}\n`);
