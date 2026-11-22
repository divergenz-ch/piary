// Runs the eval cases against a real pi and writes a report.
//
//   pnpm eval [--harness pi|claude] [--model provider/id]… [--prompt <file> | --no-prompt] [--case <slug>]…
//             [--out <dir>] [--compare <report.json>] [--jobs <n>] [--draw a2ui|free]
//             [--cases <dir>] [--signals <dir> --signal <arm>] [--thinking <level>] [--accept-edits]
//
// Each case is answered the way the app answers it: the user's own pi (ADR 0004),
// Piary's extension passed with `-e`, the prompt file appended, pi's history
// rebuilt from the document above the prompt, the prompt sent with the
// `[now: …]` line (ADR 0028), the `cell` tool's question about a cell it
// wrote answered (`verdict.ts`), and pi told how to draw (`--draw`, ADR 0044).
// Not part of `pnpm verify` or `make ci`: a model's answer is not the same
// twice. Model calls are cheap — run it whenever a prompt, model or pi change
// needs an answer.
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { RpcClient, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { historyAbove } from "../src/document/run.ts";
import { type DocumentHistory, rebuildEntries } from "../src/document/transcript.ts";
import { nowLine, withNow } from "../src/document/turn-context.ts";
import { type DrawMode, drawMode } from "../pi-extension/draw-mode.ts";
import { type Case, NEEDS_PI_TAG, parseCase } from "./case.ts";
import { askClaude } from "./claude/turn.ts";
import { claudeEffort, claudeModel, withHistory } from "./claude/wire.ts";
import { type CheckResult, type ToolCall, runChecks } from "./checks.ts";
import { Page } from "./page.ts";
import { answerProse, answerText, placeAnswer, refusalOf, target, turnOf } from "./place.ts";
import { refusedLines, refusedSection } from "./refused.ts";
import { type Roots, scrubbed, scrubPaths } from "./scrub.ts";

/** The zone every eval message says it was sent from. One fixed place, so a report says the same
 *  whoever ran it and wherever: an answer that reasons about the time is then comparable across
 *  runs, and no report carries the zone of the machine that made it. */
const EVAL_ZONE = "Europe/Stockholm";

const REPO = join(import.meta.dirname, "..");
const CASES = join(REPO, "evals/cases");
const PACKAGE = join(REPO, "pi-extension");
const PROMPT = join(PACKAGE, "system-prompt.md");
/** What a report writes in place of this machine's directories (`scrub.ts`). */
const MACHINE: Roots = { repo: resolve(REPO), home: homedir() };

/** The two models a prompt must pass on before it ships (the system-prompt decision 6). */
const DEFAULT_MODELS = ["openai-codex/gpt-5.6-luna", "anthropic/claude-sonnet-5-5"];

/**
 * What runs the model's loop. `pi` is the user's own pi, as the app runs it:
 * what ships, and what a prompt change is judged on. `claude` is `claude -p`
 * on the account it is signed in to, with that same pi serving its prompt and
 * tools: close to the app, on a Claude plan's limits (README §The claude harness).
 */
const HARNESSES = ["pi", "claude"] as const;
type Harness = (typeof HARNESSES)[number];

/** The model the claude harness answers on when none is named: the default it can run. */
const CLAUDE_MODELS = ["anthropic/claude-sonnet-5-5"];

/** How long one turn may take. A fix-and-run case runs tools for a while; past
 *  this the turn is recorded as failed rather than holding the run open. */
const TURN_TIMEOUT_MS = 5 * 60_000;

/** Turns in flight at once. Each is its own pi process and provider request. */
const DEFAULT_JOBS = 4;

interface Outcome {
	slug: string;
	model: string;
	job: Case["job"];
	title: string;
	/** The case's tags: `known gap` marks a failure no prompt can fix. */
	tags: string[];
	checks: CheckResult[];
	toolCalls: ToolCall[];
	prose: string;
	error?: string;
	/** The provider's reason, when it refused the turn: the case was never answered. */
	refused?: string;
	/** The effort pi said it runs at, which is not always the one asked for. */
	effort?: string;
	/** The case's history went in as the document's text, not as messages (`claude/wire.ts`). */
	historyAsText?: true;
	ms: number;
}

/**
 * The user's own pi, as the app runs it: `PI_CLI` when it names a `cli.js`, else
 * the release the managed launcher (`~/.pi/agent/bin/pi`) would exec, read from
 * `install/current-version`. `RpcClient` spawns `node <cliPath>`, so the shell
 * launcher itself cannot be used.
 */
function userPi(): { cli: string; index: string; version: string; installRoot: string } {
	const installRoot = join(homedir(), ".pi/agent/install");
	if (process.env.PI_CLI?.endsWith(".js")) return { cli: process.env.PI_CLI, index: join(dirname(process.env.PI_CLI), "index.js"), version: "PI_CLI", installRoot };
	const versionFile = join(installRoot, "current-version");
	if (!existsSync(versionFile)) throw new Error(`no managed pi: ${versionFile} is missing (set PI_CLI to a pi cli.js)`);
	const version = readFileSync(versionFile, "utf8").trim();
	const cli = join(installRoot, "releases", version, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js");
	if (!existsSync(cli)) throw new Error(`pi ${version} has no cli.js at ${cli}`);
	return { cli, index: join(dirname(cli), "index.js"), version, installRoot };
}

/** Every file under `dir`, relative path → sha256. */
function hashes(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (at: string) => {
		for (const name of readdirSync(at)) {
			const path = join(at, name);
			if (statSync(path).isDirectory()) walk(path);
			else out.set(relative(dir, path), createHash("sha256").update(readFileSync(path)).digest("hex"));
		}
	};
	if (existsSync(dir)) walk(dir);
	return out;
}

function loadCase(cases: string, slug: string): { spec: Case; md: string; dir: string } {
	const dir = join(cases, slug);
	return { spec: parseCase(JSON.parse(readFileSync(join(dir, "case.json"), "utf8")), slug), md: readFileSync(join(dir, "doc.md"), "utf8"), dir };
}

/** Where a run's cases are, and the text it sends after each prompt. */
interface Source {
	cases: string;
	/** `--signals`: a directory of `<slug>/<arm>.md`, with `_default/<arm>.md` for a case that has none. */
	signals?: string;
	/** `--signal`: which arm's text to send. */
	arm?: string;
	/** `--thinking`: the effort the case's pi is started at. Absent: the user's pi settings decide. */
	thinking?: string;
	/** `--accept-edits`: a `canvas_edit` is planned against the conversation and answered as the
	 *  page would, instead of cancelled. */
	acceptEdits?: boolean;
}

/**
 * The text an experiment sends after a case's prompt, before the `[now: …]`
 * line: something the app would add to a message that the document never
 * holds. None when the run names no arm or neither file exists, which is how
 * a control arm is written.
 */
function signalFor(source: Source, slug: string): string | null {
	if (!source.signals || !source.arm) return null;
	for (const dir of [slug, "_default"]) {
		const file = join(source.signals, dir, `${source.arm}.md`);
		if (existsSync(file)) return readFileSync(file, "utf8").trim() || null;
	}
	return null;
}

/** Resolves when the turn has settled (pi's `agent_settled`), rejects after
 *  `ms`. Its own timer, cleared on every path, so a prompt that fails does not
 *  leave a wait holding the process open. */
function settled(client: RpcClient, ms: number): { done: Promise<void>; cancel: () => void } {
	let cancel = () => {};
	const done = new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000}s`)), ms);
		const off = client.onEvent((event) => {
			if ((event as { type: string }).type === "agent_settled") {
				cancel();
				resolve();
			}
		});
		cancel = () => {
			clearTimeout(timer);
			off();
		};
	});
	return { done, cancel };
}

/** A turn the provider refused, with its reason: nothing was answered. */
class ProviderRefused extends Error {}

/**
 * The system messages pi writes for this case's setup. pi declares its prompt
 * and tools only with a session's first request, so a throwaway request on an
 * empty session is what makes a case start as an app conversation does: with
 * the declaration ahead of its history (`rebuildEntries`). Only those messages
 * come back, re-chained, so the throwaway turn cannot lend the case its metadata.
 */
async function declaredPrompt(pi: ReturnType<typeof userPi>, cwd: string, scratch: string, sid: string, model: string, promptFile: string | null, draw: DrawMode): Promise<SessionEntry[]> {
	const session = join(scratch, `session_${sid}-declare.jsonl`);
	writeFileSync(session, `${JSON.stringify({ type: "session", version: 3, id: `${sid}-declare`, timestamp: new Date().toISOString(), cwd })}\n`);
	const { provider, id } = splitModel(model);
	const client = new RpcClient({
		cliPath: pi.cli,
		cwd,
		env: { PI_MANAGED_INSTALL_ROOT: pi.installRoot, PIARY_DRAW: draw },
		provider,
		model: id,
		args: ["--session", session, "--extension", PACKAGE, ...(promptFile ? ["--append-system-prompt", promptFile] : [])],
	});
	const wait = settled(client, TURN_TIMEOUT_MS);
	try {
		await client.start();
		await client.prompt("Reply with the single word ok.");
		await wait.done;
		// A credential the provider will not take fails here first, before the case is asked.
		const refused = refusalOf(turnOf(await client.getMessages()));
		if (refused) throw new ProviderRefused(refused);
		const { entries } = await client.getEntries();
		let parentId: string | null = null;
		return entries.flatMap((entry) => {
			if (entry.type !== "message" || entry.message.role !== ("system" as string)) return [];
			const chained = { ...entry, parentId } as SessionEntry;
			parentId = entry.id;
			return [chained];
		});
	} finally {
		wait.cancel();
		wait.done.catch(() => {});
		await client.stop().catch(() => {});
	}
}

/** What a harness needs to ask one case of one model. */
interface Ask {
	source: Source;
	slug: string;
	model: string;
	promptFile: string | null;
	draw: DrawMode;
	pi: ReturnType<typeof userPi>;
	scratch: string;
	workspace: string;
	conversation: string;
	md: string;
	/** Where the prompt being answered ends in `md`. */
	answering: number;
	/** The conversation above the prompt, as the messages pi's history is rebuilt from, and as its text. */
	history: DocumentHistory;
	above: string;
	/** The prompt as sent, its `[now: …]` line on. */
	message: string;
}

/** What a harness heard back. */
interface Asked {
	turn: AgentMessage[];
	toolCalls: ToolCall[];
	error?: string;
	refused?: string;
	effort?: string;
}

/** The turn asked of the user's own pi over RPC, as the app asks it. */
async function viaPi({ source, slug, model, promptFile, draw, pi, scratch, workspace, md, answering, history, message }: Ask): Promise<Asked> {
	const sid = `eval-${slug}`.slice(0, 40);
	let n = 0;
	const declared = await declaredPrompt(pi, workspace, scratch, sid, model, promptFile, draw);
	const entries = rebuildEntries(declared, declared.at(-1)?.id ?? null, history, { now: () => new Date().toISOString(), newId: () => (++n).toString(16).padStart(8, "0") });
	const session = join(scratch, `session_${sid}.jsonl`);
	const header = { type: "session", version: 3, id: sid, timestamp: new Date().toISOString(), cwd: workspace };
	writeFileSync(session, [header, ...entries].map((e) => JSON.stringify(e)).join("\n") + "\n");

	const { provider, id } = splitModel(model);
	const page = new Page(md, source.acceptEdits === true, answering);
	const client = new RpcClient({
		cliPath: pi.cli,
		cwd: workspace,
		// `PIARY_VERDICTS` as the app sets it: the `cell` tool asks how its cell
		// ran, and the listener below answers.
		// `PIARY_DRAW` as the app sets it too, on every pi it starts.
		env: { PI_MANAGED_INSTALL_ROOT: pi.installRoot, PIARY_VERDICTS: "1", PIARY_DRAW: draw },
		provider,
		model: id,
		args: ["--session", session, "--extension", PACKAGE, ...(promptFile ? ["--append-system-prompt", promptFile] : []), ...(source.thinking ? ["--thinking", source.thinking] : [])],
	});
	client.onEvent((event) => {
		const reply = page.hear({ ...event });
		if (reply) answerDialog(client, reply);
	});

	let error: string | undefined;
	let refused: string | undefined;
	let effort: string | undefined;
	let turn: Awaited<ReturnType<RpcClient["getMessages"]>> = [];
	const wait = settled(client, TURN_TIMEOUT_MS);
	try {
		await client.start();
		effort = (await client.getState()).thinkingLevel;
		await client.prompt(message);
		await wait.done;
		turn = turnOf(await client.getMessages());
		refused = refusalOf(turn) ?? undefined;
		error = refused;
	} catch (e) {
		error = e instanceof Error ? e.message : String(e);
		if (/conflicts with/.test(client.getStderr())) error += ` — your pi settings already install ${PACKAGE}; the app would skip --extension here`;
	} finally {
		wait.cancel();
		wait.done.catch(() => {});
		await client.stop().catch(() => {});
	}

	return { turn, toolCalls: page.calls.calls, error, refused, effort };
}

/** The turn asked of `claude -p`, with the user's own pi serving its prompt and tools (`claude/host.ts`). */
async function viaClaude({ source, model, promptFile, draw, pi, scratch, workspace, conversation, answering, above, message }: Ask): Promise<Asked> {
	return askClaude({
		model: claudeModel(model),
		effort: claudeEffort(source.thinking),
		message: withHistory(above, message),
		host: { pi: pi.index, workspace, extension: PACKAGE, promptFile, conversation, answering, acceptEdits: source.acceptEdits === true },
		env: { PI_MANAGED_INSTALL_ROOT: pi.installRoot, PIARY_VERDICTS: "1", PIARY_DRAW: draw },
		scratch,
		timeoutMs: TURN_TIMEOUT_MS,
	});
}

/** One case, one model: a fresh workspace and session, one turn, the checks.
 *  Never throws: anything that goes wrong is a failed check of its outcome. */
async function runOne(source: Source, slug: string, model: string, promptFile: string | null, draw: DrawMode, pi: ReturnType<typeof userPi>, outDir: string, harness: Harness): Promise<Outcome> {
	const started = Date.now();
	const scratch = mkdtempSync(join(tmpdir(), `piary-eval-${slug}-`));
	// The checks read the answer as pi gave it; what is kept is scrubbed.
	const roots: Roots = { ...MACHINE, scratch };
	let spec: Case | undefined;
	try {
		const loaded = loadCase(source.cases, slug);
		spec = loaded.spec;
		const { md, dir } = loaded;
		const workspace = join(scratch, "workspace");
		mkdirSync(workspace);
		if (existsSync(join(dir, "workspace"))) cpSync(join(dir, "workspace"), workspace, { recursive: true });
		// The conversation lives outside the workspace, where the app keeps it
		// (`~/.pi/agent/docs/<cwd>/`), so a pi that edits its own document is seen.
		const docs = join(scratch, "docs");
		mkdirSync(docs);
		const conversation = join(docs, spec.file ?? `${slug}.md`);
		writeFileSync(conversation, md);

		const { segment, prompt, history } = target(md, spec.caret);
		const before = hashes(workspace);
		const signal = signalFor(source, slug);
		// A case whose prompt is empty sends the signal alone: a message nobody typed.
		const said = [prompt.trim(), signal].filter(Boolean).join("\n\n");
		if (!said) throw new Error("nothing to send: the prompt is empty and the arm has no signal");
		const message = withNow(said, nowLine(new Date(), EVAL_ZONE));
		const above = historyAbove(md, segment);
		const ask: Ask = { source, slug, model, promptFile, draw, pi, scratch, workspace, conversation, md, answering: segment.to, history, above, message };
		const { turn, toolCalls, error, refused, effort } = await (harness === "claude" ? viaClaude(ask) : viaPi(ask));
		const historyAsText = harness === "claude" && above.trim() !== "" ? true : undefined;

		const result = placeAnswer(md, segment, answerText(turn));
		const prose = answerProse(turn);
		const checks = runChecks(spec, {
			original: md,
			result,
			prose,
			toolCalls,
			before,
			after: hashes(workspace),
			conversationBefore: md,
			conversationAfter: existsSync(conversation) ? readFileSync(conversation, "utf8") : "",
		});
		if (error) checks.unshift({ check: "the turn completed", pass: false, detail: error });

		const modelDir = join(outDir, model.replaceAll("/", "__"));
		mkdirSync(modelDir, { recursive: true });
		writeFileSync(join(modelDir, `${slug}.md`), scrubPaths(result, roots));
		return scrubbed({ slug, model, job: spec.job, title: spec.title, tags: spec.tags, checks, toolCalls, prose, error, refused, effort, historyAsText, ms: Date.now() - started }, roots);
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		const checks = [{ check: "the case ran", pass: false, detail: error }];
		const refused = e instanceof ProviderRefused ? error : undefined;
		return scrubbed({ slug, model, job: spec?.job ?? "explain", title: spec?.title ?? slug, tags: spec?.tags ?? [], checks, toolCalls: [], prose: "", error, refused, ms: Date.now() - started }, roots);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/**
 * Writes an `extension_ui_response` on pi's stdin. `RpcClient` has no method
 * for it, and its own `send` waits for a reply rpc-mode never makes to this
 * line, so the child's stdin is reached through the client's private field.
 */
function answerDialog(client: RpcClient, reply: Record<string, unknown>): void {
	const child = client["process"] as ChildProcess | null;
	child?.stdin?.write(`${JSON.stringify(reply)}\n`);
}

/** `provider/id`, where the id may itself hold slashes. */
function splitModel(model: string): { provider: string; id: string } {
	const at = model.indexOf("/");
	if (at <= 0 || at === model.length - 1) throw new Error(`--model must be provider/id, got "${model}"`);
	return { provider: model.slice(0, at), id: model.slice(at + 1) };
}

/** Runs `work` over `items`, at most `jobs` at a time, keeping their order. */
async function pool<T, R>(items: readonly T[], jobs: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const lane = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await work(items[i]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane));
	return out;
}

const passed = (o: Outcome) => o.checks.every((c) => c.pass);

/** The report a person reads: a score per job per model, then every failure. */
function markdown(outcomes: readonly Outcome[], meta: Record<string, string>, regressions: { shared: number; lost: readonly string[] } | null): string {
	const models = [...new Set(outcomes.map((o) => o.model))];
	const jobs = [...new Set(outcomes.map((o) => o.job))].sort();
	const lines = ["# Eval report", "", ...Object.entries(meta).map(([k, v]) => `- **${k}:** ${v}`), "", ...refusedSection(outcomes)];
	lines.push(`| Job | ${models.join(" | ")} |`, `| --- | ${models.map(() => "---").join(" | ")} |`);
	for (const job of [...jobs, "all"]) {
		const cells = models.map((model) => {
			const mine = outcomes.filter((o) => o.model === model && (job === "all" || o.job === job));
			const checks = mine.flatMap((o) => o.checks);
			return `${mine.filter(passed).length}/${mine.length} cases · ${checks.filter((c) => c.pass).length}/${checks.length} checks`;
		});
		lines.push(`| ${job === "all" ? "**all**" : job} | ${cells.join(" | ")} |`);
	}
	if (regressions) {
		lines.push("", "## Regressions against the compared report", "");
		if (regressions.shared === 0) lines.push("Nothing to compare: the two runs share no case, model and check.");
		else if (regressions.lost.length) lines.push(...regressions.lost.map((r) => `- ${r}`));
		else lines.push(`None: of ${regressions.shared} checks the two runs share, none that passed before fails now.`);
	}
	lines.push("", "## Failing checks", "");
	const failing = outcomes.filter((o) => !passed(o));
	if (failing.length === 0) lines.push("None.");
	for (const o of failing) {
		lines.push(`### ${o.slug} — ${o.model}${o.tags.includes("known gap") ? " (known gap)" : ""}${o.historyAsText ? " (history as text)" : ""}`, "", `${o.title}`, "");
		for (const c of o.checks.filter((c) => !c.pass)) lines.push(`- **${c.check}:** ${c.detail}`);
		lines.push(`- tools called: ${o.toolCalls.map((t) => t.name).join(", ") || "none"}`, "");
	}
	return lines.join("\n") + "\n";
}

/** Every (case, model, check) that passed in `old` and fails in `now`, and how
 *  many checks the two runs share — none shared means nothing was compared,
 *  which the report says rather than reading as "no regressions". */
function regressionsOf(old: readonly Outcome[], now: readonly Outcome[]): { shared: number; lost: string[] } {
	const key = (o: Outcome, check: string) => `${o.slug} · ${o.model} · ${check}`;
	const was = new Map(old.flatMap((o) => o.checks.map((c) => [key(o, c.check), c.pass] as const)));
	const shared = now.flatMap((o) => o.checks.filter((c) => was.has(key(o, c.check)))).length;
	const lost = now.flatMap((o) => o.checks.filter((c) => !c.pass && was.get(key(o, c.check)) === true).map((c) => `${key(o, c.check)}: ${c.detail}`));
	return { shared, lost };
}

async function main() {
	const { values } = parseArgs({
		options: {
			model: { type: "string", multiple: true },
			prompt: { type: "string" },
			"no-prompt": { type: "boolean" },
			case: { type: "string", multiple: true },
			out: { type: "string" },
			compare: { type: "string" },
			jobs: { type: "string" },
			draw: { type: "string" },
			cases: { type: "string" },
			signals: { type: "string" },
			signal: { type: "string" },
			thinking: { type: "string" },
			"accept-edits": { type: "boolean" },
			harness: { type: "string" },
		},
	});
	const harness = HARNESSES.find((known) => known === (values.harness ?? "pi"));
	if (!harness) throw new Error(`--harness must be one of ${HARNESSES.join(", ")}, got "${values.harness}"`);
	const models = values.model?.length ? values.model : harness === "claude" ? CLAUDE_MODELS : DEFAULT_MODELS;
	for (const model of models) splitModel(model);
	if (harness === "claude") {
		for (const model of models) claudeModel(model);
		claudeEffort(values.thinking);
	}
	// Read before a turn is spent: two harnesses ask a case differently, so their checks are not compared.
	const older = values.compare ? (JSON.parse(readFileSync(values.compare, "utf8")) as { meta?: { harness?: string }; outcomes: Outcome[] }) : null;
	const olderHarness = older?.meta?.harness ?? "pi";
	if (older && olderHarness !== harness) throw new Error(`--compare names a report of the ${olderHarness} harness, and this run is the ${harness} harness`);
	// Absolute: pi runs in each case's workspace and reads the value as a file
	// only if that path exists there; anything else it appends as prompt text.
	const promptFile = values["no-prompt"] ? null : resolve(values.prompt ?? PROMPT);
	if (promptFile && !existsSync(promptFile)) throw new Error(`no prompt file at ${promptFile}`);
	const jobs = Number(values.jobs ?? DEFAULT_JOBS);
	if (!Number.isInteger(jobs) || jobs < 1) throw new Error(`--jobs must be a whole number of at least 1, got "${values.jobs}"`);
	if (values.draw !== undefined && values.draw !== "a2ui" && values.draw !== "free") throw new Error(`--draw must be a2ui or free, got "${values.draw}"`);
	const draw = drawMode(values.draw);
	if ((values.signals === undefined) !== (values.signal === undefined)) throw new Error("--signals and --signal go together");
	const source: Source = { cases: resolve(values.cases ?? CASES), signals: values.signals && resolve(values.signals), arm: values.signal, thinking: values.thinking, acceptEdits: values["accept-edits"] };
	const all = values.case?.length ? values.case : readdirSync(source.cases).filter((s) => statSync(join(source.cases, s)).isDirectory()).sort();
	// Left out, never scored: a case this harness answers differently for a reason that is not the prompt's.
	const leftOut = harness === "claude" ? all.filter((slug) => loadCase(source.cases, slug).spec.tags.includes(NEEDS_PI_TAG)) : [];
	const slugs = all.filter((slug) => !leftOut.includes(slug));
	const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const outDir = values.out ?? join(REPO, "evals/reports", `${stamp}-${promptFile ? "prompt" : "default"}`);
	const pi = userPi();
	mkdirSync(outDir, { recursive: true });

	const runs = slugs.flatMap((slug) => models.map((model) => ({ slug, model })));
	process.stdout.write(`pi ${pi.version} · ${harness} harness · ${slugs.length} cases × ${models.length} models · ${promptFile ? `prompt ${relative(REPO, promptFile)}` : "pi's default prompt"} · draw ${draw}\n`);
	if (leftOut.length) process.stdout.write(`left out, a pi run scores them (tag "${NEEDS_PI_TAG}"): ${leftOut.join(", ")}\n`);
	const outcomes = await pool(runs, jobs, async ({ slug, model }) => {
		const outcome = await runOne(source, slug, model, promptFile, draw, pi, outDir, harness);
		const refused = outcome.refused === undefined ? "" : `  refused: ${outcome.refused}`;
		process.stdout.write(`${passed(outcome) ? "pass" : "FAIL"}  ${model}  ${slug}  (${Math.round(outcome.ms / 1000)}s)${refused}\n`);
		return outcome;
	});

	const meta = {
		date: new Date().toISOString(),
		pi: pi.version,
		harness,
		...(leftOut.length ? { "left out (needs pi)": leftOut.join(", ") } : {}),
		prompt: promptFile ? relative(REPO, promptFile) : "none (pi's default)",
		draw,
		...(source.arm ? { signal: source.arm } : {}),
		...(source.thinking ? { thinking: source.thinking } : {}),
		models: models.join(", "),
		cases: String(slugs.length),
	};
	const regressions = older ? regressionsOf(older.outcomes, outcomes) : null;
	writeFileSync(join(outDir, "report.json"), JSON.stringify({ meta, outcomes }, null, "\t") + "\n");
	writeFileSync(join(outDir, "report.md"), markdown(outcomes, meta, regressions));
	process.stdout.write(`\n${outcomes.filter(passed).length}/${outcomes.length} passed · ${relative(REPO, join(outDir, "report.md"))}\n`);
	// A refused turn is no answer, so the run did not measure what it was asked to: it fails, whatever the score.
	const refused = refusedLines(outcomes);
	if (refused.length) {
		process.stderr.write(`\nREFUSED BY THE PROVIDER: these turns were never answered, and the score above counts them as failures.\n${refused.map((l) => `  ${l.replaceAll("**", "")}`).join("\n")}\n`);
		process.exitCode = 1;
	}
}

await main();
