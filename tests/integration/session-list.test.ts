// The conversation list's rows — run `pnpm build` first, then
// `node --test tests/integration/session-list.test.ts`.
//
// Without `actionsMenu` each row shows a rename and a delete button; a host
// that sets it, as the app does, shows one `⋯` instead, which announces the
// row's menu and leaves its items to the host.
import test from "node:test";
import assert from "node:assert/strict";
import { boot, settle } from "../helpers/editor.ts";
import type { SessionList } from "../../dist/components/SessionList.js";

const ROWS = [
	{ sid: "web-1", n: 0, mtime: 2, label: "First", channel: "web" as const },
	{ sid: "web-2", n: 0, mtime: 1, label: "Second", channel: "web" as const },
];

async function mountList(actionsMenu: boolean): Promise<SessionList> {
	await boot();
	await import("../../dist/components/SessionList.js");
	const list = document.createElement("session-list") as SessionList;
	list.sessions = ROWS;
	if (actionsMenu) list.actionsMenu = true;
	document.body.append(list);
	await settle();
	return list;
}

test("without the actions menu, a row keeps its rename and delete buttons", async () => {
	const list = await mountList(false);
	try {
		const row = list.querySelector(".session-row")!;
		assert.ok(row.querySelector('[aria-label="Rename session"]'));
		assert.ok(row.querySelector('[aria-label="Delete session"]'));
		assert.equal(row.querySelector(".session-more"), null);
	} finally {
		list.remove();
	}
});

test("with the actions menu, a row has one ⋯ that announces the row's menu", async () => {
	const list = await mountList(true);
	try {
		const row = list.querySelectorAll(".session-row")[1]!;
		assert.equal(row.querySelector('[aria-label="Rename session"]'), null);
		assert.equal(row.querySelector('[aria-label="Delete session"]'), null);
		const more = row.querySelector<HTMLButtonElement>(".session-more")!;
		assert.ok(more, "a ⋯ button");
		const seen: unknown[] = [];
		list.addEventListener("session-menu", (event) => seen.push((event as CustomEvent).detail));
		let selected = false;
		list.addEventListener("session-select", () => (selected = true));
		more.click();
		assert.equal(seen.length, 1);
		assert.equal((seen[0] as { sid: string }).sid, "web-2");
		assert.equal(selected, false, "the ⋯ is not a click on the row");
	} finally {
		list.remove();
	}
});

test("the host can put a row into its inline rename", async () => {
	const list = await mountList(true);
	try {
		list.startRename("web-1");
		await settle();
		const input = list.querySelector<HTMLInputElement>(".session-rename");
		assert.ok(input, "the row's rename field is open");
		assert.equal(input.value, "First");
	} finally {
		list.remove();
	}
});
