// The user's own pi with no model behind it: its system prompt and its tools,
// Piary's extension loaded as the app loads it, served to `claude -p` over the
// Model Context Protocol on stdio (evals/README.md §The claude harness). Claude
// Code runs the model and its loop; every tool call lands here and runs in pi's
// own code, with the eval's page stand-in answering what a tool asks the page
// (`page.ts`).
//
//   node evals/claude/host.ts describe   prints pi's prompt, tools and default effort, and exits
//   node evals/claude/host.ts            serves until its stdin closes
//
// One process per case, started in the case's workspace: pi's tools run where
// the process stands, and Piary's read the draw mode and the verdict channel
// from its environment when they register. What to host comes in `PIARY_EVAL_HOST`.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { Page } from "../page.ts";
import { type McpResult, type McpTool, answer } from "./mcp.ts";
import { HOST_ENV, type HostConfig, SERVER } from "./wire.ts";

// stdout is the protocol's: whatever pi or an extension logs goes to stderr.
console.log = console.error;
console.info = console.error;

const config = JSON.parse(process.env[HOST_ENV] ?? "null") as HostConfig | null;
if (!config) throw new Error(`${HOST_ENV} is not set`);
process.chdir(config.workspace);

const pi = (await import(pathToFileURL(config.pi).href)) as typeof import("@earendil-works/pi-coding-agent");
const agentDir = pi.getAgentDir();
const settingsManager = pi.SettingsManager.create(config.workspace, agentDir);
const resourceLoader = new pi.DefaultResourceLoader({
	cwd: config.workspace,
	agentDir,
	settingsManager,
	additionalExtensionPaths: [config.extension],
	appendSystemPrompt: config.promptFile ? [config.promptFile] : [],
});
await resourceLoader.reload();
const { session } = await pi.createAgentSession({ cwd: config.workspace, resourceLoader, settingsManager, sessionManager: pi.SessionManager.inMemory() });

const page = new Page(readFileSync(config.conversation, "utf8"), config.acceptEdits);
let asked = 0;
// The page a tool reaches through pi's dialogs. `input` is the one that carries
// an answer back, as in rpc mode; everything else a tool might draw is nothing here.
const ui = new Proxy({} as NonNullable<Parameters<typeof session.bindExtensions>[0]["uiContext"]>, {
	get(_, key) {
		if (key === "input") {
			return async (title: string, placeholder?: string) => {
				const reply = page.hear({ type: "extension_ui_request", id: `ask-${++asked}`, method: "input", title, placeholder });
				return typeof reply?.["value"] === "string" ? reply["value"] : undefined;
			};
		}
		return () => undefined;
	},
});
await session.bindExtensions({ uiContext: ui });

const tools = session.agent.state.tools;
const listed: McpTool[] = tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters }));

if (process.argv[2] === "describe") {
	const described = tools.map((tool) => ({ name: tool.name, description: tool.description }));
	process.stdout.write(`${JSON.stringify({ systemPrompt: session.systemPrompt, tools: described, thinking: settingsManager.getDefaultThinkingLevel() })}\n`);
	process.exit(0);
}

/** One call, run as pi's loop runs it: the model's own call id, the tool's own argument preparation. */
async function call(name: string, args: Record<string, unknown>, toolUseId: string | undefined): Promise<McpResult> {
	const failed = (text: string): McpResult => ({ content: [{ type: "text", text }], isError: true });
	// A cell is addressed by its call's id (`shortCellId`): without the model's
	// own, the id the tool says and the id the document writes would differ.
	if (!toolUseId) return failed("the client sent no tool-use id, so this call cannot be tied to the model's");
	const tool = tools.find((known) => known.name === name);
	if (!tool) return failed(`no tool named ${name}`);
	page.hear({ type: "tool_execution_start", toolName: name, toolCallId: toolUseId, args });
	try {
		const result = await tool.execute(toolUseId, tool.prepareArguments ? tool.prepareArguments(args) : args);
		const isError = (result as { isError?: unknown }).isError === true;
		page.hear({ type: "tool_execution_end", toolCallId: toolUseId, isError });
		return { content: result.content, isError };
	} catch (e) {
		page.hear({ type: "tool_execution_end", toolCallId: toolUseId, isError: true });
		return failed(e instanceof Error ? e.message : String(e));
	}
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
	if (!line.trim()) return;
	void answer(JSON.parse(line), SERVER, listed, call).then((reply) => {
		if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
	});
});
lines.on("close", () => process.exit(0));
