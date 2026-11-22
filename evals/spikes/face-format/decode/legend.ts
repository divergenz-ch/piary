// What the system prompt says about a face block, for the decode runs: nothing, the grammar
// alone, or the grammar with the table of codes. Built from the same table the serializers use.
import { CODES, INTENSITY, RENDERINGS } from "../timeline.ts";

const GRAMMAR = (unit: string) => `
## The user's face

A message may end with a \`[face/1]\` block: what a camera saw of the user's face, one line per observation, in time order.

- \`r <seconds> <run>\`: while reading your last answer, starting that many seconds after it appeared. Where the user was looking is not known.
- \`t "<text>" <run>\`: while typing that text of the message. \`"a…b"\` is one stretch of text from a to b. \`#2\` after the quote means its second occurrence in the message.
- \`p "<text>" <seconds> <run>\`: the user stopped typing for that many seconds with the caret right after that text.
- \`d "<text>" <run>\`: while typing text that was then deleted.

A run is steps in order, joined by \` > \`. A step is the movements held together, joined by \`+\`, then how long in seconds. ${unit}
`;

const table = (key: (code: number) => string) =>
	Object.keys(CODES)
		.map((code) => `${key(Number(code))} ${CODES[Number(code)]!.words}`)
		.join(", ");
const letters = Object.entries(INTENSITY)
	.map(([letter, word]) => `${letter} ${word}`)
	.join(", ");

/** The formats whose codes or names were tried on the agent, each with its legends. Their
 *  records stay in a run's directory and in its scores; a run asks for them only with
 *  `FORMATS=old`. */
export const OLD: Record<string, Record<string, string>> = {
	codes: {
		none: "",
		grammar: GRAMMAR(`A movement is a FACS code with its intensity letter (${letters}).`),
		full: GRAMMAR(`A movement is a FACS code with its intensity letter (${letters}). Codes: ${table(String)}.`),
	},
	names: {
		none: "",
		grammar: GRAMMAR(`A movement is a name, a colon and its intensity letter (${letters}).`),
	},
	json: { none: "" },
};
/** The plain-words renderings: no legend for any, since one that needs a legend has failed.
 *  `FORMATS` naming renderings (`FORMATS=clipped`) asks for those alone. */
const asked = (process.env.FORMATS ?? "").split(" ").filter((f) => (RENDERINGS as readonly string[]).includes(f));
export const LEGENDS: Record<string, Record<string, string>> = { ...(process.env.FORMATS === "old" ? OLD : {}), ...Object.fromEntries(RENDERINGS.filter((r) => asked.length === 0 || asked.includes(r)).map((r) => [r, { none: "" }])) };
