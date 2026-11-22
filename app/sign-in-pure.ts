// When the page offers to sign in, as data (the ask and the panel it opens
// are wired elsewhere). Both halves are pi's own answers, never its wording: a
// refusal is the prompt reply's `success: false`, and "no provider" is
// `get_available_models` listing nothing, because pi lists only the models it
// can authenticate, environment keys included (ADR 0004).

import type { PiReply } from "../src/bridge.ts";

/**
 * Whether a refused prompt was refused for want of any provider. A models
 * query that itself failed is not an empty list: the refusal's own error is
 * already in the document, and an ask on a guess would be a wrong one.
 */
export function signInNeeded(promptReply: PiReply, modelsReply: PiReply): boolean {
	if (promptReply?.success !== false || promptReply.timedOut === true) return false;
	if (modelsReply?.success !== true) return false;
	const models = modelsReply.data?.["models"];
	return Array.isArray(models) && models.length === 0;
}
