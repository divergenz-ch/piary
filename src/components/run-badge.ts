// The run badge: what a turn is doing and for how long, as the first thing in
// the answer block that turn writes (ADR 0031). The host decides the words; this
// puts them where the turn happens rather than at the top of the page.
//
// Its own field, anchored where the turn's region opened and mapped through
// every edit, so it rides along as the answer grows and stays put once the
// turn is over — until the next turn moves it.
import { type EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { docField } from "./editor-state.ts";

interface RunBadge {
	pos: number;
	label: string;
	budget: string;
}

/** A turn opened at `pos`: the badge moves there, blank until it is told. */
export const placeRunBadge = StateEffect.define<number>();
/** What the badge says now; `null` takes it away. */
export const setRunBadge = StateEffect.define<{ label: string; budget: string } | null>();

class RunBadgeWidget extends WidgetType {
	constructor(
		readonly label: string,
		readonly budget: string,
		readonly opensBlock: boolean,
	) {
		super();
	}
	override eq(other: RunBadgeWidget): boolean {
		return other.label === this.label && other.budget === this.budget && other.opensBlock === this.opensBlock;
	}
	toDOM(): HTMLElement {
		const el = document.createElement("div");
		// Opening the block, it carries the block's top gap itself, so the gap
		// sits above it and not between it and the line it heads.
		el.className = this.opensBlock ? "doc-run-badge doc-run-badge-first" : "doc-run-badge";
		const label = document.createElement("span");
		label.className = "doc-run-label";
		label.textContent = this.label;
		el.append(label);
		if (this.budget) {
			const budget = document.createElement("span");
			budget.className = "doc-run-budget";
			budget.textContent = this.budget;
			el.append(budget);
		}
		return el;
	}
}

function decorations(state: EditorState, badge: RunBadge | null): DecorationSet {
	if (!badge?.label) return Decoration.none;
	// Before the line the turn opened at, never after it: that line may be a
	// segment the canvas draws as nothing (a `budget` call, a cell gathered into
	// its artifact), and a widget inside a hidden range is not drawn either.
	const line = state.doc.lineAt(Math.min(badge.pos, state.doc.length));
	const { parsed, blocks } = state.field(docField);
	const opens = blocks.some((block) => parsed.segments[block.opensAt]?.from === line.from);
	return Decoration.set([Decoration.widget({ widget: new RunBadgeWidget(badge.label, badge.budget, opens), block: true, side: -1 }).range(line.from)]);
}

export const runBadgeField = StateField.define<RunBadge | null>({
	create: () => null,
	update(value, tr) {
		// Mapped toward the left, so the answer streaming in at the anchor lands
		// below the badge, not above it.
		if (value && tr.docChanged) value = { ...value, pos: tr.changes.mapPos(value.pos, -1) };
		for (const e of tr.effects) {
			if (e.is(placeRunBadge)) value = { pos: e.value, label: "", budget: "" };
			else if (e.is(setRunBadge)) value = e.value && value ? { ...value, ...e.value } : null;
		}
		return value;
	},
	provide: (f) => EditorView.decorations.compute([f], (state) => decorations(state, state.field(f))),
});
