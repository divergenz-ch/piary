// The static server Playwright's `webServer` runs (playwright.config.ts).
//
// Why not esbuild's own `--servedir`, which the demo scripts use: esbuild's serve
// mode stops as soon as its stdin closes, and a process manager does not promise
// to hold stdin open. The harness bundle is a build artifact, so serving it needs
// no watcher — a plain file server is the whole requirement, and it costs no
// dependency (docs/HANDBOOK.md dependency policy).
//
// PORT=0 is the default on purpose: the repo never hardcodes a test port
// (docs/HANDBOOK.md, Key facts), so the port is chosen by the OS and printed as the
// `harness listening on <port>` line that playwright.config.ts waits for.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT ?? 0);

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
	".woff": "font/woff",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
	// Normalize before joining: a `..` segment in the request must not reach
	// outside the repo, and the resolved path is re-checked below.
	const target = join(ROOT, normalize(path));
	if (!target.startsWith(ROOT)) {
		res.writeHead(403).end("forbidden");
		return;
	}
	try {
		const stat = statSync(target);
		if (stat.isDirectory()) {
			res.writeHead(404).end("not found");
			return;
		}
		res.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream" });
		createReadStream(target).pipe(res);
	} catch {
		res.writeHead(404).end("not found"); // missing file: the spec's URL is wrong, and 404 says so
	}
});

server.listen(PORT, "127.0.0.1", () => {
	const addr = server.address();
	const port = typeof addr === "object" && addr ? addr.port : PORT;
	// The line playwright.config.ts greps for. Keep the wording in step with it.
	console.log(`harness listening on ${port}`);
});
