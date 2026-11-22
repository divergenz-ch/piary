import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** The provider's own rule: every tool_result matches a tool_use in the message
 *  before it, and every tool_use is answered. */
export function unpaired(messages: readonly AgentMessage[]): { dangling: string[]; orphans: string[] } {
	const dangling: string[] = [];
	const orphans: string[] = [];
	const callIds = (m: AgentMessage | undefined) =>
		m?.role === "assistant" ? m.content.filter((c) => c.type === "toolCall").map((c) => c.id) : [];
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role === "assistant") {
			const answers = new Set<string>();
			for (let j = i + 1; j < messages.length; j++) {
				const next = messages[j];
				if (next.role !== "toolResult") break;
				answers.add(next.toolCallId);
			}
			for (const id of callIds(m)) if (!answers.has(id)) dangling.push(id);
		}
		if (m.role === "toolResult") {
			let p = i - 1;
			while (p >= 0 && messages[p].role === "toolResult") p--;
			if (!new Set(callIds(messages[p])).has(m.toolCallId)) orphans.push(m.toolCallId);
		}
	}
	return { dangling, orphans };
}
