// A turn the provider refused is not an answer: the runner tells it from one,
// and the report says so above every score.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { refusalOf } from "../../evals/place.ts";
import { refusedSection } from "../../evals/refused.ts";

const assistant = (fields: Record<string, unknown>) => ({ role: "assistant", content: [], ...fields }) as unknown as AgentMessage;

test("a turn that ended on the provider's error is a refusal, with the provider's words", () => {
	const turn = [assistant({ stopReason: "error", errorMessage: "Third-party apps now draw from your extra usage" })];
	assert.equal(refusalOf(turn), "Third-party apps now draw from your extra usage");
});

test("a refusal that gives no reason still reads as one", () => {
	assert.equal(refusalOf([assistant({ stopReason: "error" })]), "the provider refused the request");
});

test("a turn that answered is not a refusal, nor is one that recovered after an error", () => {
	const answer = assistant({ stopReason: "stop", content: [{ type: "text", text: "ok" }] });
	assert.equal(refusalOf([answer]), null);
	assert.equal(refusalOf([assistant({ stopReason: "error", errorMessage: "overloaded" }), answer]), null);
	assert.equal(refusalOf([]), null);
});

test("the report names each model's refused turns and why, and nothing when none was refused", () => {
	const outcomes = [
		{ model: "anthropic/a", slug: "one", refused: "credit balance is too low" },
		{ model: "anthropic/a", slug: "two", refused: "credit balance is too low" },
		{ model: "anthropic/a", slug: "three" },
		{ model: "openai/b", slug: "one" },
	];
	assert.deepEqual(refusedSection(outcomes), [
		"## Refused by the provider",
		"",
		"These turns were never answered, so their failed checks say nothing about the prompt.",
		"",
		"- **anthropic/a:** 2 of 3 turns (one, two): credit balance is too low",
		"",
	]);
	assert.deepEqual(refusedSection(outcomes.slice(2)), []);
});
