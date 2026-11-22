// The notebook engine (integration plan, phase 1): reactive cells for the
// document, powered by @observablehq/notebook-kit — its transpiler (implicit
// dependencies, viewof/mutable, npm: imports rewritten to CDN URLs at
// transpile time) and its runtime (the Observable dataflow graph).
//
// Containment rule: notebook-kit is a 2.x technology preview, pinned to an
// exact version — every import of it lives in src/notebook/, so API churn
// stops here. Nothing else in Piary may import @observablehq/notebook-kit.
//
// Environments: the /runtime entry reads `document` at import time, so this
// module is browser-first. Headless callers (node --test) must shim
// globalThis.document *before* importing this module — see
// tests/integration/engine.test.ts.
//
// The transpiler (acorn + lezer) is heavy, and documents without cells must
// not pay for it: the canvas lazy-loads this module on the first pi:cell
// segment.
import type { CellMode } from "@observablehq/notebook-kit";
import {
	type DefineState,
	type Definition,
	FileAttachment,
	library,
	NotebookRuntime,
	observe,
} from "@observablehq/notebook-kit/runtime";
import { chartPalette } from "../utils/chart-palette.ts";
import { loadPlot } from "../utils/plot.ts";
import { compileCell, declaredNames, readNames } from "./compile.ts";
import { plotOptions } from "./plot-defaults.ts";
import { emptyPlotData } from "./plot-empty.ts";

export type { CellMode };

/** The lifecycle of one cell's latest evaluation. `pending` while the runtime
 *  recomputes (including when an *input* cell changed), then `fulfilled` with
 *  the cell's value — for declaration cells, a record of its exports — or
 *  `rejected` with the runtime error. */
export type CellState =
	| { status: "pending" }
	| { status: "fulfilled"; value: unknown }
	| { status: "rejected"; error: unknown };

/** Thrown by upsertCell when the source doesn't compile. The cell's previous
 *  definition (if any) stays live — a half-typed edit never tears down a
 *  running cell. */
export class CellSyntaxError extends Error {
	override name = "CellSyntaxError";
	constructor(
		readonly cellId: string,
		cause: unknown,
	) {
		super(cause instanceof Error ? cause.message : String(cause), { cause });
	}
}

export interface NotebookEngineOptions {
	/** Observes every cell status transition — the hook for the rail badge
	 *  (phase 2) and for feeding errors back to the agent (phase 4).
	 *  Equivalent to calling subscribe() right after construction. */
	onState?: (id: string, state: CellState) => void;
	/** Where a cell's `FileAttachment(name)` resolves `name`: the host's URL for
	 *  the workspace root. Unset, it resolves against `document.baseURI`, as
	 *  notebook-kit's own does. A leading `/` means this root too. */
	fileBase?: string;
}

export type StateListener = (id: string, state: CellState) => void;

export interface UpsertOptions {
	/** Cell language; defaults to js. */
	mode?: CellMode;
	/** When given, notebook-kit's display observer renders the cell's output
	 *  (via its Inspector) into this element, and the display/view builtins
	 *  are defined. Without it the cell runs headless — values still flow
	 *  through the dataflow graph and onState. */
	root?: HTMLDivElement;
}

interface CellRecord {
	/** notebook-kit wants small positive integers; document ids are strings. */
	numericId: number;
	/** Bumped on every redefine/remove: observers of deleted variables can
	 *  still fire (deletion recomputes the graph), and a stale generation is
	 *  how we know to drop those events. */
	generation: number;
	source: string;
	mode: CellMode;
	state: CellState;
	/** The names this cell's current definition declares, as its source
	 *  spells them (`declaredNames`) — lets the UI say “defines walk — nothing displayed” instead of
	 *  rendering a silent blank for headless declaration cells. */
	outputs: string[];
	/** The names its current definition reads from other cells and the library. */
	inputs: string[];
	/** The live runtime variables backing this cell's current definition. */
	variables?: DefineState["variables"];
	/** The display root the cell renders into — where restore() finds the
	 *  view() input element. Absent for headless cells. */
	root?: HTMLDivElement;
	/** The definition calls the view() builtin, or is an `ojs` `viewof` — its
	 *  outputs are widget state (restorable), not derived data. */
	usesView?: boolean;
}

/** A `view()` cell's rendered input: the first form or control in its root
 *  (one `view()` per cell is the documented idiom). */
type Widget = Element & { value: unknown };

function widgetIn(root: ParentNode): Widget | null {
	const el = root.querySelector("form, input, select, textarea");
	return el && "value" in el ? (el as Widget) : null;
}

/** Set a widget the way a user would: value, then `input`, which is what
 *  re-runs its dependents. */
function setWidget(el: Widget, value: unknown): void {
	try {
		el.value = value;
		el.dispatchEvent(new Event("input", { bubbles: true }));
	} catch {} // readonly value / hostile widget — skip, don't stall the rest
}

/** Sufficient for clear()/define() when a cell runs without display. */
const headlessRoot = () =>
	({
		childNodes: [],
		appendChild() {},
		removeChild() {},
		replaceChildren() {},
	}) as unknown as HTMLDivElement;

/**
 * A `state()` cell's backing element — a `view()` with no widget.
 *
 * `view()` is the only reactive-input path the transpiler supports (`autoview`
 * rewrites `const x = view(…)` into a generator-driven variable), and it wants
 * something with `value` and `input` events. So state gets exactly that, in a
 * span that renders nothing: cells read it like any other view, `display`
 * appends an invisible node, and `viewStateNames` already counts it as widget
 * state worth persisting.
 *
 * Why this rather than a plain builtin returning a value: a plain builtin is
 * evaluated once, so `setState` could never make dependents re-run — the whole
 * point.
 */
interface StateCell extends HTMLSpanElement {
	value: unknown;
}

type Plot = Awaited<ReturnType<typeof loadPlot>>;

/** Set on a chart that named no width, for the theme to keep it as wide as its
 *  column (src/styles/cell-theme.css). */
const FILL_ATTRIBUTE = "data-plot-fill";

/** Set on a chart drawn from no data at all (`emptyPlotData`), and the empty
 *  values it was drawn from: what `emptyChart` names them by. */
const EMPTY_ATTRIBUTE = "data-plot-empty";
const emptyCharts = new WeakMap<Element, readonly unknown[]>();

/** A chart with no data, as the verdict on a cell reports it: the cell showing
 *  it, and the declared names of the empty values it was drawn from (none when
 *  the chart was handed an expression no cell names). */
export interface EmptyChart {
	cell: string;
	names: string[];
}

/** How long one name may take to answer before `values` and `emptyChart` go
 *  on without it: a generator pending forever must not stall either. */
const VALUE_WAIT_MS = 250;

/** The width a chart fills: the column cells draw in, measured when the chart
 *  is made. Undefined before any cell has a layout, and under jsdom. */
const columnWidth = () => [...document.querySelectorAll(".cell-output")].find((out) => out.clientWidth > 0)?.clientWidth;

/**
 * Plot as a cell sees it: every export as it is, and a `plot` that draws with
 * Piary's defaults (`plotOptions`), so a cell writes plain `Plot.plot` and no
 * colour. A mark's own `.plot()` is Plot's and takes none of them.
 */
function withDefaults(Plot: Plot): Plot {
	return {
		...Plot,
		plot(options = {}) {
			let themed = options;
			try {
				themed = plotOptions(options, chartPalette(document.body), columnWidth());
			} catch {
				// The defaults read a chart's marks ahead of Plot. Whatever they
				// trip on, the chart is still Plot's to draw, or to refuse in its own words.
			}
			const chart = Plot.plot(themed);
			if (options.width === undefined) chart.setAttribute(FILL_ATTRIBUTE, "");
			const empty = emptyPlotData(options);
			if (empty) {
				chart.setAttribute(EMPTY_ATTRIBUTE, "");
				emptyCharts.set(chart, empty);
			}
			return chart;
		},
	};
}

/** One reactive module — one engine per document. Cells are addressed by the
 *  document's block ids; edits re-run exactly the dependent cells. */
export class NotebookEngine {
	readonly #nb: NotebookRuntime;
	readonly #cells = new Map<string, CellRecord>();
	readonly #listeners = new Set<StateListener>();
	#nextId = 1;
	/** Live `state()` elements by key. */
	readonly #store = new Map<string, StateCell>();
	/** Values restored from the document, consulted by `state()` in place of
	 *  its `initial` argument. Seeded before any cell runs, so a reload paints
	 *  the saved state once rather than the default and then the saved state. */
	#storeSeed: Record<string, unknown> = {};

	constructor(options: NotebookEngineOptions = {}) {
		// SPREAD the stdlib, never replace it: the constructor's `builtins`
		// parameter defaults to the whole library, so passing a bare object of
		// two names takes `d3`, `Plot`, `Inputs`, `htl`, `FileAttachment` and the
		// rest away from every cell in the document.
		const { fileBase } = options;
		this.#nb = new NotebookRuntime({
			...library,
			// The app's own Plot in place of the library's CDN one, so a cell's
			// chart needs no network and is the copy an a2ui Chart draws with.
			Plot: () => loadPlot().then(withDefaults),
			state: () => (key: string, initial: unknown) => this.stateCell(key, initial),
			setState: () => (key: string, value: unknown) => this.setState(key, value),
			...(fileBase !== undefined && { FileAttachment: () => workspaceFiles(fileBase) }),
		});
		if (options.onState) this.#listeners.add(options.onState);
		this.#installBackgroundPump();
	}

	/** The element backing `state(key, …)`, created on first use. The seeded
	 *  value wins over `initial`: the document is the store.
	 *
	 *  Public because the host drives state too — restoring it, and (one day)
	 *  resetting an artifact — through the same door a cell uses. */
	stateCell(key: string, initial: unknown): StateCell {
		let el = this.#store.get(key);
		if (!el) {
			el = document.createElement("span") as StateCell;
			el.style.display = "none";
			el.value = key in this.#storeSeed ? this.#storeSeed[key] : initial;
			this.#store.set(key, el);
		}
		return el;
	}

	/** Write from anywhere — an event handler, another cell. Dispatching `input`
	 *  is Observable's own set() idiom: indistinguishable from a user typing
	 *  into a widget, so the dataflow graph re-runs dependents. */
	setState(key: string, value: unknown): void {
		const el = this.stateCell(key, value);
		el.value = value;
		el.dispatchEvent(new Event("input", { bubbles: true }));
	}

	/** Saved state → the store, BEFORE any cell defines. Later cells calling
	 *  `state(key, initial)` then start from what the document holds. */
	seedStore(values: Record<string, unknown>): void {
		this.#storeSeed = { ...this.#storeSeed, ...values };
		// Keys already live (a re-seed, or a document that loaded mid-flight)
		// take the value the same way a user interaction would.
		for (const [key, value] of Object.entries(values)) if (this.#store.has(key)) this.setState(key, value);
	}

	/** Current `state()` values by key — the half of the persisted payload that
	 *  is addressed by key rather than by export name. */
	storeValues(): Record<string, unknown> {
		return Object.fromEntries([...this.#store].map(([key, el]) => [key, el.value]));
	}

	/** The runtime schedules computes on requestAnimationFrame — which never
	 *  fires in occluded windows (Chrome parks them), so agent-authored cells
	 *  in a background tab would sit pending until the user looks. Race the
	 *  frame against a heartbeat timer: visible pages win the race with rAF
	 *  (unchanged behavior); hidden pages compute on the (throttled) timer. */
	#installBackgroundPump(): void {
		if (typeof requestAnimationFrame !== "function") return; // headless — keep the runtime's own scheduling
		const raf = requestAnimationFrame;
		const rt = this.#nb.runtime as unknown as {
			_computeSoon(): Promise<void>;
			_computeNow(): void;
			_computing: Promise<void> | null;
			_disposed: boolean;
		};
		rt._computeSoon = function () {
			return new Promise<void>((resolve) => {
				raf(() => resolve());
				setTimeout(resolve, 250); // settled promises ignore the loser
			}).then(() => (this._disposed ? undefined : this._computeNow()));
		};
		// The Runtime constructor schedules its first compute for the builtin
		// module before this override lands. If that compute is parked on a
		// frame that never fires, it blocks all future scheduling (_computing
		// stays truthy) — reschedule it through the pump. A double _computeNow
		// is safe: the second run sees empty dirty sets.
		if (rt._computing) rt._computing = rt._computeSoon();
	}

	/** Adds a cell-state listener (all cells; filter by id in the listener).
	 *  Returns the unsubscriber. */
	subscribe(listener: StateListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/** Defines the cell, or — when it already exists — deletes its variables
	 *  and defines the new source in place; the runtime re-runs dependents.
	 *  Throws CellSyntaxError (previous definition stays live) on bad source. */
	upsertCell(id: string, source: string, { mode = "js", root }: UpsertOptions = {}): void {
		const prev = this.#cells.get(id);
		const numericId = prev?.numericId ?? this.#nextId++;

		// Compile first: a syntax error must not touch the running graph.
		let t;
		try {
			t = compileCell(numericId, source, mode);
		} catch (error) {
			throw new CellSyntaxError(id, error);
		}
		// The body is a function's source, read as an expression: a `js` cell's
		// is an arrow, an `ojs` cell's a `function`, named after the cell when it
		// has a name. Bare, that one is a declaration, which evaluates to nothing
		// and defines the name on the global object; without a name it does not
		// parse. The newline keeps a trailing line comment off the parenthesis.
		const body = (0, eval)(`(${t.body}\n)`) as Definition["body"];

		// What the user set on this cell's widget, read before the old definition
		// goes: a redefinition that keeps the export name keeps the value
		// (`docs/notebook-cells.md` §Persisting state).
		const widget = prev?.usesView && prev.root ? widgetIn(prev.root) : null;
		const kept = widget ? { names: prev?.outputs ?? [], value: widget.value, stale: widget } : null;
		if (prev) this.#deleteVariables(prev);
		const record: CellRecord =
			prev ??
			({ numericId, generation: 0, source, mode, state: { status: "pending" }, outputs: [], inputs: [] } as CellRecord);
		record.generation++;
		record.source = source;
		record.mode = mode;
		record.outputs = declaredNames(t);
		record.inputs = readNames(t);
		record.root = root;
		record.usesView = (t.inputs?.includes("view") ?? false) || t.autoview === true;
		this.#cells.set(id, record);

		const definition: Definition = {
			id: numericId,
			body,
			inputs: t.inputs,
			outputs: t.outputs,
			output: t.output,
			autodisplay: root ? t.autodisplay : false,
			autoview: t.autoview,
			automutable: t.automutable,
			display: Boolean(root),
		};
		const state: DefineState = { variables: [], expanded: [], root: root ?? headlessRoot() };
		record.variables = state.variables;

		const generation = record.generation;
		const set = (next: CellState) => {
			record.state = next;
			for (const listener of this.#listeners) listener(id, next);
		};
		// A new definition is pending by definition — don't let the previous
		// value masquerade as current until the (possibly throttled) compute.
		set({ status: "pending" });
		if (kept && root && record.usesView && kept.names.some((name) => record.outputs.includes(name)))
			void this.#keep(root, kept.value, kept.stale);
		this.#nb.define(state, definition, (s, d) => {
			// The inspector prints a value or an error under the definition's
			// output name, which for `viewof x` is the transpiler's `viewof$x`:
			// shown as the source spells it, the way `mutable x` already is.
			const inner = root ? observe(s, { ...d, output: d.output?.replace(/^viewof\$/, "viewof ") }) : undefined;
			// _node feeds the runtime's visibility promise; _error is only touched
			// by inner's own methods (via `this`), so a fresh false here is inert.
			// A deleted variable still fulfils once, with nothing: the observer
			// of a definition that has been replaced touches neither the state
			// nor the root, which its successor is drawing into.
			const live = () => record.generation === generation;
			return {
				_error: false,
				_node: s.root,
				pending: () => {
					if (!live()) return;
					inner?.pending();
					set({ status: "pending" });
				},
				fulfilled: (value: unknown) => {
					if (!live()) return;
					inner?.fulfilled(value);
					set({ status: "fulfilled", value });
				},
				rejected: (error: unknown) => {
					if (!live()) return;
					inner?.rejected(error);
					set({ status: "rejected", error });
				},
			};
		});
	}

	/** Push a kept widget value into the widget a redefinition renders, once it
	 *  has replaced `stale`. Same idiom and time bound as `restore`. */
	async #keep(root: HTMLDivElement, value: unknown, stale: Widget, timeout = 2000): Promise<void> {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const el = widgetIn(root);
			if (el && el !== stale) return setWidget(el, value);
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	/** Deletes the cell's variables and what it drew; dependent cells reject
	 *  with a missing-input error, which is honest — their input is gone. */
	removeCell(id: string): void {
		const record = this.#cells.get(id);
		if (!record) return;
		record.generation++;
		this.#deleteVariables(record);
		// Its observer is no longer heard, so nothing else takes the output away.
		record.root?.replaceChildren();
		this.#cells.delete(id);
	}

	/** The latest observed state, or undefined for unknown ids. */
	state(id: string): CellState | undefined {
		return this.#cells.get(id)?.state;
	}

	/** The names the cell's current definition declares — empty for pure
	 *  expression cells and unknown ids. */
	outputs(id: string): string[] {
		return this.#cells.get(id)?.outputs ?? [];
	}

	/** The cells that read what `id` declares, and the cells that read those:
	 *  everything a change to `id` re-runs. */
	readers(id: string): string[] {
		const found = new Set<string>([id]);
		for (const from of found) {
			const names = this.#cells.get(from)?.outputs ?? [];
			for (const [other, record] of this.#cells) if (record.inputs.some((name) => names.includes(name))) found.add(other);
		}
		found.delete(id);
		return [...found];
	}

	/** The first chart with no data that `id` or a cell reading it shows, or
	 *  null: a chart every data mark of which was given zero rows. */
	async emptyChart(id: string): Promise<EmptyChart | null> {
		for (const cell of [id, ...this.readers(id)]) {
			const chart = this.#cells.get(cell)?.root?.querySelector(`[${EMPTY_ATTRIBUTE}]`);
			const data = chart && emptyCharts.get(chart);
			if (!data) continue;
			const declared = [...this.#cells.values()].flatMap((record) => record.outputs);
			const values = await Promise.all(declared.map((name) => this.#settled(name)));
			return { cell, names: declared.filter((_, i) => data.includes(values[i])) };
		}
		return null;
	}

	/** The value of a declared name, or undefined when it rejects or takes
	 *  longer than `VALUE_WAIT_MS`. */
	#settled(name: string): Promise<unknown> {
		return Promise.race([this.#nb.main.value(name).catch(() => undefined), new Promise<undefined>((r) => setTimeout(() => r(undefined), VALUE_WAIT_MS))]);
	}

	/** Snapshot for the agent-feedback loop (phase 4). */
	snapshot(): Array<{ id: string; source: string; mode: CellMode; state: CellState }> {
		return [...this.#cells].map(([id, r]) => ({
			id,
			source: r.source,
			mode: r.mode,
			state: r.state,
		}));
	}

	/** Resolves a named cell output from the dataflow graph. */
	value(name: string): Promise<unknown> {
		return this.#nb.main.value(name);
	}

	/** Names exported by cells that call the view() builtin — widget state
	 *  worth persisting, as opposed to derived data. */
	viewStateNames(): string[] {
		const names: string[] = [];
		for (const record of this.#cells.values()) if (record.usesView) names.push(...record.outputs);
		return names;
	}

	/** Push saved widget state back into view() inputs: find each cell's
	 *  rendered input element and set value + dispatch `input` — Observable's
	 *  own set() idiom, indistinguishable from a user interaction, so the
	 *  dataflow graph re-runs dependents. Polls briefly: elements appear when
	 *  the runtime's display observer fires. Unknown names and headless cells
	 *  are skipped. */
	async restore(values: Record<string, unknown>, timeout = 2000): Promise<void> {
		// ponytail: first form/input per root wins — one view() per cell is the
		// documented idiom; index by output order if multi-view cells ever matter.
		const pending: { root: HTMLDivElement; value: unknown }[] = [];
		for (const record of this.#cells.values()) {
			if (!record.usesView || !record.root) continue;
			for (const name of record.outputs) {
				if (name in values) pending.push({ root: record.root, value: values[name] });
			}
		}
		const start = Date.now();
		while (pending.length && Date.now() - start < timeout) {
			for (let i = pending.length - 1; i >= 0; i--) {
				const el = widgetIn(pending[i].root);
				if (!el) continue;
				setWidget(el, pending[i].value);
				pending.splice(i, 1);
			}
			if (pending.length) await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	/** JSON-safe snapshot of every named export's current value — the raw
	 *  material for including interactive cell state (view() inputs, derived
	 *  data) in the agent's context. Names whose values don't serialize (DOM
	 *  nodes, functions, cycles), exceed maxLength, or are pending/rejected
	 *  are omitted — dropped, not truncated: partial JSON misleads. */
	async values(maxLength = 2000, budget = 16000): Promise<Record<string, unknown>> {
		const out: Record<string, unknown> = {};
		// Map/Set stringify to "{}" — a full Map reading as empty misleads worse
		// than absence, so drop them (nested included) like DOM nodes.
		const replacer = (_: string, v: unknown) => (v instanceof Map || v instanceof Set ? undefined : v);
		let spent = 0;
		for (const record of this.#cells.values()) {
			for (const name of record.outputs) {
				if (spent >= budget) return out; // ponytail: total cap — first names win; prioritize if it bites
				const value = await this.#settled(name);
				if (typeof Node !== "undefined" && value instanceof Node) continue;
				try {
					const json = JSON.stringify(value, replacer);
					if (json !== undefined && json.length <= maxLength) {
						out[name] = JSON.parse(json);
						spent += json.length;
					}
				} catch {
					/* cyclic or hostile toJSON — skip */
				}
			}
		}
		return out;
	}

	dispose(): void {
		for (const id of [...this.#cells.keys()]) this.removeCell(id);
		this.#store.clear();
		this.#storeSeed = {};
		this.#nb.runtime.dispose();
	}

	#deleteVariables(record: CellRecord): void {
		for (const variable of record.variables ?? []) variable.delete();
		record.variables = [];
	}
}

/** notebook-kit's `FileAttachment`, resolving every name against `base`. A
 *  name with a leading `/` is the root's too: `new URL` would keep it as
 *  `base`'s own root, which is the same place only while `base` has no path. */
function workspaceFiles(base: string): (name: string) => ReturnType<typeof FileAttachment> {
	const files = (name: string) => FileAttachment(String(name).replace(/^\/+/, ""), base);
	// `instanceof FileAttachment` in a cell still holds for what this returns.
	files.prototype = FileAttachment.prototype;
	return files;
}
