// A barrier for a negative assertion, in place of a fixed wait.
//
// "Nothing happened" can only be asserted after the page has had its chance to
// act, and a fixed `waitForTimeout` guesses how long that is: too short and the
// negative passes before the page looked, too long and every run pays for it.
// Two animation frames, awaited inside the page, are a barrier instead: every
// handler a gesture or an event ran synchronously, every promise chain it
// started that waits on no timer (the browser fakes answer through resolved
// promises), and the render it scheduled have all happened by the second frame.
// A reaction that waits on a timer is not covered — wait on that timer's named
// debounce instead.
import type { Page } from "@playwright/test";

export const afterFrames = (page: Page): Promise<void> =>
	page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
