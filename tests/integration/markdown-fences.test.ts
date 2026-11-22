// A prose code block's fence lines in the real editor — run pnpm build first.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, unmount } from "../helpers/editor.ts";

const PROSE = "Here it is:\n\n```text\nsrc/\n  app.ts\n```\n\nand a bare one:\n\n```\nbare\n```\n\nDone.";
const md =
	`<!-- you -->\n\nshow me\n\n<!-- pi -->\n\n${PROSE}\n\n` +
	'<!-- pi:tool bash #t1 -->\n\n```json\n{"command":"ls"}\n```\n\n<!-- pi:result #t1 -->\n\n```\nout\n```\n\n' +
	"<!-- pi:cell js #aa -->\n\n```js\n1 + 1\n```\n\n<!-- you -->\n\n";

/** The text of every line the live markdown collapsed as a fence line. */
const collapsed = (root: HTMLElement) => [...root.querySelectorAll(".cm-line.doc-md-fence")].map((line) => line.textContent);

test("a pi answer's code block hides its fence lines; a tool's, a result's and a cell's keep theirs", async () => {
	const { el, view } = await mount(md);
	try {
		view.dispatch({ selection: { anchor: view.state.doc.length } });
		assert.deepEqual(collapsed(view.contentDOM), ["```text", "```", "```", "```"]);
		const code = [...view.contentDOM.querySelectorAll(".cm-line.doc-md-code")].map((line) => line.textContent);
		assert.deepEqual(code, ["src/", "  app.ts", "bare"], "the code lines are marked as the block");
		assert.equal(view.contentDOM.querySelector(".cm-line.doc-md-code")?.getAttribute("data-lang"), "text", "the language stays readable");
		assert.equal(view.state.doc.toString(), md, "nothing is written to the document");
	} finally {
		unmount(el);
	}
});

test("the fence lines of a block come back while the caret is in it", async () => {
	const { el, view } = await mount(md);
	try {
		view.dispatch({ selection: { anchor: md.indexOf("app.ts") } });
		assert.deepEqual(collapsed(view.contentDOM), ["```", "```"], "only the other block's stay hidden");
	} finally {
		unmount(el);
	}
});
