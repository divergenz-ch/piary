// The native app's own page, served by Vite with the IPC stubbed — layer 3 of
// docs/TEST_ARCHITECTURE.md. WebKit only: this page ships in a WKWebView and
// nowhere else, so a Chromium run would assert against an engine the app never
// meets.
//
// A config of its own, rather than a project in playwright.config.ts, because a
// config starts every `webServer` it names whatever project is selected: here
// only Vite starts, which is what keeps the `@smoke` leg of `pnpm test:smoke`
// from paying for the harness build. Everything else — the strict mode, retries,
// traces, reporter — is the harness config's.
import { defineConfig, devices } from "@playwright/test";
import base, { APP_SPECS } from "./playwright.config.ts";
import { sessionPort } from "./e2e/helpers/ports.ts";

const ci = !!process.env["CI"];
// Its own port for the same reason the harness has one: two checkouts must be
// able to run specs at once.
const APP_PORT = sessionPort("app");

// Four, not the machine's cores: at six, specs that wait on a debounce or a
// frame fail on a busy machine, and `make ci` runs cargo beside this.
const APP_WORKERS = 4;

export default defineConfig({
	...base,
	// Two spec files hold every test here, and a worker takes a whole file unless
	// told otherwise — so the run would never use more than two.
	fullyParallel: true,
	workers: APP_WORKERS,
	projects: [
		{
			name: "app",
			use: { ...devices["Desktop Safari"], baseURL: `http://127.0.0.1:${APP_PORT}` },
			// The app's own page: its welcome document, and the flows a user walks
			// through it.
			testMatch: APP_SPECS,
		},
	],
	// Beside the harness run's output rather than over it: `pnpm test:e2e` runs
	// both configs in turn, and each clears its own folders when it starts.
	outputDir: "test-results/app",
	reporter: ci ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/app" }]] : "list",
	webServer: {
		// `--port` overrides the Vite config's own, so the port this run agreed on
		// is the one Vite binds.
		command: `npx vite --config app/vite.config.ts --port ${APP_PORT} --strictPort`,
		url: `http://127.0.0.1:${APP_PORT}/`,
		reuseExistingServer: !ci,
		stdout: "pipe",
	},
});
