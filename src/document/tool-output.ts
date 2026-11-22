// What a running tool has printed so far, read off pi's untyped stream.

/**
 * The text of a tool's partial result (`tool_execution_update.partialResult`).
 *
 * Shaped like a tool result, content parts of which only the text ones matter,
 * but it arrives from pi untyped and, on the first update, empty: pi's `bash`
 * emits one `{ content: [] }` as soon as it starts. Anything with no text in it
 * is `""`, which is the caller's cue to open no panel yet.
 */
export function partialText(partial: unknown): string {
	const content = (partial as { content?: unknown } | null | undefined)?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: string; text?: string } => !!part && (part as { type?: unknown }).type === "text")
		.map((part) => part.text ?? "")
		.join("\n");
}
