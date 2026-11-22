// What the eval says to `claude -p` and what it reads back, for the harness
// where Claude Code runs the model and the user's own pi serves the prompt and
// the tools (`host.ts`, evals/README.md §The claude harness). Pure: `turn.ts`
// does the spawning.
//
// The turn comes back in pi's own message shapes with pi's tool names, so the
// placing and the checks a pi run uses read it unchanged.
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ToolCall } from "../checks.ts";

/** The MCP server's name. Claude Code shows the model each tool as `mcp__<server>__<tool>`. */
export const SERVER = "pi";
const PREFIX = `mcp__${SERVER}__`;

/** A pi tool's name as Claude Code lists it, and back. */
export const mcpName = (tool: string): string => `${PREFIX}${tool}`;
export const piName = (listed: string): string => (listed.startsWith(PREFIX) ? listed.slice(PREFIX.length) : listed);

/** What the runner asks the host process to host (`host.ts`). */
export interface HostConfig {
	/** The `dist/index.js` of the pi to host: the user's own (ADR 0004). */
	pi: string;
	workspace: string;
	/** Piary's pi package, passed as `--extension` is. */
	extension: string;
	/** The file appended to pi's prompt, or null for pi's prompt alone. */
	promptFile: string | null;
	/** The case's conversation, which a `canvas_edit` is planned against. */
	conversation: string;
	/** Where the prompt being answered ends in it. */
	answering: number;
	acceptEdits: boolean;
}

/** The variable `HostConfig` arrives in, as JSON. */
export const HOST_ENV = "PIARY_EVAL_HOST";

/** The provider this harness answers for: the `claude` CLI talks to no other. */
const PROVIDER = "anthropic";

/** The model id `claude --model` takes, from the eval's `provider/id`. */
export function claudeModel(model: string): string {
	const at = model.indexOf("/");
	if (model.slice(0, at) !== PROVIDER) throw new Error(`--harness claude runs ${PROVIDER}/… models only, got "${model}"`);
	return model.slice(at + 1);
}

/** The efforts `claude --effort` takes. pi's `off` and `minimal` have no counterpart. */
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/** `--thinking` as `claude --effort` takes it; undefined when the run names none. */
export function claudeEffort(thinking: string | undefined): string | undefined {
	if (thinking === undefined) return undefined;
	if (!EFFORTS.includes(thinking)) throw new Error(`--harness claude takes --thinking ${EFFORTS.join(", ")}, got "${thinking}"`);
	return thinking;
}

/** The effort for a run that names none: the one the user's pi settings start a
 *  session at, as in a pi run, or the lowest `claude` takes when pi's is lower
 *  still (`off`, `minimal`) or unset. */
export function settingsEffort(piDefault: string | undefined): string {
	return piDefault !== undefined && EFFORTS.includes(piDefault) ? piDefault : EFFORTS[0];
}

/** A tool as pi describes it. */
export interface DescribedTool {
	name: string;
	description: string;
}

/** Claude Code cuts a tool's description in its tool list at 2048 characters and
 *  marks it truncated; this is kept under that. */
const LISTED_DESCRIPTION_MAX = 2000;

/**
 * pi's system prompt as `claude -p` is given it: pi's text, word for word, then
 * the two things Claude Code's tool list gets wrong about pi's tools.
 *
 * Their names: pi's prompt, Piary's and the skill all say `read`, `cell`, `view`,
 * and Claude Code lists each as `mcp__pi__<name>`. Left unsaid, the model does
 * not take "read the skill before calling `cell`" as naming a tool it has.
 *
 * Their descriptions: one past the cut is given whole. The `view` tool teaches
 * a2ui in its description (ADR 0043), far past it, and a model that reads half
 * draws with cells instead.
 */
export function claudePrompt(systemPrompt: string, tools: readonly DescribedTool[]): string {
	const names = `In this session each tool named above is listed with the prefix \`${PREFIX}\`: \`${tools.map((tool) => tool.name).join("`, `")}\`. Wherever a tool is named without it, that tool is meant.`;
	const long = tools.filter((tool) => tool.description.length > LISTED_DESCRIPTION_MAX);
	const sections = long.map((tool) => `<tool_description name="${mcpName(tool.name)}">\n${tool.description}\n</tool_description>`);
	const whole = long.length ? ["", "The tool list cuts these tools' descriptions short. Each is given whole here, and this is the one to follow:", "", ...sections] : [];
	return [systemPrompt.trimEnd(), "", names, ...whole].join("\n") + "\n";
}

/**
 * The message for a case whose prompt has a conversation above it. pi is handed
 * that history as the messages it was (`rebuildEntries`); `claude -p` takes one
 * message and no past, so the history goes in as the document's own text. The
 * model reads its earlier cells and views as markers, not as calls it made:
 * the one place this harness asks a different question than the app does.
 */
export function withHistory(above: string, message: string): string {
	const document = above.trim();
	if (!document) return message;
	return [
		"This conversation so far, as its document holds it. Your earlier answers, cells and views are in it as you wrote them.",
		"",
		"<document>",
		document,
		"</document>",
		"",
		"The message to answer now:",
		"",
		message,
	].join("\n");
}

/** One turn of `claude -p`, read from its `stream-json` lines. */
export interface ClaudeTurn {
	/** The turn in pi's shapes: assistant messages and tool results, in order. */
	messages: AgentMessage[];
	toolCalls: ToolCall[];
	/** The tools Claude Code offered the model, by the names it listed; null when it never said. */
	tools: string[] | null;
	/** Where Claude Code took its credential from: `none` is the account it is signed in to. */
	apiKeySource: string | null;
	/** The request was charged to extra usage instead of the plan's limits. */
	overage: boolean;
	/** Why the provider would not answer, when it would not. */
	refused: string | null;
	/** Why the turn ended without a result, when it did for any other reason. */
	error: string | null;
}

interface Block {
	type: string;
	text?: string;
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	tool_use_id?: string;
	content?: unknown;
	is_error?: boolean;
}

const textParts = (content: unknown): { type: "text"; text: string }[] => {
	if (typeof content === "string") return [{ type: "text", text: content }];
	if (!Array.isArray(content)) return [];
	return (content as Block[]).flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [{ type: "text" as const, text: part.text }] : []));
};

/** Provider metadata the checks never read, in the shape pi's messages carry. */
const meta = (model: string) => ({
	api: "",
	provider: PROVIDER,
	model,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason: "stop" as const,
	timestamp: 0,
});

/** Reads a whole run's output. A line that is not JSON is skipped: Claude Code's own warnings share the stream. */
export function readStream(lines: readonly string[]): ClaudeTurn {
	const turn: ClaudeTurn = { messages: [], toolCalls: [], tools: null, apiKeySource: null, overage: false, refused: null, error: null };
	// Claude Code sends an assistant message one content block at a time, each under the message's id.
	let open: { id: unknown; content: unknown[] } | null = null;
	const calls = new Map<string, ToolCall>();
	let ended = false;
	for (const line of lines) {
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		const message = event["message"] as { id?: unknown; model?: unknown; content?: unknown } | undefined;
		if (event["type"] === "system" && event["subtype"] === "init") {
			turn.tools = Array.isArray(event["tools"]) ? (event["tools"] as string[]) : null;
			turn.apiKeySource = typeof event["apiKeySource"] === "string" ? event["apiKeySource"] : null;
		} else if (event["type"] === "assistant" && Array.isArray(message?.content)) {
			if (!open || open.id !== message.id) {
				open = { id: message.id, content: [] };
				turn.messages.push({ role: "assistant", content: open.content, ...meta(String(message.model ?? "")) } as unknown as AgentMessage);
			}
			for (const block of message.content as Block[]) {
				if (block.type === "text" && block.text) open.content.push({ type: "text", text: block.text });
				if (block.type !== "tool_use" || typeof block.id !== "string" || typeof block.name !== "string") continue;
				const call: ToolCall = { name: piName(block.name), args: block.input ?? {} };
				calls.set(block.id, call);
				turn.toolCalls.push(call);
				open.content.push({ type: "toolCall", id: block.id, name: call.name, arguments: call.args });
			}
		} else if (event["type"] === "user" && Array.isArray(message?.content)) {
			open = null;
			for (const block of message.content as Block[]) {
				if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
				const call = calls.get(block.tool_use_id);
				if (call) call.failed = block.is_error === true;
				turn.messages.push({ role: "toolResult", toolCallId: block.tool_use_id, toolName: call?.name ?? "", content: textParts(block.content), isError: block.is_error === true, timestamp: 0 } as unknown as AgentMessage);
			}
		} else if (event["type"] === "rate_limit_event") {
			const info = (event["rate_limit_info"] ?? {}) as { status?: unknown; isUsingOverage?: unknown; rateLimitType?: unknown };
			if (info.isUsingOverage === true) turn.overage = true;
			if (info.status === "rejected") turn.refused = `the plan's ${String(info.rateLimitType ?? "usage")} limit is used up`;
		} else if (event["type"] === "result") {
			ended = true;
			// An error result is the provider's refusal unless Claude Code names a cause of its own.
			if (event["is_error"] === true) {
				const said = typeof event["result"] === "string" && event["result"] ? event["result"] : String(event["subtype"] ?? "the request failed");
				if (event["subtype"] === "success") turn.refused = said;
				else turn.error = `claude stopped: ${said}`;
			}
		}
	}
	if (!ended && !turn.refused) turn.error = "claude ended without a result";
	return turn;
}

/** What is wrong with how the turn ran, apart from its answer: null when it ran as this harness means it to. */
export function misrun(turn: ClaudeTurn, tools: readonly string[]): { refused?: string; error?: string } | null {
	if (turn.refused) return { refused: turn.refused };
	if (turn.overage) return { refused: "the request was charged to extra usage, not the plan's limits" };
	if (turn.error) return { error: turn.error };
	if (turn.apiKeySource !== "none") return { error: `claude ran on a credential from "${turn.apiKeySource}", not the account it is signed in to` };
	const want = tools.map(mcpName).sort().join(", ");
	const got = [...(turn.tools ?? [])].sort().join(", ");
	if (want !== got) return { error: `claude offered the model ${got || "no tools"}, not ${want}` };
	return null;
}
