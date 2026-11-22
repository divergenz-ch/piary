// A cell's compile step: source in, notebook-kit's transpiled cell out, or a
// throw for source that does not parse. It imports the transpiler alone, never
// `/runtime` (which reads `document` at import time), so plain node can ask
// whether a cell compiles without a page.
import { maybeParseJavaScript, toCell, transpile, type CellMode } from "@observablehq/notebook-kit";

/** notebook-kit displays a cell's value only when the whole source parses as
 *  one expression; `htl.svg\`…\`;` is not at end-of-file after the expression,
 *  so it becomes a program that returns nothing — the cell fulfills with
 *  undefined and the page shows an empty frame, no error anywhere. Agents and
 *  editors add that semicolon by reflex, so strip exactly one trailing `;`
 *  when what remains is an expression. `a; b;` stays a program. */
export function unterminateExpression(source: string, mode: CellMode): string {
	if (mode !== "js" && mode !== "ts") return source;
	const trimmed = source.trimEnd();
	if (!trimmed.endsWith(";")) return source;
	const stripped = trimmed.slice(0, -1);
	return maybeParseJavaScript(stripped, mode)?.expression ? stripped : source;
}

/** The transpiled cell. `numericId` is notebook-kit's own small positive
 *  integer for the cell, not the document's id. */
export function compileCell(numericId: number, source: string, mode: CellMode) {
	return transpile(toCell({ id: numericId, value: unterminateExpression(source, mode), mode }));
}

type Transpiled = ReturnType<typeof compileCell>;

/** A name without the spelling the transpiler gives a `viewof` or `mutable`
 *  one: `viewof$x`, `mutable$x` and `mutable x` are all the author's `x`. */
const bare = (name: string) => name.replace(/^(?:viewof\$|mutable\$|mutable )/, "");

/** The names a cell declares, as its source spells them. A `js` cell lists
 *  them as `outputs`; an `ojs` cell has one at most, as `output`. */
export function declaredNames(t: Transpiled): string[] {
	return t.outputs ?? (t.output == null ? [] : [bare(t.output)]);
}

/** The names a cell reads, spelled as `declaredNames` spells them, so a reader
 *  of `viewof x` or `mutable x` is found by the cell that declares `x`. */
export function readNames(t: Transpiled): string[] {
	return (t.inputs ?? []).map(bare);
}
