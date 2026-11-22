// Ids the page mints for sessions it starts.

/** A fresh session id, `web-` and 8 hex — the shape every Piary conversation
 *  has had, so ids an earlier Piary minted and these sort and read alike: a
 *  child's (`/subagent`) or a new document's. Dot-free, because a window label
 *  cannot hold a dot (ADR 0027). */
export function newSid(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(4));
	return `web-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
