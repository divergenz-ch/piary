// The packaged app ships `pi-extension/` as it is on disk, with no
// `node_modules` beside it (tauri.conf.json `resources`), and the `view` tool
// must still refuse a surface the page would refuse (ADR 0043). The check's
// processor comes from pi-extension/a2ui-core.bundle.js, which `pnpm build`
// writes: this copies the package somewhere `@a2ui/web_core` cannot be
// resolved from, as a bundle's Resources is, and asks it about a catalog fault.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const EXTENSION = new URL("../../pi-extension/", import.meta.url).pathname;

/** A fault only the catalog knows: the shape is right and it holds no formula. */
const UNKNOWN_COMPONENT = { components: [{ id: "root", component: "NoSuchComponent" }] };

test("the extension refuses a catalog fault with no node_modules beside it", () => {
	const packaged = mkdtempSync(join(tmpdir(), "piary-extension-"));
	try {
		cpSync(EXTENSION, packaged, { recursive: true });
		const script =
			`const { checkA2ui } = await import(${JSON.stringify(join(packaged, "a2ui.ts"))});` +
			`console.log(JSON.stringify(await checkA2ui(${JSON.stringify(UNKNOWN_COMPONENT)})));`;
		const answer = JSON.parse(
			execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: packaged, encoding: "utf8" }),
		) as { problem?: string; note?: string };
		assert.equal(answer.note, undefined, "the surface was passed without the catalog's check");
		assert.match(answer.problem ?? "", /NoSuchComponent/);
	} finally {
		rmSync(packaged, { recursive: true, force: true });
	}
});
