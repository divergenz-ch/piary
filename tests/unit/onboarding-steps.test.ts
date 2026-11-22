// The guided tour's order and its gate (ADR 0038): which step follows which,
// the fork through Sign in and back, the recorded exchange it goes on with
// otherwise, and which keystrokes a step lets reach the page.
import test from "node:test";
import assert from "node:assert/strict";
import {
	advance,
	keyAllowed,
	offers,
	progress,
	RECORDED_ANSWER,
	RECORDED_QUESTION,
	recordedExchange,
	type Seen,
	TOUR_QUESTION,
	tourExchange,
} from "../../app/onboarding-steps.ts";
import { TOUR } from "../../app/tour.ts";

const nothing: Seen = {
	sliderMoved: false,
	seededPrompt: TOUR_QUESTION,
	answer: "1. Fernando",
	sendTried: false,
	ranSinceSend: false,
	busy: false,
	needsSignIn: false,
	signInOpen: false,
	signInEnded: false,
	listShown: true,
};

/** A send pi refused for want of a provider. */
const refused: Seen = { ...nothing, sendTried: true, ranSinceSend: true, answer: "**Error:** No API key found for openai.", needsSignIn: true };

test("a step waits for what it asks: the slider dragged, three changed to five", () => {
	assert.equal(advance("slider", nothing), "slider");
	assert.equal(advance("slider", { ...nothing, sliderMoved: true }), "edit");
	assert.equal(advance("edit", nothing), "edit");
	assert.equal(advance("edit", { ...nothing, seededPrompt: RECORDED_QUESTION }), "send");
	assert.equal(advance("edit", { ...nothing, seededPrompt: "Give me 5 names for a houseplant." }), "send", "a digit counts");
});

test("a question changed some other way offers Next rather than a dead end", () => {
	assert.deepEqual(offers("edit", nothing), []);
	const six = { ...nothing, seededPrompt: "Give me six names for a houseplant." };
	assert.deepEqual(offers("edit", six), ["next"]);
	assert.equal(advance("edit", six, "next"), "send");
	assert.equal(advance("edit", nothing, "next"), "edit", "a button not offered does nothing");
});

test("the send step ends when its answer has landed, never on a refusal written as one", () => {
	assert.equal(advance("send", { ...nothing, sendTried: true, busy: true, ranSinceSend: true }), "send");
	assert.equal(advance("send", { ...nothing, sendTried: true, ranSinceSend: true }), "block-menu");
	// The refusal ends the turn first; pi is asked about its providers after.
	const early = { ...refused, needsSignIn: false };
	assert.equal(advance("send", early), "send", "the Sign in step may be coming");
	assert.deepEqual(offers("send", early), ["later"], "and a refusal of another kind can go on with the recording");
	assert.equal(advance("send", early, "later"), "block-menu");
});

test("the send step ends after a run that wrote no prose answer, such as one that only called a tool", () => {
	assert.equal(advance("send", { ...nothing, sendTried: true, ranSinceSend: true, answer: null }), "block-menu");
	assert.equal(advance("send", { ...nothing, sendTried: true, ranSinceSend: true, answer: "" }), "block-menu");
	assert.equal(advance("send", { ...nothing, sendTried: true, ranSinceSend: true, busy: true, answer: "" }), "send", "not while it runs");
});

test("a refusal for want of a provider forks to Sign in, and a sign-in that takes joins back at the send", () => {
	assert.equal(advance("send", refused), "sign-in");
	assert.equal(advance("sign-in", { ...refused, signInOpen: true }), "sign-in");
	assert.equal(advance("sign-in", { ...refused, needsSignIn: false }), "send", "signed in: send the question again");
});

test("a sign-in that fails offers Try again or Sign in later", () => {
	const failed = { ...refused, signInEnded: true };
	assert.equal(advance("sign-in", failed), "sign-in-failed");
	assert.deepEqual(offers("sign-in-failed", failed), ["retry", "later"]);
	assert.equal(advance("sign-in-failed", failed, "retry"), "sign-in");
	assert.equal(advance("sign-in-failed", { ...failed, signInOpen: true }), "sign-in", "the red button is a retry too");
	assert.equal(advance("sign-in-failed", failed, "later"), "block-menu");
	assert.equal(advance("sign-in", refused, "later"), "block-menu", "later is offered before trying, too");
});

test("the chrome steps are read and passed with Next, and a hidden list is skipped", () => {
	assert.equal(advance("block-menu", nothing), "block-menu");
	assert.equal(advance("block-menu", nothing, "next"), "conversations");
	assert.equal(advance("block-menu", { ...nothing, listShown: false }, "next"), "model");
	assert.equal(advance("model", nothing, "next"), "your-turn");
	assert.equal(advance("your-turn", nothing, "next"), null, "Finish ends the tour");
});

test("each step lets through only its own keys", () => {
	const key = (k: string, mod = false) => ({ key: k, mod, alt: false });
	assert.equal(keyAllowed("slider", key("a")), false);
	assert.equal(keyAllowed("edit", key("f")), true);
	assert.equal(keyAllowed("edit", key("Backspace")), true);
	assert.equal(keyAllowed("edit", key("ArrowDown")), false, "the caret stays in the question");
	assert.equal(keyAllowed("edit", key("Enter", true)), false, "nothing is sent before it is changed");
	assert.equal(keyAllowed("send", key("Enter", true)), true);
	assert.equal(keyAllowed("sign-in-failed", key("Enter", true)), false);
	assert.equal(keyAllowed("your-turn", key("n", true)), true);
});

test("the tour's question is the first prompt on the page, found even when rewritten whole", () => {
	assert.ok(TOUR.includes(TOUR_QUESTION), "the constant is the tour's own question");
	assert.equal(tourExchange(TOUR)?.question.text, TOUR_QUESTION);
	const rewritten = TOUR.replace(TOUR_QUESTION, "What is the capital of France?");
	assert.equal(tourExchange(rewritten)?.question.text, "What is the capital of France?");
	assert.equal(tourExchange(TOUR.replace(TOUR_QUESTION, ""))?.question.text, "", "an emptied question is still there");
});

/** `md` with `change` applied. */
const applied = (md: string, change: { from: number; to: number; insert: string }) => md.slice(0, change.from) + change.insert + md.slice(change.to);

test("the recorded exchange sets the question to five and the answer to the recording, whatever was there", () => {
	const mangled = TOUR.replace(TOUR_QUESTION, "Give me eleven names, in French.").replace("2. Leaf Erikson\n3. Spike", "**Error:** No API key found for openai.");
	const md = applied(mangled, recordedExchange(mangled)!);
	const exchange = tourExchange(md)!;
	assert.equal(exchange.question.text, RECORDED_QUESTION);
	assert.equal(exchange.answer, RECORDED_ANSWER);
	assert.ok(md.includes("## Your turn"), "the notes after it are left alone");
	assert.ok(md.includes("Things on the page run"), "and the ones before it");
	assert.equal(applied(md, recordedExchange(md)!), md, "writing it twice changes nothing");
});

test("a space typed at the question's end is still inside it", () => {
	const md = TOUR.replace(TOUR_QUESTION, "Give me three names for a ");
	const { question } = tourExchange(md)!;
	assert.equal(md.slice(question.from, question.to), "Give me three names for a ");
});

test("the card counts the sign-in steps as part of the send, and a hidden list not at all", () => {
	assert.deepEqual(progress("slider", true), { at: 1, of: 7 });
	assert.deepEqual(progress("sign-in-failed", true), { at: 3, of: 7 });
	assert.deepEqual(progress("model", false), { at: 5, of: 6 });
});
