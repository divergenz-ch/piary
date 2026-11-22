// A page `console.error` or an uncaught page error fails the test it happened in.
//
// The app specs used to pass with errors scrolling past in the dev server's
// output, which is a green run hiding a broken page. So every test that imports
// `test` from here is watched: an error the test did not declare fails it,
// naming the message and where it came from. A test that drives an error path
// on purpose declares what it expects with `allowConsoleError(page, /…/)`
// before the error happens; an allowance that never matched also fails, so a
// declaration cannot outlive the error it was written for.
//
// CONSOLE_SURVEY=1 reports instead of failing, for finding what a run emits.
import { test as base, expect, type Page } from "@playwright/test";

const allowances = new WeakMap<Page, { pattern: RegExp; seen: boolean; required: boolean }[]>();

/**
 * What the fakes' environment logs on every page that shows an attachment, and
 * no test can declare away: the app serves attachments on its own
 * `piary-file://` scheme (ADR 0026), and with no Rust behind the page the
 * engine refuses the scheme. Whether the scheme serves is layer 4's question
 * (TEST_ARCHITECTURE.md §6); what the page does with the URL is asserted here.
 */
const ENVIRONMENT = [/^Failed to load resource: unsupported URL\s+\(piary-file:/];

/** Declares an error this test drives on purpose. It must match at least once,
 *  unless `required` is false: for an error whose timing the test does not
 *  own, such as a cell the runtime evaluates after the last assertion. */
export function allowConsoleError(page: Page, pattern: RegExp, { required = true } = {}): void {
	const list = allowances.get(page) ?? [];
	list.push({ pattern, seen: false, required });
	allowances.set(page, list);
}

export const test = base.extend<{ consoleGuard: void }>({
	consoleGuard: [
		async ({ page }, use, testInfo) => {
			const errors: string[] = [];
			const record = (text: string) => {
				if (ENVIRONMENT.some((pattern) => pattern.test(text))) return;
				const allowed = allowances.get(page)?.find((allowance) => allowance.pattern.test(text));
				if (allowed) allowed.seen = true;
				else errors.push(text);
			};
			page.on("console", (message) => {
				if (message.type() !== "error") return;
				const { url, lineNumber } = message.location();
				record(`${message.text()}${url ? `  (${url}:${lineNumber})` : ""}`);
			});
			page.on("pageerror", (error) => record(`uncaught: ${error.message}\n${error.stack ?? ""}`));
			await use();
			const unmatched = (allowances.get(page) ?? []).filter((allowance) => allowance.required && !allowance.seen);
			if (process.env["CONSOLE_SURVEY"]) {
				for (const error of errors) process.stderr.write(`[console-survey] ${testInfo.title}: ${error}\n`);
				return;
			}
			// Only a test that otherwise passed is failed for this: a failing test's
			// errors are usually its own failure echoed, and the real failure says more.
			if (testInfo.status !== testInfo.expectedStatus) return;
			expect(errors, "the page logged an error this test did not declare").toEqual([]);
			expect(
				unmatched.map((allowance) => String(allowance.pattern)),
				"an allowed console error never happened — drop the allowance",
			).toEqual([]);
		},
		{ auto: true },
	],
});

export { expect };
