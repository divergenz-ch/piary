// Whether a newer Piary exists, as rules (app/update-check.ts): asserted
// without a page or a network.
import test from "node:test";
import assert from "node:assert/strict";
import { announced, latestTag, newer, parseVersion, releasePage, type UpdateFacts } from "../../app/update-check.ts";

const facts = (over: Partial<UpdateFacts> = {}): UpdateFacts => ({ current: "0.1.0", latest: "v0.2.0", check: true, dismissed: "", ...over });

test("a version is three numbers, with or without the tag's v", () => {
	assert.deepEqual(parseVersion("0.2.0"), [0, 2, 0]);
	assert.deepEqual(parseVersion("v12.0.345"), [12, 0, 345]);
	assert.deepEqual(parseVersion(" v1.2.3\n"), [1, 2, 3]);
});

test("what is not a released version is no version", () => {
	for (const text of ["", "v", "1.2", "1.2.3.4", "v1.2.x", "1.2.3-rc.1", "v1.2.3+build", "latest", "V1.2.3", "1.2.3/../x", "9999999.0.0"]) {
		assert.equal(parseVersion(text), null, `for ${JSON.stringify(text)}`);
	}
});

test("versions compare by number, not by text", () => {
	assert.ok(newer([0, 10, 0], [0, 9, 0]));
	assert.ok(newer([1, 0, 0], [0, 99, 99]));
	assert.ok(newer([0, 0, 2], [0, 0, 1]));
	assert.ok(!newer([0, 9, 0], [0, 10, 0]));
	assert.ok(!newer([1, 2, 3], [1, 2, 3]), "the same version is not newer");
});

test("the tag is read from GitHub's answer, and from nothing else", () => {
	assert.equal(latestTag(JSON.stringify({ tag_name: "v0.2.0", html_url: "https://example.org/elsewhere" })), "v0.2.0");
	// A refusal's body, an answer cut short, a tag that is no version.
	assert.equal(latestTag(JSON.stringify({ message: "Not Found", status: "404" })), null);
	assert.equal(latestTag('{"tag_name": "v0.2'), null);
	assert.equal(latestTag(JSON.stringify({ tag_name: "nightly" })), null);
	assert.equal(latestTag(JSON.stringify({ tag_name: 2 })), null);
	assert.equal(latestTag("null"), null);
	assert.equal(latestTag(""), null);
});

test("a build older than the latest release announces it", () => {
	assert.equal(announced(facts()), "0.2.0");
});

test("a build that is current, or ahead, announces nothing", () => {
	assert.equal(announced(facts({ current: "0.2.0" })), null);
	assert.equal(announced(facts({ current: "0.3.0" })), null);
});

test("nothing is announced before anything was read, or with the check off", () => {
	assert.equal(announced(facts({ latest: null })), null);
	assert.equal(announced(facts({ check: false })), null);
});

test("a dismissed version is not announced again, and the one after it is", () => {
	assert.equal(announced(facts({ dismissed: "0.2.0" })), null);
	assert.equal(announced(facts({ dismissed: "0.2.0", latest: "v0.3.0" })), "0.3.0");
});

test("a version that cannot be read announces nothing", () => {
	assert.equal(announced(facts({ latest: "nightly" })), null);
	assert.equal(announced(facts({ current: "dev" })), null);
});

test("the download page is built from the version's numbers", () => {
	assert.equal(releasePage("0.2.0"), "https://github.com/divergenz-ch/piary/releases/tag/v0.2.0");
	assert.equal(releasePage("v0.2.0"), "https://github.com/divergenz-ch/piary/releases/tag/v0.2.0");
	assert.equal(releasePage("0.2.0/../../evil"), null);
});
