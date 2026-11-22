// The document → transcript rewrite: what a send makes pi's history before it
// prompts, when the document above the prompt is not what pi remembers.
//
// The document is the history (ADR 0002), so this is a rebuild, never a diff:
// the transcript's messages are replaced wholesale by the document's, and only
// what the document provably cannot carry comes across from the entries being
// replaced — provider metadata per message, zipped back by position, and the
// session's own state. The app runs it (ADR 0021): the entries arrive as
// `get_entries` answers them and the result goes to Rust to write after the
// header, so this module touches no file and no wire.
//
// It is the translation side of ADR 0020: it writes pi's entries and names
// pi's types to do so, as `branch.ts` does to read them.
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { activeBranch } from "./branch.ts";

/** Provider metadata that lives only in the transcript. The document cannot
 *  carry it, so a rebuild zips it back from the message it replaces. */
export const META = ["api", "provider", "model", "responseModel", "responseId", "usage", "stopReason", "diagnostics", "toolName", "details"] as const;

/** The custom entry widget state is written as, in the transcript. */
export const CELL_STATE_TYPE = "pi-ui-cell-state";

/** The state entry kinds a session keeps apart from its text. */
const STATE_TYPES = new Set(["model_change", "thinking_level_change", "session_info"]);

/** Custom state the page's own host writes, read latest-wins over the WHOLE
 *  transcript rather than the branch. Such an entry is appended without moving
 *  the resident agent's in-memory leaf, so the agent's next write leaves it on
 *  a sibling branch — and a slider value or a disabled package must not be
 *  dropped for that. Everything owned by pi or an extension stays
 *  branch-scoped. */
const SNAPSHOT_TYPES = new Set([CELL_STATE_TYPE, "pi-ui-extensions"]);

/** A message pi wrote to declare its prompt and tools. They patch one another
 * by section, so all of them are kept, in order; the document never holds one. */
function isSystem(entry: SessionEntry): boolean {
	return ((entry as unknown as Loose)["message"] as Loose | undefined)?.["role"] === "system";
}

/** What the document says the history is: `documentMessages`' answer. */
export interface DocumentHistory {
	messages: readonly AgentMessage[];
	/** Indices of the messages that open a block. */
	openers: ReadonlySet<number>;
}

/** Where a rebuild's new ids and timestamps come from — injected, so the same
 *  input always gives the same output. */
/**
 * The widget state a transcript holds: the latest `pi-ui-cell-state` entry's
 * data over the whole transcript, in file order, side branches included — the
 * same rule `SNAPSHOT_TYPES` reads it by. Null when there is none.
 */
export function latestCellState(entries: readonly SessionEntry[]): unknown {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i] as unknown as Loose;
		if (e["type"] === "custom" && e["customType"] === CELL_STATE_TYPE) return e["data"] ?? null;
	}
	return null;
}

/** What a host adds to a rebuild beyond the document's history. */
export interface RebuildOptions {
	/**
	 * The widget state the host holds. When given — `null` included, meaning
	 * "none" — it replaces whatever widget state the transcript carried, so a
	 * rebuild never writes a stale one forward.
	 */
	cellState?: unknown;
}

export interface RebuildClock {
	now: () => string;
	newId: () => string;
}

/** An entry, read by the few fields a rebuild moves. The schema is pi's
 *  (ADR 0002): this reads fields by name and models nothing else. */
type Loose = Record<string, unknown>;

/**
 * The session state a rewrite has to put back: the latest entry of each state
 * kind on the branch — model, thinking level, name, each custom type — plus the
 * latest of each snapshot type anywhere in the transcript.
 *
 * `block-new` is not state: it is document structure, rebuilt from the
 * document's own openers. Exported because copying a session needs exactly this
 * answer, and one rule cannot come to disagree with itself (ADR 0002).
 */
export function carriedState(entries: readonly SessionEntry[], branch: readonly SessionEntry[]): SessionEntry[] {
	const onBranch = new Set(branch.map((entry) => entry.id));
	const pool = entries.filter((entry) => {
		const e = entry as unknown as Loose;
		return onBranch.has(entry.id) || (e["type"] === "custom" && SNAPSHOT_TYPES.has(String(e["customType"])));
	});
	const carried: SessionEntry[] = [];
	const seen = new Set<string>();
	for (let i = pool.length - 1; i >= 0; i--) {
		const e = pool[i] as unknown as Loose;
		const type = String(e["type"]);
		const key =
			type === "custom"
				? e["customType"] === "block-new"
					? null
					: `custom:${String(e["customType"])}`
				: STATE_TYPES.has(type)
					? type
					: null;
		if (!key || seen.has(key)) continue;
		seen.add(key);
		carried.unshift(pool[i]!);
	}
	return carried;
}

/**
 * The transcript rewritten so its history is the document's.
 *
 * `entries` and `leafId` are `get_entries`' reply; the result is every entry to
 * write after the header, parent-chained root to leaf, so the last one is the
 * leaf pi loads (v3 leaf-on-load). Carried state rides first, then pi's system
 * messages, then one entry per document message, with a `block-new` ahead of each message that opens a
 * block. A message keeps the metadata and timestamp of the old message at the
 * same position when their roles match; an inserted one starts fresh. No diff:
 * the zip is total because the rewrite is total.
 */
export function rebuildEntries(
	entries: readonly SessionEntry[],
	leafId: string | null,
	history: DocumentHistory,
	clock: RebuildClock,
	options: RebuildOptions = {},
): SessionEntry[] {
	const branch = activeBranch(entries, leafId);
	const messages = branch.filter((entry) => {
		const e = entry as unknown as Loose;
		return e["type"] === "message" && e["message"];
	});
	const old = messages.filter((entry) => !isSystem(entry));
	const now = clock.now();

	const out: SessionEntry[] = [];
	let parentId: string | null = null;
	const append = (entry: Loose) => {
		const id = clock.newId();
		out.push({ ...entry, id, parentId } as unknown as SessionEntry);
		parentId = id;
	};

	const overridesState = "cellState" in options;
	for (const state of carriedState(entries, branch)) {
		const { id: _id, parentId: _parent, ...rest } = state as unknown as Loose;
		if (overridesState && rest["type"] === "custom" && rest["customType"] === CELL_STATE_TYPE) continue;
		append(rest);
	}
	if (overridesState && options.cellState !== null && options.cellState !== undefined)
		append({ type: "custom", customType: CELL_STATE_TYPE, data: options.cellState, timestamp: now });
	for (const entry of messages.filter(isSystem)) {
		const { id: _id, parentId: _parent, ...rest } = entry as unknown as Loose;
		append(rest);
	}
	history.messages.forEach((message, i) => {
		// Paired only when the roles line up, so the zip cannot graft one role's
		// metadata onto another's.
		const prevEntry = old[i] as unknown as Loose | undefined;
		const prev = prevEntry?.["message"] as Loose | undefined;
		const paired = prev?.["role"] === message.role ? prev : undefined;
		const next: Loose = { ...(message as unknown as Loose) };
		if (paired) for (const key of META) if (key in paired) next[key] = paired[key];
		next["timestamp"] = paired?.["timestamp"] ?? Date.parse(now);
		if (history.openers.has(i)) append({ type: "custom", customType: "block-new", data: {}, timestamp: now });
		append({ type: "message", message: next, timestamp: paired ? (prevEntry?.["timestamp"] ?? now) : now });
	});
	return out;
}
