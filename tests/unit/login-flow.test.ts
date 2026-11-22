// What the sign-in panel reads from Piary's login command (ADR 0034). Imports the .ts directly.
import assert from "node:assert/strict";
import test from "node:test";
import { doneText, LOGIN_NOTE, LOGIN_REQUEST, type LoginOffer, loginNews, loginQuestion, orderOffers } from "../../app/login-flow.ts";

const offer = (providerId: string, name: string, type: "oauth" | "api_key", signedIn: LoginOffer["signedIn"] = null): LoginOffer => ({
	providerId,
	name,
	type,
	label: type === "oauth" ? "Sign in with an account" : "API key",
	subscription: false,
	signedIn,
});

test("what is signed in comes first, then the common providers, then the rest by name; an account before its key", () => {
	const rows = orderOffers([
		offer("zed", "Zed", "api_key"),
		offer("openai", "OpenAI", "api_key"),
		offer("anthropic", "Anthropic", "api_key"),
		offer("anthropic", "Anthropic", "oauth"),
		offer("bedrock", "Amazon Bedrock", "api_key", "api_key"),
	]);
	assert.deepEqual(
		rows.map((row) => `${row.providerId}/${row.type}`),
		["bedrock/api_key", "anthropic/oauth", "anthropic/api_key", "openai/api_key", "zed/api_key"],
	);
});

test("the search matches a provider's name, id or method, ignoring case", () => {
	const offers = [offer("openai", "OpenAI", "oauth"), offer("anthropic", "Anthropic", "api_key")];
	assert.deepEqual(orderOffers(offers, " ANTH").map((row) => row.providerId), ["anthropic"]);
	assert.deepEqual(orderOffers(offers, "account").map((row) => row.providerId), ["openai"]);
	assert.equal(orderOffers(offers, "nothing").length, 0);
});

test("only the login command's dialogs and notices are read", () => {
	const asked = { type: "extension_ui_request", id: "l1", method: "input", title: LOGIN_REQUEST, placeholder: JSON.stringify({ step: "choose", offers: [] }) };
	assert.deepEqual(loginQuestion(asked), { requestId: "l1", question: { step: "choose", offers: [] } });
	assert.equal(loginQuestion({ ...asked, title: "piary:cell-verdict" }), null);
	assert.equal(loginQuestion({ ...asked, placeholder: "not json" }), null);
	const said = { type: "extension_ui_request", id: "n1", method: "notify", message: `${LOGIN_NOTE}${JSON.stringify({ step: "done", ok: true, provider: "OpenAI" })}` };
	assert.deepEqual(loginNews(said), { step: "done", ok: true, provider: "OpenAI" });
	assert.equal(loginNews({ ...said, message: "an extension's own notice" }), null);
});

test("a finished flow says what happened, and a cancelled one says nothing", () => {
	assert.equal(doneText({ step: "done", ok: true, provider: "OpenAI" }), "Signed in to OpenAI. Send again to use it.");
	assert.equal(doneText({ step: "done", ok: true, provider: "OpenAI", signedOut: true }), "Signed out of OpenAI.");
	assert.equal(doneText({ step: "done", ok: false, provider: "OpenAI", error: "invalid key" }), "Could not sign in to OpenAI: invalid key");
	assert.equal(doneText({ step: "done", ok: false, provider: "OpenAI", error: "locked", signedOut: false }), "Could not sign out of OpenAI: locked");
	assert.equal(doneText({ step: "done", ok: false, cancelled: true }), "");
});

test("an Anthropic account sign-in warns that Piary's use of it draws on extra usage; nothing else does", async () => {
	const { offerNote } = await import("../../app/login-flow.ts");
	assert.match(offerNote(offer("anthropic", "Anthropic", "oauth")) ?? "", /extra usage.*claude\.ai\/settings\/usage/);
	assert.equal(offerNote(offer("anthropic", "Anthropic", "api_key")), null);
	assert.equal(offerNote(offer("openai", "OpenAI", "oauth")), null);
});
