// Layer 4 of the testing strategy (docs/TEST_ARCHITECTURE.md §6): the real app,
// driven from outside, through the embedded WebDriver server.
//
// Deliberately small, and what it asserts is deliberately narrow: the shell.
// IPC round-trips, a PTY end to end, the capture sidecar, a window's own state,
// and the process's own life — what a quit ends, a real outside write, a Finder
// launch's log — for which a spec launches an app of its own
// (`e2e-app/helpers/instance.ts`) beside the one this service holds.
// **No text entry and no chords through WebDriver** — its keyboard injection on
// macOS cannot deliver them reliably (ADR 0014), so a spec that typed that way
// would be asserting a synthetic event rather than a keystroke. Keys are a pure
// question answered by `tests/unit/keymap.test.ts`, and key handling belongs to
// the Playwright layer against the page. A real hover, click, wheel or key in
// this layer is handed to the window from inside the app (`Driver.pointer`,
// ADR 0068).
//
// This cannot be display-less: WebKit suspends rendering and timers for a window
// that is ordered out, so a real window opens on a real WindowServer session. No
// human ritual is needed — a logged-in Mac satisfies it — but it will not run
// over SSH to a locked machine. The window is real but transparent and
// click-through, and it never takes the user's focus (src-tauri/src/main.rs);
// `e2e-app/helpers/focus-hooks.ts` fails a spec file during which a binary
// under test was ever the frontmost app. `PIARY_E2E_SHOW=1` keeps the windows
// visible, to watch a spec run. Why a hack and not a VM: TEST_ARCHITECTURE.md §6.
//
// Run with `pnpm test:app`. Not part of `pnpm verify`: that gate must stay fast
// and must not open a window.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { freePortSync } from "./e2e/helpers/ports.ts";
import { BINARY } from "./e2e-app/helpers/instance.ts";

const ci = !!process.env["CI"];

// The app reads this to arm its embedded WebDriver server
// (src-tauri/src/main.rs). Set on THIS process rather than only in
// `tauri:options.env`, because the service merges the launched app's
// environment from its own — and an unset variable here is the one failure that
// presents as "the server did not become ready", which reads as a missing
// plugin and is not one.
process.env["PIARY_E2E"] = "1";

// The port the app's embedded WebDriver server listens on, which the plugin
// and the service both read from this variable and otherwise take as 4445. A
// fixed port is one every checkout shares: two runs at once attach to each
// other's app, and a command that exists is answered "not found". So the
// launcher takes a free one and hands it on through the environment, as it
// does the document directory below: each worker loads this file again, and a
// port chosen per load would have the worker look where no app listens.
process.env["TAURI_WEBDRIVER_PORT"] ??= String(freePortSync());

// The service's app writes its documents here, never into the workspace's real
// conversations: without it the window's own document is the one `pnpm app`
// opens from this repo, and `shell.spec.ts` saves over it. Made once, by the
// launcher, and handed on through the environment: each worker loads this file
// again, and a directory made per load would outlive `onComplete`.
const DOC_DIR = (process.env["PIARY_APP_SPEC_DOCS"] ??= mkdtempSync(join(tmpdir(), "piary-app-spec-")));
// On THIS process, as PIARY_E2E is above: the service builds the app's
// environment from its own, so a variable set only in `tauri:options.env` never
// arrived, and the app wrote into the real document directory of whatever
// workspace it was launched from. The workspace is named too, beside the
// documents rather than the launcher's cwd, so pi and a terminal run there.
process.env["PI_DOC_DIR"] = DOC_DIR;
process.env["PI_CWD"] = dirname(DOC_DIR);
// Its own preferences file, so a spec that changes a preference never changes
// the user's, and none reads what the user chose (ADR 0048).
const PREFERENCES = join(DOC_DIR, "preferences.json");
process.env["PIARY_PREFERENCES"] = PREFERENCES;
// A stored `welcome`, so the main window opens on a conversation rather than a
// first run: the splash and the guided tour cover the window (ADR 0038), and
// the page specs are what hold them (`e2e/app-page.spec.ts`).
if (!existsSync(join(DOC_DIR, "welcome.md"))) writeFileSync(join(DOC_DIR, "welcome.md"), "<!-- you -->\n\n");

if (!existsSync(BINARY)) {
	throw new Error(
		`no app binary at ${BINARY} — run \`pnpm app:e2e:build\` first (it needs the \`e2e\` feature, ` +
			"since a build without it has no WebDriver server to connect to)",
	);
}

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",
	specs: ["./e2e-app/**/*.spec.ts"],
	maxInstances: 1,
	capabilities: [
		{
			browserName: "tauri",
			"tauri:options": {
				application: BINARY,
				// PIARY_E2E is the third gate on the embedded server
				// (src-tauri/src/main.rs): the feature and a debug build are not
				// enough to arm it, because a port answering the app's whole IPC
				// surface should not come up by accident.
				env: { PIARY_E2E: "1", PI_DOC_DIR: DOC_DIR, PI_CWD: dirname(DOC_DIR), PIARY_PREFERENCES: PREFERENCES },
			},
		} as WebdriverIO.Capabilities,
	],
	services: ["tauri"],
	logLevel: ci ? "warn" : "error",
	// A window has to appear and the page has to boot a real editor, so the
	// timeouts are generous compared with the page layer's.
	waitforTimeout: 15_000,
	connectionRetryTimeout: 60_000,
	connectionRetryCount: 3,
	// JUnit alongside the console output: WDIO has a long tail of exit-code bugs,
	// so a harness should assert on the artifact rather than on the code alone.
	reporters: ci ? ["spec", ["junit", { outputDir: "./test-results/app" }]] : ["spec"],
	// `focus-hooks.ts` fails a spec file during which the app under test was
	// ever the frontmost app.
	// `forbidOnly` in strict mode only, as playwright.config.ts does: a committed
	// `.only` silently narrows the run, while a local one is a focusing tool.
	mochaOpts: { ui: "bdd", timeout: 60_000, forbidOnly: !!process.env["CI"], require: ["./e2e-app/helpers/focus-hooks.ts"] },
	onComplete: () => rmSync(DOC_DIR, { recursive: true, force: true }),
};
