// The checks a runner can make without a judge: what pi did, read from its tool
// calls and the files around it, and what the answer looks like as a document.
// Pure: each takes what was observed and says pass or fail, with the reason a
// report shows. The rubric is not checked here — that is a person's or a
// judge's reading.
import { parseDocument } from "../src/document/format.ts";
import type { Case } from "./case.ts";

/** One tool call pi made during the turn. */
export interface ToolCall {
	name: string;
	args: Record<string, unknown>;
	/** Whether the call ended as an error: a payload the tool refused, a cell
	 *  that did not compile. Absent when the call was never seen to end, and in
	 *  every report older than the field. */
	failed?: boolean;
}

/** Everything a case's checks read. */
export interface Observed {
	/** The case's document, as given. */
	original: string;
	/** The document with the answer placed under its prompt. */
	result: string;
	prose: string;
	toolCalls: readonly ToolCall[];
	/** Workspace-relative path → content hash, before and after the turn. */
	before: ReadonlyMap<string, string>;
	after: ReadonlyMap<string, string>;
	conversationBefore: string;
	conversationAfter: string;
}

export interface CheckResult {
	check: string;
	pass: boolean;
	detail: string;
}

const result = (check: string, pass: boolean, detail: string): CheckResult => ({ check, pass, detail });

/** Every check the case asks for, plus the ones every case gets. */
export function runChecks(spec: Case, seen: Observed): CheckResult[] {
	const out = [...documentChecks(seen), answered(seen)];
	const { checks } = spec;
	const called = new Set(seen.toolCalls.map((c) => c.name));
	for (const name of checks.tools?.must ?? []) out.push(result(`calls ${name}`, called.has(name), called.has(name) ? "called" : `called only ${[...called].join(", ") || "nothing"}`));
	for (const name of checks.tools?.mustNot ?? []) out.push(result(`never calls ${name}`, !called.has(name), called.has(name) ? `called ${name}` : "not called"));
	if (checks.cellRedefines !== undefined) out.push(redefines(checks.cellRedefines, seen.toolCalls));
	for (const rel of checks.files?.changed ?? []) {
		const changed = seen.before.get(rel) !== seen.after.get(rel);
		out.push(result(`changes ${rel}`, changed, changed ? "changed" : "unchanged"));
	}
	for (const rel of checks.files?.unchanged ?? []) {
		const same = seen.before.get(rel) === seen.after.get(rel);
		out.push(result(`leaves ${rel}`, same, same ? "unchanged" : "changed"));
	}
	for (const rel of checks.files?.exist ?? []) {
		const there = seen.after.has(rel);
		out.push(result(`leaves ${rel} in place`, there, there ? "exists" : "missing"));
	}
	if (checks.conversationUntouched !== false) {
		const same = seen.conversationBefore === seen.conversationAfter;
		out.push(result("leaves the conversation file", same, same ? "unchanged" : "pi's tools changed it"));
	}
	if (checks.maxWords !== undefined) {
		const words = wordCount(seen.prose);
		out.push(result(`at most ${checks.maxWords} words`, words <= checks.maxWords, `${words} words`));
	}
	const prose = seen.prose.toLowerCase();
	for (const needle of checks.mentions ?? []) {
		const found = prose.includes(needle.toLowerCase());
		out.push(result(`mentions "${needle}"`, found, found ? "found" : "not found"));
	}
	const sources = seen.toolCalls.filter((c) => c.name === "cell").map((c) => String(c.args.source ?? ""));
	for (const needle of checks.cellMentions ?? []) {
		const found = sources.some((source) => source.includes(needle));
		out.push(result(`a cell holds "${needle}"`, found, found ? "found" : sources.length ? "in no cell call's source" : "no cell call"));
	}
	return out;
}

/** The result is still a document: it parses with nothing unknown, and every
 *  original segment is still there, in order — what the answer's own markers
 *  could break. (The history above the prompt is not checked: the runner
 *  copies it verbatim, so a check of it could not fail.) */
function documentChecks(seen: Observed): CheckResult[] {
	const before = parseDocument(seen.original).segments;
	const after = parseDocument(seen.result).segments;
	const opaque = after.filter((s) => s.kind === "opaque").length;
	const key = (s: { kind: string; id?: string; name?: string }) => `${s.kind}:${s.name ?? ""}#${s.id ?? ""}`;
	let at = 0;
	const keys = after.map(key);
	const missing = before.map(key).filter((k) => {
		const found = keys.indexOf(k, at);
		if (found < 0) return true;
		at = found + 1;
		return false;
	});
	return [
		result("the result parses", opaque === 0, opaque === 0 ? "no unknown marker" : `${opaque} unknown marker(s)`),
		result("markers intact", missing.length === 0, missing.length === 0 ? "every original segment, in order" : `missing ${missing.join(", ")}`),
	];
}

function answered(seen: Observed): CheckResult {
	const any = seen.prose.length > 0 || seen.toolCalls.length > 0;
	return result("answers", any, any ? "an answer was written" : "no text and no tool call");
}

/** A `cell` call whose `id` argument is the cell to redefine. */
function redefines(id: string, calls: readonly ToolCall[]): CheckResult {
	const ids = calls.filter((c) => c.name === "cell").map((c) => String(c.args.id ?? "(new)"));
	const hit = ids.includes(id);
	return result(`redefines #${id}`, hit, hit ? "redefined by id" : ids.length ? `cell calls with ${ids.join(", ")}` : "no cell call");
}

export function wordCount(text: string): number {
	const words = text.trim().split(/\s+/);
	return words[0] === "" ? 0 : words.length;
}
