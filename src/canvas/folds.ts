// Which blocks and segments are collapsed, and the bookkeeping that keeps a
// fold attached to the right thing.
//
// Functions over an `EditorView` rather than a class: this cluster owns no
// state of its own — `foldsField` holds it — so what was extracted is the
// method family, not a state cluster (ADR 0009's tell 4). The element keeps the
// public verbs and the event, because the page calls them.

import type { EditorView } from "@codemirror/view";

import {
	blockFoldKey,
	blockFoldsIn,
	docField,
	foldKey,
	foldsField,
	setFoldsEffect,
	toggleFoldEffect,
} from "../components/editor-state.ts";

/** The collapsed blocks, as the offsets a host persists. */
export function blockFolds(view: EditorView): number[] {
	return blockFoldsIn(view.state.field(foldsField));
}

/** Collapses or expands a whole block, named by its head-marker offset. */
export function toggleBlockFold(view: EditorView, from: number): void {
	view.dispatch({ effects: toggleFoldEffect.of(blockFoldKey(from)) });
}

/**
 * Restores collapsed blocks from what a host persisted. Offsets that no longer
 * land on a block head are simply ignored by the decorator.
 *
 * Only the block keys are replaced — the other folds in the set belong to this
 * buffer's own session, and a host restoring block state has nothing to say
 * about them.
 */
export function setBlockFolds(view: EditorView, folds: readonly number[]): void {
	const kept = [...view.state.field(foldsField)].filter((key) => !key.startsWith("block@"));
	view.dispatch({ effects: setFoldsEffect.of([...kept, ...folds.map(blockFoldKey)]) });
}

/**
 * Drops the fold state of the segment at `from`, which is about to leave the
 * document.
 *
 * `foldKey` is `kind#id` where a segment has an id and `kind@from` where it
 * does not. The offset form rides the splice like any other position; the id
 * form does not, so a deleted tool call's "folded" bit would outlive it and
 * greet the next call that happened to reuse the id. Addressed by offset rather
 * than by key because the key's shape is this module's business — the caller
 * names the segment, not the bookkeeping.
 *
 * Called BEFORE the delete, while the segment is still there to name.
 */
export function purgeSegmentFolds(view: EditorView, from: number): void {
	const seg = view.state.field(docField).parsed.segments.find((candidate) => candidate.from === from);
	if (!seg) return;
	const folds = view.state.field(foldsField);
	const key = foldKey(seg);
	if (!folds.has(key)) return;
	view.dispatch({ effects: setFoldsEffect.of([...folds].filter((candidate) => candidate !== key)) });
}
