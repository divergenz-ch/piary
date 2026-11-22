// An A2UI surface renders under jsdom: a hand-written payload goes through
// `@a2ui/web_core`'s MessageProcessor into `@a2ui/lit`'s <a2ui-surface>, with
// no agent and no network — the shape a `pi:view a2ui` block is rendered in.
//
// The basic catalog's components render into their own shadow roots, so what a
// user would read is gathered across them (`visibleText`, `deepQuery`), not
// from the surface's light DOM alone.
import assert from "node:assert/strict";
import test from "node:test";
import { Marked } from "marked";
import { z } from "zod";
import type { ActionPayload, MessageProcessor as Processor, RendererErrorMessage, SurfaceModel } from "@a2ui/web_core/v1_0";
import { boot } from "../helpers/editor.ts";

await boot();
// Lit defines its elements at import time, so the renderer loads only once the
// jsdom globals exist.
const { MessageProcessor, STRICT_VALIDATION, basicCatalog, setMarkdownRenderer, DynamicStringSchema } = await import(
	"@a2ui/web_core/v1_0"
);
const { html, nothing } = await import("lit");
const { A2uiLitElement } = await import("@a2ui/lit");
const { basicCatalog: basicCatalogV09 } = await import("@a2ui/lit/v0_9");

/** Escapes text for HTML. */
const escapeHtml = (text: string) =>
	text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// A2UI's Text takes "simple Markdown … without HTML, images, or links", and
// hands the rendered string to `unsafeHTML`: the renderer is where that promise
// is kept, so raw HTML is escaped and a link or image keeps only its text.
const markdown = new Marked({
	async: false,
	renderer: {
		html: ({ text }) => escapeHtml(text),
		link({ tokens }) {
			return this.parser.parseInline(tokens);
		},
		image: ({ text }) => escapeHtml(text),
	},
});
setMarkdownRenderer((text) => Promise.resolve(markdown.parse(text) as string));

/** The schema of a stat tile — a component the basic catalog lacks. */
const StatApi = {
	name: "Stat",
	schema: z.object({ label: DynamicStringSchema, value: DynamicStringSchema }).strict(),
};

/** The tile itself: a custom component is an A2uiLitElement whose props the controller resolves. */
class StatElement extends A2uiLitElement<typeof StatApi> {
	protected override readonly api = StatApi;
	override render() {
		const props = this.controller?.props;
		if (!props) return nothing;
		return html`<div class="stat"><span class="stat-label">${props.label}</span><strong>${props.value}</strong></div>`;
	}
}

/** One catalog the agent names once: the v1.0 basic components and functions, plus Stat. */
const piaryCatalog = basicCatalog.derive({
	catalogId: "https://piary.dev/a2ui/catalog/v1.json",
	components: [...basicCatalog.components.keys(), { ...StatApi, tagName: "piary-a2ui-stat", element: StatElement }],
});

/** The card the A2UI arm's agent is asked for in miniature: a heading, two texts, a button. */
function cardPayload(catalogId = basicCatalog.id): unknown[] {
	return [
		{
			version: "1.0",
			createSurface: {
				surfaceId: "card",
				catalogId,
				dataModel: { plan: { name: "Team", seats: 12 } },
				components: [
					{ id: "root", component: "Card", child: "body" },
					{ id: "body", component: "Column", children: ["title", "summary", "seats", "choose"] },
					{ id: "title", component: "Text", text: "## Team plan" },
					{ id: "summary", component: "Text", text: "Everything in Solo, for a **whole team**. <b>no</b>" },
					{
						id: "seats",
						component: "Text",
						variant: "caption",
						text: { "@call": "formatString", args: { value: "${/plan/seats} seats included" } },
					},
					{ id: "chooseLabel", component: "Text", text: "Choose plan" },
					{
						id: "choose",
						component: "Button",
						variant: "primary",
						child: "chooseLabel",
						action: { event: { name: "choose_plan", context: { plan: { "@path": "/plan/name" } } } },
					},
				],
			},
		},
	];
}

/** Every text a reader would see under `root`, shadow roots included, whitespace-collapsed. */
function visibleText(root: Node): string {
	const parts: string[] = [];
	const walk = (node: Node) => {
		if (node.nodeType === node.TEXT_NODE) parts.push(node.textContent ?? "");
		const shadow = (node as Element).shadowRoot;
		if (shadow) walk(shadow);
		for (const child of Array.from(node.childNodes)) walk(child);
	};
	walk(root);
	return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** The first element matching `selector` anywhere under `root`, shadow roots included. */
function deepQuery(root: Element | ShadowRoot, selector: string): Element | null {
	const here = root.querySelector(selector);
	if (here) return here;
	for (const el of Array.from(root.querySelectorAll("*"))) {
		const found = el.shadowRoot && deepQuery(el.shadowRoot, selector);
		if (found) return found;
	}
	return null;
}

/** Waits until every Lit element under `node` has finished its update, shadow roots included. */
async function settleTree(node: Node): Promise<void> {
	const pending = (node as { updateComplete?: Promise<unknown> }).updateComplete;
	if (pending) await pending;
	const shadow = (node as Element).shadowRoot;
	if (shadow) await settleTree(shadow);
	for (const child of Array.from(node.childNodes)) await settleTree(child);
}

/** Mounts `surface` in an <a2ui-surface> and waits for the whole tree, markdown included, to render. */
async function mountSurface(surface: SurfaceModel | undefined): Promise<HTMLElement> {
	assert.ok(surface, "the surface exists");
	const el = document.createElement("a2ui-surface") as HTMLElement & { surface?: SurfaceModel };
	document.body.append(el);
	el.surface = surface;
	// A child resolves on the update after its parent's, and markdown lands a
	// microtask after its element: a few passes settle the leaves.
	for (let pass = 0; pass < 3; pass++) {
		await settleTree(el);
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	return el;
}

/**
 * A processor that records every action its surfaces dispatch. The graph checks
 * (unknown component, dangling child, missing root, orphan) run only when a
 * validation config is passed: without one they are skipped and a broken
 * payload renders blank.
 */
function processor(catalog = basicCatalog): { processor: Processor; actions: ActionPayload[] } {
	const actions: ActionPayload[] = [];
	const p = new MessageProcessor([catalog], (action) => void actions.push(action), { validationConfig: STRICT_VALIDATION });
	return { processor: p, actions };
}

/** The error messages a payload draws, one per refused message. */
function refusals(p: Processor, messages: unknown[]): string[] {
	return p.processMessagesWithErrors(messages).map((m: RendererErrorMessage) => `${m.error.code}: ${m.error.message}`);
}

/** A one-message v1.0 surface holding just `components`. */
const surfaceOf = (surfaceId: string, components: unknown[]) => [
	{ version: "1.0", createSurface: { surfaceId, catalogId: basicCatalog.id, components } },
];

test("a v1.0 createSurface carrying its components and data renders the card in one message", async () => {
	const { processor: p } = processor();
	assert.deepEqual(refusals(p, cardPayload()), []);
	const el = await mountSurface(p.getSurface("card"));
	try {
		const text = visibleText(el);
		assert.match(text, /Everything in Solo, for a whole team ?\./);
		assert.match(text, /12 seats included/, "formatString resolved the data binding");
		assert.match(text, /Choose plan/);
		assert.ok(deepQuery(el, "a2ui-card"), "the root is the basic catalog's card");
	} finally {
		el.remove();
	}
});

test("Text's markdown makes v1.0's headings and emphasis, and raw HTML in it stays text", async () => {
	const { processor: p } = processor();
	p.processMessages(cardPayload() as Parameters<Processor["processMessages"]>[0]);
	const el = await mountSurface(p.getSurface("card"));
	try {
		assert.equal(deepQuery(el, "h2")?.textContent, "Team plan", "`## ` is how v1.0 writes a heading");
		assert.equal(deepQuery(el, "strong")?.textContent, "whole team");
		assert.equal(deepQuery(el, "b"), null, "an HTML tag in the agent's text is not markup");
		assert.match(visibleText(el), /<b>no<\/b>/);
	} finally {
		el.remove();
	}
});

test("a button press reaches the host as a named action with its context resolved from the data", async () => {
	const { processor: p, actions } = processor();
	p.processMessages(cardPayload() as Parameters<Processor["processMessages"]>[0]);
	const el = await mountSurface(p.getSurface("card"));
	try {
		const button = deepQuery(el, "button.a2ui-button-primary") as HTMLButtonElement | null;
		assert.ok(button, "the primary button rendered");
		button.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		assert.equal(actions.length, 1);
		assert.equal(actions[0]?.name, "choose_plan");
		assert.equal(actions[0]?.sourceComponentId, "choose");
		assert.deepEqual(actions[0]?.context, { plan: "Team" });
	} finally {
		el.remove();
	}
});

test("one Piary catalog holds the basic components and a custom one, and the renderer defines its element", async () => {
	const { processor: p } = processor(piaryCatalog);
	const messages = cardPayload(piaryCatalog.id);
	const create = (messages[0] as { createSurface: { components: unknown[] } }).createSurface;
	create.components.push({ id: "seatsTile", component: "Stat", label: "Seats", value: { "@path": "/plan/seats" } });
	(create.components[1] as { children: string[] }).children.push("seatsTile");
	assert.deepEqual(refusals(p, messages), []);
	const el = await mountSurface(p.getSurface("card"));
	try {
		const tile = deepQuery(el, "piary-a2ui-stat");
		assert.ok(tile, "the custom element rendered without a manual customElements.define");
		assert.match(visibleText(tile), /Seats 12/, "its bound value resolved from the data model");
		assert.ok(deepQuery(el, "a2ui-card"), "the basic components still render under the Piary catalog id");
	} finally {
		el.remove();
	}
	const { processor: strict } = processor(piaryCatalog);
	const [refusal] = refusals(strict, [
		{
			version: "1.0",
			createSurface: {
				surfaceId: "bad-stat",
				catalogId: piaryCatalog.id,
				components: [{ id: "root", component: "Stat", label: "Seats" }],
			},
		},
	]);
	assert.match(refusal ?? "", /Stat.*value/s, "the custom component's schema is enforced like a basic one's");
});

test("a v0.9 message list — createSurface, then updateComponents — renders through the same element", async () => {
	const { processor: p } = processor(basicCatalogV09);
	assert.deepEqual(
		refusals(p, [
			{ version: "v0.9", createSurface: { surfaceId: "old", catalogId: basicCatalogV09.id } },
			{
				version: "v0.9",
				updateComponents: {
					surfaceId: "old",
					components: [
						{ id: "root", component: "Column", children: ["h", "t"] },
						{ id: "h", component: "Text", variant: "h2", text: "Team plan" },
						{ id: "t", component: "Text", text: "Everything in Solo." },
					],
				},
			},
		]),
		[],
	);
	const el = await mountSurface(p.getSurface("old"));
	try {
		assert.equal(deepQuery(el, "h2")?.textContent, "Team plan", "v0.9 still has heading variants");
	} finally {
		el.remove();
	}
});

test("a payload that breaks the catalog is refused with a message naming what is wrong", () => {
	const cases: Array<[string, unknown[], RegExp]> = [
		["unknown component", [{ id: "root", component: "Chart", data: [1] }], /Unknown component type 'Chart'/],
		["dangling child", [{ id: "root", component: "Card", child: "missing" }], /non-existent component 'missing'/],
		["missing root", [{ id: "top", component: "Text", text: "x" }], /Missing root/],
		[
			"orphan",
			[
				{ id: "root", component: "Text", text: "x" },
				{ id: "spare", component: "Text", text: "y" },
			],
			/'spare' is not reachable/,
		],
		["v0.9 variant in v1.0", [{ id: "root", component: "Text", text: "x", variant: "h1" }], /Expected caption \| body/],
		["unknown property", [{ id: "root", component: "Text", text: "x", color: "red" }], /Unrecognized key.*color/],
		["hyphenated id", [{ id: "root", component: "Card", child: "the-body" }, { id: "the-body", component: "Text", text: "x" }], /UAX #31/],
	];
	for (const [name, components, expected] of cases) {
		const { processor: p } = processor();
		const found = refusals(p, surfaceOf(name.replace(/\W/g, ""), components));
		assert.equal(found.length, 1, `${name}: one refusal`);
		assert.match(found[0]!, expected, name);
		// The surface is created before its components are refused, so an
		// errored payload leaves an EMPTY surface, not none: whether a view
		// failed is read from the refusals, never from the surface's presence.
		assert.equal(p.getSurface(name.replace(/\W/g, ""))?.componentsModel.get("root"), undefined, `${name}: no root`);
	}
});
