// What an answer to the login command's dialog means (ADR 0034). Imports the .ts directly.
import assert from "node:assert/strict";
import test from "node:test";
import { promptOutcome } from "../../pi-extension/login-answer.ts";

test("a value answered is the value", () => {
	assert.deepEqual(promptOutcome({ value: "sk-1" }, false), { value: "sk-1" });
});

test("no answer, with the question still asked, is the user cancelling", () => {
	assert.deepEqual(promptOutcome(undefined, false), { cancelled: true });
	assert.deepEqual(promptOutcome({ nothing: 1 }, false), { cancelled: true });
});

test("no answer to a question pi withdrew is not a cancel: the browser sign-in landed first", () => {
	// pi asks for a pasted code while it waits for the browser, and withdraws
	// the question when the browser answers. Read as a cancel, it aborted the
	// sign-in just as pi exchanged the code: "This operation was aborted".
	assert.deepEqual(promptOutcome(undefined, true), { withdrawn: true });
});
