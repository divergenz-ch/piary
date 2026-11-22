// Code coloring, in one place. Two editors show cell source — the markdown
// buffer (a fence, once `codeLanguages` has parsed it) and the artifact's code
// pane — and a cell that changes color when you open the code tab would read as
// two different pieces of code. Same tags, same tokens, both.
//
// The token classes are the ones src/styles/utils/syntax-highlighting.css
// paints.
import type { TagStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const CODE_TAGS: TagStyle[] = [
	{ tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: "var(--syntax-keyword)" },
	{
		tag: [
			tags.function(tags.variableName),
			tags.function(tags.propertyName),
			tags.definition(tags.variableName),
			tags.className,
		],
		color: "var(--syntax-entity)",
	},
	{
		tag: [tags.number, tags.bool, tags.null, tags.atom, tags.constant(tags.variableName)],
		color: "var(--syntax-constant)",
	},
	{ tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--syntax-string)" },
	{ tag: [tags.typeName, tags.namespace], color: "var(--syntax-variable)" },
	{ tag: tags.lineComment, color: "var(--syntax-comment)" },
	{ tag: tags.blockComment, color: "var(--syntax-comment)" },
];
