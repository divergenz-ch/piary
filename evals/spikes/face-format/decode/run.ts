// Face-format experiment harness, not a test. Asks each model to transcribe a face block as
// structured data, for every format and legend, through the user's own pi with Piary's prompt,
// and records the answer and the turn's input tokens. Scoring is score.ts: no judge.
// Usage: node evals/spikes/face-format/decode/run.ts [--jobs n]        (resumes: skips what is there)
// HARNESS=claude asks through `claude -p` instead (Piary's prompt as the whole system prompt, no
// tools), into decode-claude/: the same question when pi's provider is out of reach.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { CODES, type Format, serialize, type Timeline } from "../timeline.ts";
import { LEGENDS } from "./legend.ts";

const HERE = import.meta.dirname;
const REPO = join(HERE, "../../../..");
const OUT = process.env.FACE_OUT ?? join(REPO, "recordings/face-format");
const MODELS = (process.env.MODELS ?? "claude-haiku-5-5 claude-sonnet-5-5 claude-opus-5-5").split(" ");
const TURN_TIMEOUT_MS = 3 * 60_000;
const REPS = Number(process.env.REPS ?? 3);
/** Failed turns in a row after which the run stops: a provider that has stopped answering. */
const FAILURE_STREAK = 5;
/** `ONLY=tokens` runs the cost turns alone. */
const ONLY = process.env.ONLY;
const items = JSON.parse(readFileSync(join(HERE, "items.json"), "utf8")) as { id: string; message: string; timeline: Timeline }[];

const QUESTION = `---
This is a test of how you read the bracketed face block above, not a request to act on the message. Do not answer the message. Transcribe the block as one JSON object and reply with only that object:

{"entries":[{"phase":"reading"|"typing"|"pause"|"deleted","at":<seconds after the answer appeared, reading only>,"text":<typing: the full text that was being typed, exactly as the message has it; pause: the last word before the caret; deleted: the deleted text>,"occurrence":<typing only: 1 if the text is its first occurrence in the message, 2 if its second>,"pause":<seconds, pause only>,"steps":[{"movements":[<names>],"intensities":[<one per movement>],"seconds":<number>}]}]}

Entries in the block's order. Movement names must come from this list: ${Object.values(CODES).map((c) => c.words).join("; ")}. Intensities must come from: trace; slight; marked; severe; maximum.`;

function pi(): { cli: string; root: string } {
	const root = join(homedir(), ".pi/agent/install");
	const version = readFileSync(join(root, "current-version"), "utf8").trim();
	return { cli: join(root, "releases", version, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"), root };
}

async function ask(model: string, promptFile: string, message: string): Promise<{ text: string; tokens: number; effort: string }> {
	const { cli, root } = pi();
	const client = new RpcClient({
		cliPath: cli,
		cwd: mkdtempSync(join(tmpdir(), "face-decode-")),
		env: { PI_MANAGED_INSTALL_ROOT: root },
		provider: "anthropic",
		model,
		args: ["--no-session", "--thinking", "off", "--extension", join(REPO, "pi-extension"), "--append-system-prompt", promptFile],
	});
	let timer: NodeJS.Timeout | undefined;
	try {
		await client.start();
		const effort = (await client.getState()).thinkingLevel;
		const done = new Promise<void>((resolve, reject) => {
			timer = setTimeout(() => reject(new Error("no answer in time")), TURN_TIMEOUT_MS);
			client.onEvent((e) => {
				if ((e as { type: string }).type === "agent_settled") resolve();
			});
		});
		await client.prompt(message);
		await done;
		const messages = (await client.getMessages()) as { role: string; content?: { type: string; text?: string }[]; usage?: { input: number; cacheRead: number; cacheWrite: number } }[];
		const refused = (messages as { errorMessage?: string }[]).find((m) => m.errorMessage)?.errorMessage;
		if (refused) throw new Error(refused);
		const last = messages.filter((m) => m.role === "assistant").at(-1);
		// The first request's input is the system prompt, the tools and this one message.
		const usage = messages.find((m) => m.role === "assistant")?.usage;
		// A provider that refused the request leaves no usage: a failed turn, not an empty answer.
		if (!usage || !(usage.input + usage.cacheRead + usage.cacheWrite > 0)) throw new Error("the provider gave no reply");
		return { text: (last?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join(""), tokens: usage ? usage.input + usage.cacheRead + usage.cacheWrite : NaN, effort };
	} finally {
		clearTimeout(timer);
		await client.stop().catch(() => {});
	}
}

/** The same turn through `claude -p`, isolated as the judge is: an empty directory and no user
 *  settings, so nothing of this machine's Claude Code reaches the answer. */
function askClaude(model: string, promptFile: string, message: string): Promise<{ text: string; tokens: number; effort: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn("claude", ["-p", "--model", model, "--system-prompt", readFileSync(promptFile, "utf8"), "--tools", "", "--setting-sources", "project", "--permission-mode", "dontAsk", "--output-format", "json"], { cwd: mkdtempSync(join(tmpdir(), "face-decode-")), stdio: ["pipe", "pipe", "pipe"] });
		let out = "";
		let err = "";
		child.stdout.on("data", (d) => (out += d));
		child.stderr.on("data", (d) => (err += d));
		const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
		child.on("close", () => {
			clearTimeout(timer);
			try {
				const reply = JSON.parse(out) as { is_error: boolean; result: string; usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens_details?: { thinking_tokens?: number } }; modelUsage: Record<string, unknown> };
				if (reply.is_error) throw new Error(reply.result);
				if (!Object.keys(reply.modelUsage).includes(model)) throw new Error(`answered by ${Object.keys(reply.modelUsage).join(", ")}`);
				resolve({ text: reply.result, tokens: reply.usage.input_tokens + reply.usage.cache_creation_input_tokens + reply.usage.cache_read_input_tokens, effort: reply.usage.output_tokens_details?.thinking_tokens ? "thinking" : "no thinking" });
			} catch (e) {
				reject(new Error(`${e instanceof Error ? e.message : String(e)} ${(err || out).slice(0, 300)}`));
			}
		});
		child.stdin.end(message);
	});
}

const CLAUDE = process.env.HARNESS === "claude";
const jobs = Number(process.argv.includes("--jobs") ? process.argv[process.argv.indexOf("--jobs") + 1] : 6);
const dir = join(OUT, CLAUDE ? "decode-claude" : "decode");
mkdirSync(join(dir, "prompts"), { recursive: true });
const base = readFileSync(join(REPO, "pi-extension/system-prompt.md"), "utf8");
const work: { key: string; model: string; promptFile: string; message: string; meta: Record<string, string> }[] = [];
const TOKENS = "Reply with the single word ok.";
for (const model of MODELS) {
	for (const item of items) {
		// What a block costs: the same short turn with and without it, under one system prompt.
		const plain = join(dir, "prompts", "plain.md");
		writeFileSync(plain, base);
		work.push({ key: `tokens.${model}.${item.id}.baseline`, model, promptFile: plain, message: `${item.message}\n\n${TOKENS}`, meta: { kind: "tokens", model, item: item.id, format: "baseline", legend: "none" } });
		for (const format of Object.keys(LEGENDS)) work.push({ key: `tokens.${model}.${item.id}.${format}`, model, promptFile: plain, message: `${item.message}\n\n${serialize(format as Format, item.timeline, item.message)}\n\n${TOKENS}`, meta: { kind: "tokens", model, item: item.id, format, legend: "none" } });
		for (const [format, legends] of Object.entries(LEGENDS)) {
			for (const [legend, text] of Object.entries(legends)) {
				const promptFile = join(dir, "prompts", `${format}-${legend}.md`);
				writeFileSync(promptFile, base + text);
				// What a legend costs, once per turn: the baseline turn under that system prompt.
				if (item === items[0] && text) work.push({ key: `tokens.${model}.legend.${format}-${legend}`, model, promptFile, message: `${item.message}\n\n${TOKENS}`, meta: { kind: "legend", model, item: item.id, format, legend } });
				for (let rep = 1; rep <= REPS; rep++) work.push({ key: `${model}.${item.id}.${format}.${legend}.r${rep}`, model, promptFile, message: `${item.message}\n\n${serialize(format as Format, item.timeline, item.message)}\n\n${QUESTION}`, meta: { kind: "decode", model, item: item.id, format, legend, rep: String(rep) } });
			}
		}
	}
}
const todo = work.filter((w) => !existsSync(join(dir, `${w.key}.json`)) && (!ONLY || w.meta.kind === ONLY));
let next = 0;
let failed = 0;
let streak = 0;
await Promise.all(
	Array.from({ length: jobs }, async () => {
		while (next < todo.length && streak < FAILURE_STREAK) {
			const w = todo[next++]!;
			try {
				const answer = await (CLAUDE ? askClaude : ask)(w.model, w.promptFile, w.message);
				writeFileSync(join(dir, `${w.key}.json`), JSON.stringify({ ...w.meta, ...answer }, null, 1));
				streak = 0;
			} catch (e) {
				failed++;
				streak++;
				process.stdout.write(`FAIL ${w.key}: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}\n`);
			}
		}
	}),
);
if (streak >= FAILURE_STREAK) process.stdout.write(`stopped: ${FAILURE_STREAK} turns failed in a row\n`);
process.stdout.write(`${work.length} turns, ${todo.length} to run, ${failed} failed\n`);
if (streak >= FAILURE_STREAK) process.exit(1);
