// The `a2ui` view template's check at the tool boundary: the payload is run
// through the same A2UI processor, catalog and validation the page renders it
// with, so a surface the page would refuse is refused here, while the agent can
// still fix it. Without this the agent is told `ok` and the user sees the error.
//
// The packaged app's `Resources/pi-extension/` has no `node_modules`, so the
// processor is imported only inside the check, and from one of two places: the
// `@a2ui/web_core` package where it resolves (this repository), else
// `a2ui-core.bundle.js` beside this file, the same package bundled by
// `pnpm build` and shipped with the extension (ADR 0043). With neither, the
// check is skipped and says so; the page still shows any error.
// The catalog is `a2ui-catalog.ts` beside this file — the page's catalog
// serialized, held to it by tests/contract/a2ui-copies.test.ts.
//
// No `typebox` here, so the suite can import this file directly.
import { A2UI_CATALOG } from "./a2ui-catalog.ts";
import { expressionProblems } from "./a2ui-expr.ts";

/** The catalog document carries the page's catalog id, so the two cannot disagree. */
const A2UI_CATALOG_ID = A2UI_CATALOG.catalogId as string;
const A2UI_VERSION = "1.0";
const KINDS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const;

type Message = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** A copy of `a2uiMessages` in src/document/a2ui.ts — the two must agree. */
export function a2uiMessages(data: unknown, surfaceId: string): { messages: Message[] } | { problem: string } {
	let list: unknown[];
	if (Array.isArray(data)) list = data;
	else if (isRecord(data) && Array.isArray(data.messages)) list = data.messages;
	else if (isRecord(data) && KINDS.some((kind) => kind in data)) list = [data];
	else if (isRecord(data) && Array.isArray(data.components)) {
		const body: Record<string, unknown> = { surfaceId, catalogId: A2UI_CATALOG_ID, components: data.components };
		if (data.dataModel !== undefined) body.dataModel = data.dataModel;
		return { messages: [{ version: A2UI_VERSION, createSurface: body }] };
	} else
		return {
			problem:
				'The a2ui payload needs "components": a flat list of { "id", "component", ...props } with one "id": "root" (and optionally "dataModel": {...}).',
		};
	const messages: Message[] = [];
	for (const [index, entry] of list.entries()) {
		const kind = isRecord(entry) ? KINDS.find((k) => isRecord(entry[k])) : undefined;
		if (!kind) return { problem: `Message ${index} of the a2ui payload is not one of ${KINDS.join(", ")}.` };
		if (kind === "deleteSurface") continue;
		const inner: Record<string, unknown> = { ...(entry as Message)[kind] as Record<string, unknown>, surfaceId };
		if (kind === "createSurface") inner.catalogId = A2UI_CATALOG_ID;
		messages.push({ version: A2UI_VERSION, [kind]: inner });
	}
	if (!messages.some((m) => "createSurface" in m))
		messages.unshift({ version: A2UI_VERSION, createSurface: { surfaceId, catalogId: A2UI_CATALOG_ID } });
	return { messages };
}

/** One refusal as the agent reads it: what failed, where, and why. */
export function refusalLine(error: { code: string; path?: string; message: string }): string {
	return `${error.code}${error.path ? ` at ${error.path}` : ""}: ${error.message}`;
}

type Refuse = (messages: Message[]) => string[];
type Core = typeof import("@a2ui/web_core");

/** Not a literal in the `import()`, so the typecheck does not look for a file a build writes. */
const CORE_BUNDLE: string = "./a2ui-core.bundle.js";

/** The package's failure is the one reported: the bundle missing only means nothing was built. */
async function loadCore(): Promise<Core> {
	try {
		return await import("@a2ui/web_core");
	} catch (error) {
		try {
			return (await import(CORE_BUNDLE)) as Core;
		} catch {
			throw error;
		}
	}
}

let refuser: Promise<Refuse | string> | undefined;

/** The processor-backed check, or why it cannot run here. */
function loadRefuser(): Promise<Refuse | string> {
	refuser ??= (async () => {
		try {
			const { Catalog, MessageProcessor, STRICT_VALIDATION } = await loadCore();
			const catalog = Catalog.fromJson(A2UI_CATALOG);
			return (messages: Message[]) => {
				// Orphans are allowed, as on the page: an unused component is harmless,
				// and refusing it would cost a whole answer.
				const processor = new MessageProcessor([catalog as never], () => {}, {
					validationConfig: { ...STRICT_VALIDATION, allowOrphanComponents: true },
				});
				try {
					return processor.processMessagesWithErrors(messages as never).map((m) => refusalLine(m.error));
				} finally {
					processor.dispose();
				}
			};
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	})();
	return refuser;
}

/**
 * What the `view` tool answers an `a2ui` call: `problem` when the page would
 * refuse the surface (the agent should fix it), else `note` — "ok", or ok with
 * why it could not be checked.
 */
export async function checkA2ui(data: unknown): Promise<{ problem: string } | { note: string }> {
	const shaped = a2uiMessages(data, "check");
	if ("problem" in shaped) return { problem: shaped.problem };
	// Formulas first, as the page judges them: to the processor they are strings.
	let found = expressionProblems(data).map(refusalLine);
	if (!found.length) {
		const refuse = await loadRefuser();
		if (typeof refuse === "string") return { note: `ok (the surface was not checked here: ${refuse})` };
		found = refuse(shaped.messages);
	}
	if (!found.length) return { note: "ok" };
	return {
		problem: `The a2ui surface would not render, so the user would see this error instead:\n${found.map((line) => `- ${line}`).join("\n")}\nFix the payload and call view again.`,
	};
}
