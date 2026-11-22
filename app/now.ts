// The `[now: …]` line a send ends with (ADR 0028), from this machine's clock
// and zone — the user's, which is the point — and before it the face block,
// when the send has one (ADR 0055).

import { nowLine, withFace, withNow } from "../src/document/turn-context.ts";

/** `message` as pi is handed it: `face`, the block for it, then the time line
 *  last. */
export function stamped(message: string, face = ""): string {
	return withNow(withFace(message, face), nowLine(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone));
}
