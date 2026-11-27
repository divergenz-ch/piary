// What a release is decided from (`scripts/release-plan.ts`): the commits read
// out of `git log`, the version they call for, the notes they amount to, what
// notes may not carry to a public page, and the three files that say the
// version. Pure, so nothing here needs a repository or a build.
import assert from "node:assert/strict";
import { test } from "node:test";

import { chosen, commitsAsText, draftNotes, leaks, parseLog, suggest, withVersion } from "../../scripts/release-plan.ts";

/** `git log -z --format=%H%n%s%n%b` of these commits: subject, then body. */
const log = (...commits: [subject: string, body?: string][]): string => commits.map(([subject, body = ""], i) => `${String(i).padStart(40, "0")}\n${subject}\n${body}\n`).join("\0");

const REPOSITORY = "divergenz-ch/piary";

test("a commit is read as its type, scope and summary, and a body keeps its lines", () => {
	const [commit] = parseLog(log(["fix(canvas): a forward delete leaves the caret where it is", "First line.\n\nSecond paragraph: with a colon."]));
	assert.deepEqual(
		{ type: commit?.type, scope: commit?.scope, summary: commit?.summary, body: commit?.body, breaking: commit?.breaking },
		{ type: "fix", scope: "canvas", summary: "a forward delete leaves the caret where it is", body: "First line.\n\nSecond paragraph: with a colon.", breaking: false },
	);
});

test("a subject of no known form is kept whole, as no type", () => {
	const [commit] = parseLog(log(["Merge the thing"]));
	assert.equal(commit?.type, null);
	assert.equal(commit?.summary, "Merge the thing");
});

test("a breaking change is said by the mark or by the footer", () => {
	const commits = parseLog(log(["feat(app)!: the store moves"], ["fix(app): a rename", "BREAKING CHANGE: old files are not read"], ["fix(app): nothing breaks"]));
	assert.deepEqual(
		commits.map((commit) => commit.breaking),
		[true, true, false],
	);
});

test("every commit of the log is read, in its order", () => {
	const commits = parseLog(log(["feat(app): one"], ["fix(app): two", "a body"], ["docs: three"]));
	assert.deepEqual(
		commits.map((commit) => commit.summary),
		["one", "two", "three"],
	);
});

test("fixes alone move the last number", () => {
	const { version, part } = suggest([0, 3, 1], parseLog(log(["fix(app): a"], ["docs: b"])));
	assert.deepEqual([version, part], [[0, 3, 2], "patch"]);
});

test("a feature moves the middle number and starts the last over", () => {
	const { version, part } = suggest([0, 3, 1], parseLog(log(["fix(app): a"], ["feat(canvas): b"])));
	assert.deepEqual([version, part], [[0, 4, 0], "minor"]);
});

test("before 1.0.0 a breaking change moves the middle number, and from it the first", () => {
	const commits = parseLog(log(["fix(app)!: a"]));
	assert.deepEqual(suggest([0, 3, 1], commits).version, [0, 4, 0]);
	assert.deepEqual(suggest([1, 3, 1], commits).version, [2, 0, 0]);
});

test("a feature of the tests or of the release tooling is no feature of the app", () => {
	const { part, reason } = suggest([0, 3, 1], parseLog(log(["feat(release): the image is notarized"], ["feat(test): a new harness"])));
	assert.equal(part, "patch");
	assert.match(reason, /nothing a user would see/);
});

test("the reason counts what was found", () => {
	const { reason } = suggest([0, 0, 1], parseLog(log(["feat(app): a"], ["feat(app): b"], ["fix(app): c"])));
	assert.match(reason, /^2 features, 1 fix:/);
});

test("a version asked for must be one, and later than the last release", () => {
	assert.deepEqual(chosen("0.2.0", [0, 1, 0]), [0, 2, 0]);
	assert.deepEqual(chosen("v1.0.0", [0, 1, 0]), [1, 0, 0]);
	assert.match(String(chosen("0.2", [0, 1, 0])), /is not a version/);
	assert.match(String(chosen("0.1.0", [0, 1, 0])), /is not later than 0\.1\.0/);
	assert.match(String(chosen("0.2.0-rc.1", [0, 1, 0])), /is not a version/);
});

test("the notes with no writer are what is new and what is fixed, a line a commit", () => {
	const notes = draftNotes(parseLog(log(["fix(canvas): a press on the edge folds it"], ["feat(app): a conversation is exported as a PDF"], ["docs(adr): a record"], ["fix(test): two checkouts run at once"])));
	assert.equal(notes, "## New\n\n- A conversation is exported as a PDF\n\n## Fixed\n\n- A press on the edge folds it\n");
});

test("notes of a release nobody would notice say so, and are not empty", () => {
	assert.match(draftNotes(parseLog(log(["docs: a"], ["test(app): b"]))), /^Nothing a user of the app would notice/);
});

test("a writer is handed every commit whole, bodies included", () => {
	const text = commitsAsText(parseLog(log(["feat(app)!: one", "why one"], ["docs: two"])));
	assert.equal(text, "feat(app)!: one\n\nwhy one\n\n---\n\ndocs: two");
});

test("clean notes carry nothing, a link into the repository included", () => {
	const notes = "## New\n\n- Export as PDF, in UTF-8, checked by SHA-256. See https://github.com/divergenz-ch/piary/releases.\n- Drag it to /Applications/Piary.app on macOS 13.0.\n";
	assert.deepEqual(leaks(notes, REPOSITORY), []);
});

test("notes are refused a foreign link, a machine's path, an outside id and a commit hash", () => {
	assert.deepEqual(leaks("see https://example.com/issue/9 for more", REPOSITORY), ["https://example.com/issue/9"]);
	assert.deepEqual(leaks("it read `/Users/someone/notes.md` before", REPOSITORY), ["/Users/someone/notes.md"]);
	assert.deepEqual(leaks("Fixed the caret (ABC-123).", REPOSITORY), ["ABC-123"]);
	assert.deepEqual(leaks("Fixed in 74df1af.", REPOSITORY), ["74df1af"]);
});

const CARGO_TOML = `[package]\nname = "piary"\nversion = "0.0.1"\nedition = "2021"\n\n[dependencies]\nserde = { version = "0.0.1" }\n`;
// A dependency at the app's own version, before and after the app's entry.
const CARGO_LOCK = `[[package]]\nname = "adler"\nversion = "0.0.1"\n\n[[package]]\nname = "piary"\nversion = "0.0.1"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "piary-macros"\nversion = "0.0.1"\n`;
const PACKAGE_JSON = `{\n\t"name": "piary",\n\t"version": "0.0.1",\n\t"dependencies": {\n\t\t"x": { "version": "0.0.1" }\n\t}\n}\n`;

test("each file that says the version says the new one, and only where it is the app's", () => {
	assert.equal(withVersion("package.json", PACKAGE_JSON, [0, 2, 0]), PACKAGE_JSON.replace(`\t"version": "0.0.1"`, `\t"version": "0.2.0"`));
	assert.equal(withVersion("src-tauri/Cargo.toml", CARGO_TOML, [0, 2, 0]), CARGO_TOML.replace(`name = "piary"\nversion = "0.0.1"`, `name = "piary"\nversion = "0.2.0"`));
	assert.equal(withVersion("src-tauri/Cargo.lock", CARGO_LOCK, [0, 2, 0]), CARGO_LOCK.replace(`name = "piary"\nversion = "0.0.1"`, `name = "piary"\nversion = "0.2.0"`));
});

test("a file with no version where one is looked for is refused, not passed over", () => {
	assert.throws(() => withVersion("src-tauri/Cargo.lock", `[[package]]\nname = "other"\nversion = "1.0.0"\n`, [0, 2, 0]), /names no version/);
});
