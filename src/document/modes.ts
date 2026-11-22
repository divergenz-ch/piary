// The mode catalog (blocks-plan step 12, ground rule 11): pi core deliberately
// omits plan mode and sub-agents — they are launch configuration plus a
// rendering row, never core enums. Adding a mode is adding a row here.
//
// A row's `marks` say what a block of this mode leaves *in the document* — the
// mode's own tool names, or the view template it writes. That is how the rail
// badges a block: from the catalog's declared marks, never from sniffing tool
// names for the word "agent".
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { DocBlock, DocSegment } from "./format.ts";

export interface ModeRow {
	id: string;
	/** One-line phrase for the `/` menu row and its docs card — same string in
	 *  both, so the two surfaces cannot speak differently. */
	menuDetail: string;
	/** How the mode starts. `command`: an extension slash command, sent as a
	 *  prompt — pi executes it immediately and starts no run. `childSession`:
	 *  the mode runs in its own session (the sub-agent block). */
	launch: { command: string } | { childSession: true };
	/** Rail badge for blocks carrying this mode's marks. */
	badge: string;
	marks: { tools?: string[]; view?: string };
	/** The `custom` transcript entry the mode's extension appends on every
	 *  transition — the honest per-branch source of mode state (step 13).
	 *  Absent for modes that keep no session state (child sessions). */
	stateEntry?: { customType: string };
}

export const MODES: ModeRow[] = [
	{
		id: "plan",
		menuDetail: "explore and plan, no edits until approved",
		// @narumitw/pi-plan-mode registers both a `--plan` flag and a `/plan`
		// command. The command wins: it turns the mode on in the resident
		// session, where the flag would need a respawn.
		launch: { command: "/plan start" },
		badge: "plan",
		marks: { tools: ["plan_mode_question", "plan_mode_complete"] },
		stateEntry: { customType: "plan-mode-state" },
	},
	{
		id: "subagent",
		menuDetail: "run a prompt in its own child session",
		launch: { childSession: true },
		badge: "agent",
		marks: { view: "subsession" },
	},
];

export interface ChildSessionInvocation {
	mode: ModeRow;
	/** The notebook text before the invocation remains the parent's tail draft. */
	draft: string;
	prompt: string;
}

/**
 * Read a child-session invocation from a line in the pending notebook block.
 * The command stays in the document while the user writes, so drafts and
 * reloads preserve both the routing intent and the prompt.
 */
export function childSessionInvocation(text: string): ChildSessionInvocation | null {
	for (const mode of MODES) {
		if (!("childSession" in mode.launch)) continue;
		const command = `/${mode.id}`;
		let from = 0;
		while (from <= text.length) {
			const at = text.indexOf(command, from);
			if (at < 0) break;
			const lineStart = at === 0 || text[at - 1] === "\n";
			const after = text[at + command.length];
			if (lineStart && (after === undefined || /\s/.test(after))) {
				return {
					mode,
					draft: text.slice(0, at).trim(),
					prompt: text.slice(at + command.length).trim(),
				};
			}
			from = at + command.length;
		}
	}
	return null;
}

export interface ModeState {
	mode: ModeRow;
	enabled: boolean;
	awaitingAction: boolean;
}

const stateEntryMode = (entry: SessionEntry): ModeRow | undefined =>
	entry.type === "custom" ? MODES.find((m) => m.stateEntry?.customType === entry.customType) : undefined;

const stateData = (entry: SessionEntry): { enabled?: boolean; awaitingAction?: boolean } | undefined =>
	(entry as { data?: { enabled?: boolean; awaitingAction?: boolean } }).data;

/**
 * The session's live mode, from the latest state entry on the active branch
 * (root-first) — the transcript owns mode state, per-branch (rules 1–2), so
 * branch flips carry it. Null when no mode ever spoke on this branch.
 */
export function modeState(entries: readonly SessionEntry[]): ModeState | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const mode = stateEntryMode(entries[i]);
		if (!mode) continue;
		const data = stateData(entries[i]);
		return { mode, enabled: data?.enabled === true, awaitingAction: data?.awaitingAction === true };
	}
	return null;
}

/**
 * The mode each block *declared*: its opening entry's nearest preceding
 * enabled state entry on the branch. Keys pass through from `blockIds`
 * (alignment's segIndex → entryId map). State entries are non-role-bearing,
 * so alignment's identity map is unshifted by construction (rule 4).
 */
export function modesByBlock<K>(entries: readonly SessionEntry[], blockIds: ReadonlyMap<K, string>): Map<K, ModeRow> {
	const keyByEntry = new Map<string, K>();
	for (const [key, entryId] of blockIds) keyByEntry.set(entryId, key);
	const result = new Map<K, ModeRow>();
	let active: ModeRow | undefined;
	for (const entry of entries) {
		const mode = stateEntryMode(entry);
		if (mode) active = stateData(entry)?.enabled === true ? mode : undefined;
		const key = keyByEntry.get(entry.id);
		if (key !== undefined && active) result.set(key, active);
	}
	return result;
}

/** The mode a block ran in, read off the marks it left in the document —
 *  the fallback for hand-written docs and unaligned states (step 13);
 *  aligned documents read declared modes via `modesByBlock` instead. */
export function blockMode(segments: readonly DocSegment[], block: DocBlock): ModeRow | undefined {
	for (const i of block.members) {
		const seg = segments[i];
		const row = MODES.find((m) =>
			seg.kind === "view"
				? m.marks.view === seg.name
				: seg.kind === "toolCall" && m.marks.tools?.includes(seg.name ?? ""),
		);
		if (row) return row;
	}
	return undefined;
}

/** A view a mode owns reads as an agent in the rail; other views are artifacts. */
export const viewIsMode = (name?: string): boolean => MODES.some((m) => m.marks.view === name);
