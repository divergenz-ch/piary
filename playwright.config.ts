// Browser-level UI tests: the real <document-chat> in a real engine
// (docs/TEST_ARCHITECTURE.md L2.5). This layer exists for what the jsdom suite
// structurally cannot see — `tests/helpers/editor.ts` stubs getClientRects and
// getBoundingClientRect to zeros, so no layout, focus or geometry assertion is
// reachable there, and a terminal grid is geometry.
//
// Both engines the component is expected to run in: WebKit (Safari) and Chromium.
// Every spec runs in both, so a spec may not pass by leaning on one engine's
// behaviour.
//
// Run with `pnpm test:e2e` (this config, then playwright.app.config.ts);
// `--project=webkit` narrows it. NOT part of
// `pnpm verify`: that is the fast gate every change runs and it must not grow a
// browser download.
import { defineConfig, devices } from "@playwright/test";
import { sessionPort } from "./e2e/helpers/ports.ts";

// The strict mode `make e2e` runs in (it sets CI=1): the gate a pull request is
// held to, as opposed to a developer iterating on one spec.
const ci = !!process.env["CI"];

const PORT = sessionPort();

// `make e2e` builds `dist/` from empty before it runs this, and says so, so the
// harness is bundled on top of that build. Run on its own, the config builds
// `dist/` itself: a spec must never meet the last build.
const bundle = process.env["E2E_DIST_BUILT"] ? "bundle:harness" : "build:harness";

// The app page's specs, which playwright.app.config.ts runs against its own server.
export const APP_SPECS = /(app-page|flows)\.spec\.ts/;

export default defineConfig({
	testDir: "e2e",
	projects: [
		// The browser harness (demo/harness.html) in both engines the component is
		// expected to run in.
		{
			name: "webkit",
			use: { ...devices["Desktop Safari"] },
			testIgnore: APP_SPECS,
		},
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: APP_SPECS,
		},
	],
	// A committed `test.only` silently reduces the suite to one test and the run
	// still goes green. That is the failure mode the gate exists to prevent.
	forbidOnly: ci,
	// One retry, in the gate only. Not to launder flakes: a retried pass is
	// reported as "flaky", which names the problem rather than hiding it.
	retries: ci ? 1 : 0,
	// A trace is what explains a failure after the run has gone; on-first-retry
	// keeps the cost off the passing run.
	use: { baseURL: `http://127.0.0.1:${PORT}`, trace: ci ? "on-first-retry" : "off" },
	// The HTML report is kept for a gate run that went red: `playwright-report/`.
	reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
	webServer: [
		{
			// `dist/` and demo/harness-app.js are inputs, not outputs, exactly as they
			// are for `make typecheck` and `make test`.
			command: `pnpm run ${bundle} && PORT=${PORT} node scripts/serve-harness.ts`,
			url: `http://127.0.0.1:${PORT}/demo/harness.html`,
			reuseExistingServer: !ci,
			stdout: "pipe",
		},
	],
});
