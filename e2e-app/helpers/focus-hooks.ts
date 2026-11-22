// The focus check as mocha root hooks, loaded by `wdio.conf.ts` (`mochaOpts.require`).
//
// Root hooks rather than WDIO's own `after`: WDIO logs an error thrown from a
// config hook and still reports the run as passed, while a failing mocha
// "after all" hook fails the spec file. One worker runs one spec file, so this
// module, and the watch in it, is one per file.

import { FocusWatch } from "./focus.ts";

const focus = new FocusWatch();
focus.start();

export const mochaHooks = {
	beforeEach(this: Mocha.Context): void {
		focus.during(this.currentTest?.title ?? "");
	},
	afterAll(): void {
		focus.stop();
	},
};
