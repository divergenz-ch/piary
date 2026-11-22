// What a provider's refusal says to the user (`app/provider-error.ts`). Imports the .ts directly.
import assert from "node:assert/strict";
import test from "node:test";
import { providerErrorText, refusalText } from "../../app/provider-error.ts";

test("a provider's JSON error body reads as its message, with the status and request id kept", () => {
	const raw = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going."},"request_id":"req_011Ch2nDN4foUH6doLdSmEoK"}';
	assert.equal(
		providerErrorText(raw),
		"Third-party apps now draw from your extra usage, not your plan limits. Add more at claude.ai/settings/usage and keep going. (400, request req_011Ch2nDN4foUH6doLdSmEoK)",
	);
});

test("an OpenAI-shaped body and a body with no status read the same way", () => {
	assert.equal(providerErrorText('429 {"error":{"message":"Rate limit reached","type":"requests"}}'), "Rate limit reached (429)");
	assert.equal(providerErrorText('{"error":{"message":"bad key"}}'), "bad key");
});

test("anything that is not such a body is left as pi wrote it", () => {
	for (const raw of ["No API key found for openai.", "400 not json", '500 {"no":"message"}', ""]) assert.equal(providerErrorText(raw), raw);
});

test("a refusal names the provider and model pi says it went to, and nothing when pi names none", () => {
	assert.equal(refusalText('429 {"error":{"message":"Rate limit reached"}}', { provider: "openai", model: "gpt-9" }), "openai/gpt-9: Rate limit reached (429)");
	for (const from of [{}, { provider: "openai" }, { provider: "", model: "" }]) assert.equal(refusalText("token expired", from), "token expired");
});
