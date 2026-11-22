import { join } from "node:path";
import { defineConfig } from "vite";

// The app page. Vite rather than the repo's esbuild scripts because Tauri's dev
// command expects a dev server with HMR at a fixed address, which is what
// `devUrl` in src-tauri/tauri.conf.json names.
export default defineConfig({
	// `import.meta.dirname`, not `__dirname`: Vite's native config loader does
	// not provide the CommonJS globals and warns that it will stop being
	// optional.
	root: import.meta.dirname,
	server: {
		// Matches src-tauri/tauri.conf.json's devUrl. `--port` overrides it, which
		// is how the e2e run gets a port of its own; strictPort so a collision
		// fails loudly rather than moving the server somewhere nothing is looking.
		port: 5190,
		strictPort: true,
		// Explicit, because Vite's default resolves to `localhost` and answers on
		// ::1 alone — so anything dialling 127.0.0.1, which is what the e2e run
		// polls, gets a refused connection and reads it as a server that never
		// started.
		host: "127.0.0.1",
	},
	// Tauri shows the build's own output; Vite clearing the screen takes the Rust
	// errors with it.
	clearScreen: false,
	build: {
		outDir: "dist",
		emptyOutDir: true,
		target: "safari15",
		// A document's window, and the windows that are forms: Preferences
		// (ADR 0048), Import and Export (ADR 0049). The fixture recorder is a
		// page of a build made to record with, and of no other
		// (docs/TEST_ARCHITECTURE.md §6).
		rolldownOptions: { input: ["index.html", "preferences.html", "import.html", "export.html", ...(process.env.PIARY_FACE_RECORD === "1" ? ["face-record.html"] : [])].map((page) => join(import.meta.dirname, page)) },
	},
});
