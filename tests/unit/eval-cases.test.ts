// The eval cases, held to their schema and to the document format.
//
// A case that does not parse, points at a prompt that is not there, or names a
// cell its document does not hold would score as a model failure when the
// runner meets it — a broken case dressed as a bad answer. Everything a case
// claims about its own files is checked here instead, without a model.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CANVAS, DRAFT_TAG, DRAFT_TITLE, parseCase, type Case } from "../../evals/case.ts";
import { documentMessages, parseDocument } from "../../src/document/format.ts";
import { historyAbove, promptAt, tailPrompt } from "../../src/document/run.ts";

const ROOT = join(import.meta.dirname, "../../evals/cases");
const slugs = readdirSync(ROOT, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

/** Each case with its document, read once. */
const cases: { slug: string; spec: Case; md: string; dir: string }[] = slugs.map((slug) => {
	const dir = join(ROOT, slug);
	const spec = parseCase(JSON.parse(readFileSync(join(dir, "case.json"), "utf8")), slug);
	return { slug, spec, md: readFileSync(join(dir, "doc.md"), "utf8"), dir };
});

test("the set holds 15 to 36 cases", () => {
	// Few enough that a full run stays minutes, not an hour: every case runs on
	// each eval model. Six of them are the design persona cases (`ui-*`).
	assert.ok(cases.length >= 15 && cases.length <= 36, `${cases.length} cases`);
});

test("every canvas-specific behaviour is covered by a case", () => {
	const covered = new Set(cases.flatMap((c) => c.spec.canvas));
	for (const behaviour of CANVAS) assert.ok(covered.has(behaviour), `no case covers ${behaviour}`);
});

test("a draft says so in its title and its tags, and only a draft does", () => {
	for (const { slug, spec } of cases) {
		assert.equal(spec.title.startsWith(DRAFT_TITLE), spec.tags.includes(DRAFT_TAG), slug);
	}
});

for (const { slug, spec, md, dir } of cases) {
	test(`${slug}: the document parses with no marker the format does not know`, () => {
		const doc = parseDocument(md);
		assert.equal(doc.version, "v1");
		assert.deepEqual(
			doc.segments.filter((s) => s.kind === "opaque").map((s) => md.slice(s.from, s.bodyFrom).trim()),
			[],
		);
	});

	test(`${slug}: the prompt to answer is there and has text`, () => {
		const { segments } = parseDocument(md);
		let index: number;
		if (spec.caret !== undefined) {
			const at = md.indexOf(spec.caret);
			assert.ok(at >= 0, "caret text not in doc.md");
			assert.equal(md.indexOf(spec.caret, at + 1), -1, "caret text occurs twice");
			index = promptAt(segments, at);
		} else {
			index = tailPrompt(segments);
		}
		assert.ok(index >= 0, "no prompt at the caret");
		assert.ok(segments[index].text.trim(), "the prompt is empty");
		assert.doesNotThrow(() => documentMessages(historyAbove(md, segments[index])));
	});

	if (spec.checks.cellRedefines !== undefined) {
		test(`${slug}: the cell it must redefine is in the document`, () => {
			const ids = parseDocument(md)
				.segments.filter((s) => s.kind === "cell")
				.map((s) => s.id);
			assert.ok(ids.includes(spec.checks.cellRedefines), `#${spec.checks.cellRedefines} not among ${ids.join(", ")}`);
		});
	}

	const named = [...(spec.checks.files?.changed ?? []), ...(spec.checks.files?.unchanged ?? [])];
	if (named.length > 0) {
		test(`${slug}: every file its checks name is in its workspace`, () => {
			for (const rel of named) assert.ok(existsSync(join(dir, "workspace", rel)), `workspace/${rel} missing`);
		});
	}
}

test("a case with an unknown key is refused, not read as checking nothing", () => {
	const good = { title: "t", tags: [], job: "explain", canvas: [], rubric: ["r"], checks: {} };
	assert.doesNotThrow(() => parseCase(good, "good"));
	assert.throws(() => parseCase({ ...good, chekcs: {} }, "typo"), /unknown key "chekcs"/);
	assert.throws(() => parseCase({ ...good, checks: { tools: { mustnot: [] } } }, "typo"), /unknown key "mustnot"/);
	assert.throws(() => parseCase({ ...good, job: "chat" }, "bad job"), /job must be one of/);
	assert.throws(() => parseCase({ ...good, canvas: ["vibes"] }, "bad canvas"), /canvas "vibes"/);
});
