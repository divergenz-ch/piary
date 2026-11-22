// The Model Context Protocol, as much of it as serving tools takes: one
// JSON-RPC message in, its reply out. Pure, so the suite speaks it by hand;
// `host.ts` owns the pipes. Written here rather than taken from an SDK because
// four methods do not earn a dependency.

/** A tool as the protocol lists it. */
export interface McpTool {
	name: string;
	description: string;
	inputSchema: unknown;
}

export interface McpResult {
	content: unknown[];
	isError: boolean;
}

/** Runs tool `name`. `toolUseId` is the id the model's call carries, when the client says it. */
export type CallTool = (name: string, args: Record<string, unknown>, toolUseId: string | undefined) => Promise<McpResult>;

/** Where Claude Code puts the model's tool-use id on a `tools/call`. */
const TOOL_USE_ID = "claudecode/toolUseId";

/** The protocol revision answered when the client names none. */
const PROTOCOL = "2025-06-18";

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** The reply to `message`, or null for a notification, which gets none. */
export async function answer(message: unknown, server: string, tools: readonly McpTool[], call: CallTool): Promise<Record<string, unknown> | null> {
	const { id, method, params } = (message ?? {}) as { id?: unknown; method?: unknown; params?: Record<string, unknown> };
	if (id === undefined || id === null) return null;
	const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
	const refuse = (code: number, text: string) => ({ jsonrpc: "2.0", id, error: { code, message: text } });
	if (method === "initialize") {
		const asked = params?.["protocolVersion"];
		return ok({ protocolVersion: typeof asked === "string" ? asked : PROTOCOL, capabilities: { tools: {} }, serverInfo: { name: server, version: "0" } });
	}
	if (method === "ping") return ok({});
	if (method === "tools/list") return ok({ tools });
	if (method === "tools/call") {
		const name = params?.["name"];
		if (typeof name !== "string" || !tools.some((tool) => tool.name === name)) return refuse(INVALID_PARAMS, `no tool named ${String(name)}`);
		const args = params?.["arguments"];
		const meta = params?.["_meta"] as Record<string, unknown> | undefined;
		const toolUseId = meta?.[TOOL_USE_ID];
		return ok(await call(name, args && typeof args === "object" ? (args as Record<string, unknown>) : {}, typeof toolUseId === "string" ? toolUseId : undefined));
	}
	return refuse(METHOD_NOT_FOUND, `no method ${String(method)}`);
}
