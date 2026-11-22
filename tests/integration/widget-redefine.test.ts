// What a cell shows across a redefinition, and a `view()` widget's value
// through one, under jsdom — run `pnpm build` first. notebook-kit's `Inputs` loads from a CDN that Node cannot
// import, so the widget here is a plain range input, which `view()` reads the
// same way; the `Inputs` form itself is held by the app's browser tier.
import test from "node:test";
import assert from "node:assert/strict";
import { boot } from "../helpers/editor.ts";

await boot();
const { NotebookEngine } = await import("../../dist/notebook/engine.js");

const slider = (name: string, max: number) =>
	`const ${name} = view(Object.assign(document.createElement("input"), {type: "range", min: 1, max: ${max}, value: "6"}))`;

/** The runtime recomputes through promises; poll until the predicate holds. */
async function until(fn: () => Promise<boolean>, timeout = 2000): Promise<void> {
	const start = Date.now();
	while (!(await fn())) {
		if (Date.now() - start > timeout) throw new Error("until: timed out");
		await new Promise((r) => setTimeout(r, 20));
	}
}

/** A mounted engine whose `turns` slider the user has moved to 15. */
async function moved() {
	const engine = new NotebookEngine();
	const root = document.createElement("div");
	document.body.append(root);
	engine.upsertCell("c", slider("turns", 20), { root });
	await until(async () => (await engine.value("turns")) === 6);
	const input = root.querySelector("input")!;
	input.value = "15";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await until(async () => (await engine.value("turns")) === 15);
	return { engine, root };
}

test("a redefinition that keeps the export name keeps the value the user set", async () => {
	const { engine, root } = await moved();
	engine.upsertCell("c", slider("turns", 30), { root });
	await until(async () => root.querySelector("input")?.max === "30");
	await until(async () => (await engine.value("turns")) === 15);
	assert.equal(root.querySelector("input")!.value, "15", "the new widget shows it, not its declared default");
	engine.dispose();
});

test("a redefinition that renames the export starts from the new declared default", async () => {
	const { engine, root } = await moved();
	engine.upsertCell("c", slider("loops", 30), { root });
	await until(async () => (await engine.value("loops").catch(() => null)) !== null);
	await new Promise((r) => setTimeout(r, 200)); // longer than the keep's first poll
	assert.equal(await engine.value("loops"), 6);
	engine.dispose();
});

test("a value kept through state() survives a redefinition too", async () => {
	const engine = new NotebookEngine();
	const root = document.createElement("div");
	document.body.append(root);
	engine.upsertCell("s", `const color = view(state("color", "blue"))`, { root });
	await until(async () => (await engine.value("color")) === "blue");
	engine.setState("color", "red");
	engine.upsertCell("s", `const color = view(state("color", "blue"))`, { root });
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(await engine.value("color"), "red");
	engine.dispose();
});

test("a redefined cell shows its new value where the old one was", async () => {
	const engine = new NotebookEngine();
	const root = document.createElement("div");
	document.body.append(root);
	engine.upsertCell("c", "1 + 1", { root });
	await until(async () => root.textContent === "2");
	engine.upsertCell("c", "2 + 2", { root });
	await until(async () => engine.state("c")?.status === "fulfilled");
	await new Promise((r) => setTimeout(r, 100)); // the replaced definition's last word, if it had one
	assert.equal(root.textContent, "4");
	engine.dispose();
});

test("an ojs viewof cell redefined under the same name keeps the value the user set", async () => {
	const viewof = (max: number) => `viewof turns = Object.assign(document.createElement("input"), {type: "range", min: 1, max: ${max}, value: "6"})`;
	const engine = new NotebookEngine();
	const root = document.createElement("div");
	document.body.append(root);
	engine.upsertCell("c", viewof(20), { mode: "ojs", root });
	await until(async () => (await engine.value("turns")) === 6);
	const input = root.querySelector("input")!;
	input.value = "15";
	input.dispatchEvent(new Event("input", { bubbles: true }));
	await until(async () => (await engine.value("turns")) === 15);
	engine.upsertCell("c", viewof(30), { mode: "ojs", root });
	await until(async () => root.querySelector("input")?.max === "30");
	await until(async () => (await engine.value("turns")) === 15);
	assert.equal(root.querySelector("input")!.value, "15");
	engine.dispose();
});

test("a removed cell leaves nothing drawn where it was", async () => {
	const engine = new NotebookEngine();
	const root = document.createElement("div");
	document.body.append(root);
	engine.upsertCell("c", "1 + 1", { root });
	await until(async () => root.textContent === "2");
	engine.removeCell("c");
	await new Promise((r) => setTimeout(r, 100));
	assert.equal(root.childNodes.length, 0);
	engine.dispose();
});
