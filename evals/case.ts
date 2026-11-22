// One eval case: a conversation document, the prompt in it to answer, and what a
// good answer must and must not do. A case is data — `cases/<slug>/case.json`
// beside its `doc.md` — so someone who writes no code can add one by copying a
// folder (evals/README.md). This module is the schema; `parseCase` rejects any
// key it does not know, so a typo fails loudly instead of quietly checking
// nothing.

/** The kinds of job a case exercises, weighted by how often users do them. */
export const JOBS = ["explain", "mid-document", "edit-file", "fix-and-run", "cell", "view", "fix-conversation"] as const;
export type Job = (typeof JOBS)[number];

/**
 * Canvas behaviour a chat eval would not catch. Every one must be covered by at
 * least one case (`tests/unit/eval-cases.test.ts` holds the set to that).
 */
export const CANVAS = [
	"caret-placement",
	"edited-history",
	"context-both-sides",
	"cell-redefine",
	"markers-intact",
	"fix-conversation",
] as const;
export type Canvas = (typeof CANVAS)[number];

/** The tools a check may name: pi's own and Piary's. A misspelt name would
 *  make a `mustNot` pass forever, so any other is refused. */
export const TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "view", "cell", "canvas_edit", "terminal"] as const;

/**
 * The tag of a case only a pi run can score: its answer turns on what the model
 * takes from Piary's skill file, which a model under `claude -p` rarely opens
 * (README §The claude harness). The claude harness leaves such a case out and says so.
 */
export const NEEDS_PI_TAG = "needs pi";

/** The tag every drafted case carries until a person has reviewed it. */
export const DRAFT_TAG = "AI DRAFT";
export const DRAFT_TITLE = `[${DRAFT_TAG}] `;

export interface Checks {
	/** Tool names the answer must call, and must not call. */
	tools?: { must?: string[]; mustNot?: string[] };
	/** A cell `#id` the answer must redefine through the `cell` tool. */
	cellRedefines?: string;
	/** Workspace-relative paths that must change, must stay byte-identical, and
	 *  must exist once the turn is over (a file the answer creates or renames). */
	files?: { changed?: string[]; unchanged?: string[]; exist?: string[] };
	/** The conversation file's bytes are unchanged by pi's own tools. On unless set false. */
	conversationUntouched?: boolean;
	/** The answer's prose stays under this many words. */
	maxWords?: number;
	/** Case-insensitive substrings the answer's prose must contain. */
	mentions?: string[];
	/** Substrings the source of the answer's `cell` calls must contain, each in at least one call. */
	cellMentions?: string[];
}

export interface Case {
	/** Starts with `[AI DRAFT] ` until a person reviews the case. */
	title: string;
	tags: string[];
	job: Job;
	canvas: Canvas[];
	/** A substring that occurs once in doc.md, inside the prompt to answer. Absent: the trailing prompt. */
	caret?: string;
	/** The conversation's file name, as the app would store it. Absent: `<slug>.md`. */
	file?: string;
	/** Plain-language pass criteria: for the judge later, and for people now. */
	rubric: string[];
	checks: Checks;
}

const CASE_KEYS = new Set(["title", "tags", "job", "canvas", "caret", "file", "rubric", "checks"]);
const CHECK_KEYS = new Set(["tools", "cellRedefines", "files", "conversationUntouched", "maxWords", "mentions", "cellMentions"]);
const TOOL_KEYS = new Set(["must", "mustNot"]);
const FILE_KEYS = new Set(["changed", "unchanged", "exist"]);

/** A case from its parsed `case.json`, or an error naming what is wrong. */
export function parseCase(json: unknown, where: string): Case {
	const fail = (why: string): never => {
		throw new Error(`${where}: ${why}`);
	};
	const object = (value: unknown, what: string): Record<string, unknown> =>
		value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(`${what} is not an object`);
	const strings = (value: unknown, what: string): string[] =>
		Array.isArray(value) && value.every((s) => typeof s === "string") ? value : fail(`${what} is not a list of strings`);
	const onlyKeys = (value: Record<string, unknown>, allowed: Set<string>, what: string) => {
		for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`unknown key "${key}" in ${what}`);
	};

	const raw = object(json, "the case");
	onlyKeys(raw, CASE_KEYS, "the case");
	if (typeof raw.title !== "string" || !raw.title) fail("title is missing");
	if (!JOBS.includes(raw.job as Job)) fail(`job must be one of ${JOBS.join(", ")}`);
	const canvas = strings(raw.canvas ?? [], "canvas");
	for (const c of canvas) if (!CANVAS.includes(c as Canvas)) fail(`canvas "${c}" is not one of ${CANVAS.join(", ")}`);
	const rubric = strings(raw.rubric, "rubric");
	if (rubric.length === 0) fail("rubric is empty");
	if (raw.caret !== undefined && typeof raw.caret !== "string") fail("caret is not a string");
	if (raw.file !== undefined && (typeof raw.file !== "string" || !raw.file.endsWith(".md"))) fail("file must be a .md name");

	const checks = object(raw.checks, "checks");
	onlyKeys(checks, CHECK_KEYS, "checks");
	if (checks.tools !== undefined) {
		const tools = object(checks.tools, "checks.tools");
		onlyKeys(tools, TOOL_KEYS, "checks.tools");
		for (const list of ["must", "mustNot"] as const) {
			if (tools[list] === undefined) continue;
			for (const name of strings(tools[list], `checks.tools.${list}`)) {
				if (!(TOOLS as readonly string[]).includes(name)) fail(`checks.tools.${list} names "${name}", not one of ${TOOLS.join(", ")}`);
			}
		}
	}
	if (checks.files !== undefined) {
		const files = object(checks.files, "checks.files");
		onlyKeys(files, FILE_KEYS, "checks.files");
		if (files.changed !== undefined) strings(files.changed, "checks.files.changed");
		if (files.unchanged !== undefined) strings(files.unchanged, "checks.files.unchanged");
		if (files.exist !== undefined) strings(files.exist, "checks.files.exist");
	}
	if (checks.mentions !== undefined) strings(checks.mentions, "checks.mentions");
	if (checks.cellMentions !== undefined) strings(checks.cellMentions, "checks.cellMentions");
	if (checks.maxWords !== undefined && !(typeof checks.maxWords === "number" && checks.maxWords > 0)) fail("checks.maxWords is not a positive number");
	if (checks.cellRedefines !== undefined && typeof checks.cellRedefines !== "string") fail("checks.cellRedefines is not a string");
	if (checks.conversationUntouched !== undefined && typeof checks.conversationUntouched !== "boolean") fail("checks.conversationUntouched is not a boolean");

	return {
		title: raw.title as string,
		tags: strings(raw.tags, "tags"),
		job: raw.job as Job,
		canvas: canvas as Canvas[],
		caret: raw.caret as string | undefined,
		file: raw.file as string | undefined,
		rubric,
		checks: checks as Checks,
	};
}
