/** True when a js/ts cell starts with a top-level declaration and never
 *  references display()/view(). notebook-kit only autodisplays pure
 *  expression cells, so such a cell runs headless and renders nothing —
 *  the classic footgun is `const anim = (function* () { … yield canvas })()`
 *  animating invisibly. Heuristic on purpose (no parser dependency): an
 *  expression cell can never start with a declaration keyword, so checking
 *  the first non-comment token is exact for the display question.
 *
 *  Dep-free module (unlike cell.ts, which imports typebox) so tests can
 *  import it directly under node's type stripping.
 */
export function rendersNothing(source: string, mode = "js"): boolean {
	if (mode !== "js" && mode !== "ts") return false;
	let s = source;
	for (;;) {
		s = s.replace(/^\s+/, "");
		if (s.startsWith("//")) {
			s = s.replace(/^\/\/[^\n]*/, "");
			continue;
		}
		if (s.startsWith("/*")) {
			const end = s.indexOf("*/");
			if (end < 0) return false; // unterminated — syntax error's problem, not ours
			s = s.slice(end + 2);
			continue;
		}
		break;
	}
	if (!/^(?:async\s+function[\s*(]|function[\s*(]|class[\s{]|const\s|let\s|var\s|import[\s({"'*])/.test(s)) {
		return false;
	}
	return !/\b(?:display|view)\s*\(/.test(source);
}
