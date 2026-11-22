// The pure half of the console forwarder (`forward-console.ts`): how a console
// call's arguments become one line, and a send that can never fail its caller.
// Separate because the forwarder patches `console` and `window` at import, which
// no test can import without; this module touches neither.

/** One console argument as a line's text. Never throws: a cyclic or exotic
 *  value must not make logging the thing that fails. */
export function describe(part: unknown): string {
	if (typeof part === "string") return part;
	if (part instanceof Error) return `${part.message}\n${part.stack ?? ""}`;
	try {
		return JSON.stringify(part) ?? String(part);
	} catch {
		return String(part);
	}
}

/** What the forwarder hands a line to: `src/bridge.ts`'s `logLine`. */
export type LogLine = (level: string, message: string) => Promise<unknown>;

/**
 * A send over `log` that never fails its caller. Fire and forget: awaiting would
 * reorder a log against the code that wrote it. A rejection is swallowed, and so
 * is a synchronous throw — `invoke` throws rather than rejects when the page has
 * no IPC at all, and a console call is the last place a page should crash.
 */
export function sender(log: LogLine): (level: string, parts: readonly unknown[]) => void {
	return (level, parts) => {
		try {
			void log(level, parts.map(describe).join(" ")).catch(() => {});
		} catch {}
	};
}
