// What an answer to the login command's dialog means (ADR 0034). Pure, so the
// suite runs it from source; `login.ts` asks the page and acts on this.

/** The flow's next move: go on with the value, end because the user cancelled,
 *  or drop a question pi itself withdrew. */
export type PromptOutcome = { value: string } | { cancelled: true } | { withdrawn: true };

/**
 * `answer` is the page's reply to one question, `undefined` when there was
 * none; `withdrawn` says pi took the question back before it came. pi asks for
 * a pasted code while it waits on the browser, and withdraws the question when
 * the browser answers first — no answer then is not the user cancelling, and
 * ending the sign-in on it would abort the code exchange that follows.
 */
export function promptOutcome(answer: Record<string, unknown> | undefined, withdrawn: boolean): PromptOutcome {
	if (answer && typeof answer["value"] === "string") return { value: answer["value"] };
	return withdrawn ? { withdrawn: true } : { cancelled: true };
}
