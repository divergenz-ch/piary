// The `a2ui` view's payload, as A2UI v1.0 messages (document-format.md §views).
//
// The agent writes the body of one `createSurface` — `{ components, dataModel? }`
// — and this wraps it in the message the renderer processes: the version, a
// surface id and Piary's catalog id are fixed boilerplate the agent could only
// get wrong. A payload that is already A2UI (one message, a list, or
// `{ messages }`) is accepted too and pointed at the same surface and catalog,
// so a model that writes the protocol it knows is not refused for it.
//
// `pi-extension/a2ui.ts` keeps a copy of `a2uiMessages`, because the extension
// cannot import `src/`; tests/contract/a2ui-copies.test.ts holds the two to one
// behaviour.

/** The id of Piary's A2UI catalog: the basic v1.0 catalog plus Piary's components. */
export const A2UI_CATALOG_ID = "https://piary.dev/a2ui/catalog/v1.json";

/** The A2UI protocol version a block is rendered as. */
export const A2UI_VERSION = "1.0";

type Message = Record<string, unknown>;

/** The message keys A2UI defines, one per message. */
const KINDS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The messages that render `data` as the surface `surfaceId`, or the problem
 * with its shape. Only the envelope is checked here; whether the components
 * fit the catalog is the processor's to say.
 */
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
		// A block is one surface for as long as it is in the document.
		if (kind === "deleteSurface") continue;
		const inner: Record<string, unknown> = { ...(entry as Message)[kind] as Record<string, unknown>, surfaceId };
		if (kind === "createSurface") inner.catalogId = A2UI_CATALOG_ID;
		messages.push({ version: A2UI_VERSION, [kind]: inner });
	}
	if (!messages.some((m) => "createSurface" in m))
		messages.unshift({ version: A2UI_VERSION, createSurface: { surfaceId, catalogId: A2UI_CATALOG_ID } });
	return { messages };
}

/** One refusal as it is read — by the user under the view, by the agent in the
 *  tool's answer: what failed, where, and why. */
export function refusalLine(error: { code: string; path?: string; message: string }): string {
	return `${error.code}${error.path ? ` at ${error.path}` : ""}: ${error.message}`;
}
