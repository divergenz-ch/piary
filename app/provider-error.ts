// What a provider's refusal says to the user. pi passes a provider's error on
// as it got it — a status and the response body, JSON — and the body's own
// message is the part a person can act on. Pure, so the suite runs it from
// source; `Turn` writes what it returns under the prompt.

/**
 * A provider's `STATUS {json}` error as its message, keeping the status and
 * the request id for a support ticket; anything else as pi wrote it.
 */
export function providerErrorText(raw: string): string {
	const match = /^(?:(\d{3}) )?(\{[\s\S]*\})\s*$/.exec(raw);
	if (!match) return raw;
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(match[2]!) as Record<string, unknown>;
	} catch {
		return raw;
	}
	const error = body["error"] as Record<string, unknown> | string | undefined;
	const message = typeof error === "object" && error && typeof error["message"] === "string" ? error["message"] : typeof body["message"] === "string" ? body["message"] : null;
	if (!message) return raw;
	const status = match[1];
	const request = typeof body["request_id"] === "string" ? body["request_id"] : null;
	const tail = [status, request && `request ${request}`].filter(Boolean).join(", ");
	return tail ? `${message} (${tail})` : message;
}

/**
 * A refusal as the user reads it: the provider and model that gave it, then
 * what it said. `from` is pi's own record of where the request went, never the
 * chip's, so a request that went somewhere the user did not expect shows it.
 */
export function refusalText(raw: string, from: { provider?: unknown; model?: unknown }): string {
	const text = providerErrorText(raw);
	return typeof from.provider === "string" && from.provider && typeof from.model === "string" && from.model ? `${from.provider}/${from.model}: ${text}` : text;
}
