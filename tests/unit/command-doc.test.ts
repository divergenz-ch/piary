// Command docs parsing — run `pnpm build` first, then `node --test tests/unit/command-doc.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseCommandDoc } from "../../dist/document/command-doc.js";

test("frontmatter lifts description and argument-hint, and nothing of the file's body", () => {
	const doc = parseCommandDoc(
		"review",
		"prompt",
		"/u/.pi/prompts/review.md",
		"---\ndescription: Review a diff\nargument-hint: \"[path]\"\n---\n\n# Review\n\nDo the thing.\n",
	);
	// A card is a glance: the long text of a command is never part of it.
	assert.deepEqual(doc, { name: "review", source: "prompt", path: "/u/.pi/prompts/review.md", description: "Review a diff", argumentHint: "[path]" });
});

test("no frontmatter — description stays unset, and the text is not read as one", () => {
	const doc = parseCommandDoc("x", "skill", undefined, "just prose\n");
	assert.equal(doc.description, undefined);
	assert.equal(doc.argumentHint, undefined);
});

test("CRLF parses, and a missing closing --- is no frontmatter", () => {
	const crlf = parseCommandDoc("a", "prompt", undefined, "---\r\ndescription: Hi\r\n---\r\nbody here\r\n");
	assert.equal(crlf.description, "Hi");

	const open = parseCommandDoc("b", "prompt", undefined, "---\ndescription: Hi\nstill going\n");
	assert.equal(open.description, undefined);
});
