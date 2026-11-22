// A document leaving or entering the store (ADR 0049) — run `pnpm build` first, then `node --test tests/unit/bundle.test.ts`.
import test from "node:test";
import assert from "node:assert/strict";
import { attachmentRefs, freeId, importVerdict, renameAttachments } from "../../dist/document/bundle.js";
import { parseDocument, serializeFile } from "../../dist/document/format.js";

const file = (stored: string, name = "shot.png", mime = "image/png") =>
	serializeFile({ id: stored, mime, url: `/attachments/${stored}`, name });

const doc = (...parts: string[]) => `---\npi: v1\nsession: old\n---\n\n${parts.join("\n\n")}\n`;

test("a document with no attachment references none", () => {
	assert.deepEqual(attachmentRefs(doc("<!-- you -->", "hello")), []);
});

test("an attachment segment and a link in prose are both references, in document order", () => {
	const md = doc(file("shot-a1.png"), "<!-- you -->", "see [the paper](/attachments/paper-b2.pdf)");
	assert.deepEqual(attachmentRefs(md), ["shot-a1.png", "paper-b2.pdf"]);
});

test("a file referenced twice is listed once", () => {
	const md = doc(file("shot-a1.png"), "<!-- you -->", "again ![](/attachments/shot-a1.png)");
	assert.deepEqual(attachmentRefs(md), ["shot-a1.png"]);
});

test("a link elsewhere, or a name outside the store's alphabet, is not a reference", () => {
	const md = doc("<!-- you -->", "[a](https://x.test/attachments/a.png) [b](/attachments/../secret) [c](/attachments/a b.png)");
	assert.deepEqual(attachmentRefs(md), []);
});

test("a rename moves the links to that file and leaves a look-alike name alone", () => {
	const md = doc(file("a.png"), file("a.png.bak", "a.png.bak", "application/octet-stream"), "<!-- you -->", "text a.png");
	const renamed = renameAttachments(md, { "a.png": "a-2.png" });
	assert.deepEqual(attachmentRefs(renamed), ["a-2.png", "a.png.bak"]);
	assert.equal(renamed, md.replace("(/attachments/a.png)", "(/attachments/a-2.png)"));
});

test("a rename table with no entry for a document's files changes nothing", () => {
	const md = doc(file("a.png"), "<!-- you -->", "x");
	assert.equal(renameAttachments(md, { toString: "evil", "b.png": "c.png" }), md);
});

test("an imported document is bound to its new id, its body byte for byte", () => {
	const md = doc(file("shot-a1.png"), "<!-- you -->", "hello");
	const { content, readOnly } = importVerdict(md, "notes");
	assert.equal(readOnly, null);
	assert.match(parseDocument(content).frontmatter ?? "", /^session: notes$/m);
	assert.equal(content.slice(content.indexOf("\n---\n")), md.slice(md.indexOf("\n---\n")));
});

test("a plain markdown file is imported as a conversation bound to its id", () => {
	const { content, readOnly } = importVerdict("just prose\n", "notes");
	assert.equal(readOnly, null);
	assert.match(content, /^---\npi: v1\nsession: notes\n---\n\njust prose\n$/);
});

test("a document of an unknown version is left byte for byte and says why it is read-only", () => {
	const md = "---\npi: v9\nsession: old\n---\n\n<!-- you -->\n\nhello\n";
	const { content, readOnly } = importVerdict(md, "notes");
	assert.equal(content, md);
	assert.match(readOnly ?? "", /v9/);
});

test("the id kept beside a taken one is the first free suffix", () => {
	assert.equal(freeId("notes", ["notes"]), "notes-2");
	assert.equal(freeId("notes", ["notes", "notes-2", "notes-3", "notes-5"]), "notes-4");
});
