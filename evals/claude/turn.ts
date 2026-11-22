// One eval turn asked through `claude -p`: Claude Code is the model and its
// loop, on the account it is signed in to, and the user's own pi is the prompt
// and the tools (`host.ts`). The I/O half of the harness; what is said and
// what is read back is `wire.ts`.
import { execFile, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "../checks.ts";
import { type DescribedTool, HOST_ENV, type HostConfig, SERVER, mcpName, misrun, readStream, settingsEffort, claudePrompt } from "./wire.ts";

const HOST = join(import.meta.dirname, "host.ts");

/** A credential in the environment would be used instead of the account `claude`
 *  is signed in to, so none reaches it. */
const CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"];

/** How long pi may take to start and say what it hosts. */
const DESCRIBE_TIMEOUT_MS = 60_000;

export interface ClaudeAsk {
	/** The model id `claude --model` takes. */
	model: string;
	/** The effort the run names; undefined takes the user's pi settings' (`settingsEffort`). */
	effort: string | undefined;
	message: string;
	host: HostConfig;
	/** The environment Piary's tools read, as the app sets it on its pi. */
	env: Record<string, string>;
	/** The case's scratch directory: the files this turn needs are written under it. */
	scratch: string;
	timeoutMs: number;
}

export interface ClaudeAnswer {
	turn: AgentMessage[];
	toolCalls: ToolCall[];
	/** The effort `claude` was started at. */
	effort?: string;
	error?: string;
	refused?: string;
}

/** The environment the host starts in: this process's, the case's on top. A
 *  server Claude Code starts gets little of its own, so it is all said here. */
function hostEnv(ask: ClaudeAsk): Record<string, string> {
	const own = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
	return { ...own, ...ask.env, [HOST_ENV]: JSON.stringify(ask.host) };
}

export async function askClaude(ask: ClaudeAsk): Promise<ClaudeAnswer> {
	const env = hostEnv(ask);
	const described = await promisify(execFile)(process.execPath, [HOST, "describe"], { env, cwd: ask.host.workspace, timeout: DESCRIBE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
	const host = JSON.parse(described.stdout) as { systemPrompt: string; tools: DescribedTool[]; thinking?: string };
	const tools = host.tools.map((tool) => tool.name);
	const effort = ask.effort ?? settingsEffort(host.thinking);

	// Claude Code stands in an empty directory: the workspace is pi's, and a
	// CLAUDE.md there is already in the prompt pi wrote.
	const cwd = join(ask.scratch, "claude");
	mkdirSync(cwd);
	const promptFile = join(ask.scratch, "system-prompt.txt");
	writeFileSync(promptFile, claudePrompt(host.systemPrompt, host.tools));
	const mcp = join(ask.scratch, "mcp.json");
	writeFileSync(mcp, JSON.stringify({ mcpServers: { [SERVER]: { command: process.execPath, args: [HOST], env } } }));

	const args = [
		"-p",
		...["--model", ask.model],
		...["--effort", effort],
		...["--system-prompt-file", promptFile],
		// No tool of Claude Code's own: the model gets pi's, and only pi's.
		...["--tools", ""],
		...["--mcp-config", mcp, "--strict-mcp-config"],
		...["--allowedTools", tools.map(mcpName).join(",")],
		...["--setting-sources", "project", "--permission-mode", "dontAsk", "--no-session-persistence"],
		...["--output-format", "stream-json", "--verbose"],
	];
	const own = Object.fromEntries(Object.entries(process.env).filter(([name]) => !CREDENTIALS.includes(name)));
	const child = spawn("claude", args, { cwd, env: own, stdio: ["pipe", "pipe", "pipe"] });
	let out = "";
	let err = "";
	child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
	child.stdin.end(ask.message);
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGKILL");
	}, ask.timeoutMs);
	const started = await new Promise<Error | null>((resolve) => {
		child.on("error", resolve);
		child.on("close", () => resolve(null));
	});
	clearTimeout(timer);

	const read = readStream(out.split("\n"));
	const base = { turn: read.messages, toolCalls: read.toolCalls, effort };
	if (started) return { ...base, error: `claude did not start: ${started.message}` };
	if (timedOut) return { ...base, error: `no answer within ${ask.timeoutMs / 1000}s` };
	const wrong = misrun(read, tools);
	if (wrong?.error && err.trim()) wrong.error += ` (${err.trim().split("\n").at(-1)})`;
	return { ...base, ...wrong };
}
