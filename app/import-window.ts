// The Import window's page: one for the app, opened by File → Import…
// (`src-tauri/src/menu.rs`, ADR 0049).
//
// It asks what to import — Rust shows the system's panel, reads what was
// picked and holds it under a token, so the page names no path — and, when
// the name is taken, what to do about that. The page does what needs the
// format: the document bound to its own name, the attachments it references,
// its links following a file stored under another name.

import "../src/forward-console.ts";
import "../src/styles/styles.css";
import "./transfer.css";

import { docsList, exitFlushed, type ImportStaged, importCancel, importPick, importPlace, importWrite, onExitFlush, onMenu, openDocument } from "../src/bridge.ts";
import { attachmentRefs, freeId, importVerdict, renameAttachments } from "../src/document/bundle.ts";
import { counted, windowVerbs } from "./transfer.ts";

/** Said when the panel was closed with nothing picked. */
const NOTHING_PICKED = "Nothing was imported.";

const root = document.getElementById("import")!;
const outcome = document.getElementById("outcome")!;

const say = (text: string, failed = false) => {
	const line = document.createElement("p");
	line.textContent = text;
	if (failed) line.className = "transfer-failed";
	outcome.replaceChildren(...(text ? [line] : []));
};
const failed = (error: unknown) => say(String(error), true);

/** What an import says once it is written. */
function importedNotice(id: string, readOnly: string | null, broken: readonly string[]): string {
	const said = [`Imported as ${id}.`];
	if (readOnly) said.push(`It is read-only: ${readOnly}.`);
	if (broken.length) said.push(`${counted(broken)} it links to did not come with it: ${broken.join(", ")}.`);
	return said.join(" ");
}

function button(label: string, primary = false): HTMLButtonElement {
	const made = document.createElement("button");
	made.type = "button";
	made.textContent = label;
	if (primary) made.className = "transfer-go";
	return made;
}

/** The import picked and not yet written or let go, if there is one. */
let held: ImportStaged | null = null;

const release = () => {
	const token = held?.token;
	held = null;
	if (token) void importCancel(token).catch(() => {});
};

/** Writes the held import under `id` and opens it. */
async function write(staged: ImportStaged, id: string, replace: boolean): Promise<void> {
	const { content, readOnly } = importVerdict(staged.content, id);
	const { renames, broken } = await importPlace(staged.token, attachmentRefs(content));
	await importWrite(staged.token, id, renameAttachments(content, renames), replace);
	// Written: the token is spent, and nothing is left to let go.
	held = null;
	say(importedNotice(id, readOnly, broken));
	await openDocument(id);
}

/** The first thing the window asks: what to import. */
function drawChoice(): void {
	const hint = document.createElement("p");
	hint.className = "transfer-hint";
	hint.textContent = "A conversation comes in as a Markdown file, or as a bundle — a folder or a zip holding the file and its attachments.";
	const actions = document.createElement("div");
	actions.className = "transfer-actions";
	const file = button("Choose a Markdown file or a zip…", true);
	const folder = button("Choose a folder…");
	actions.append(file, folder);
	root.replaceChildren(hint, actions);

	const pick = (kind: "file" | "folder") => {
		say("");
		file.disabled = folder.disabled = true;
		void (async () => {
			const staged = await importPick(kind);
			if (!staged) return say(NOTHING_PICKED);
			held = staged;
			const taken = await docsList();
			if (taken.includes(staged.name)) return drawQuestion(staged, freeId(staged.name, taken));
			await write(staged, staged.name, false);
		})()
			.catch((error: unknown) => {
				release();
				failed(error);
			})
			.finally(() => void (file.disabled = folder.disabled = false));
	};
	file.addEventListener("click", () => pick("file"));
	folder.addEventListener("click", () => pick("folder"));
}

/** The second, only when the name is taken: beside the other, or over it. */
function drawQuestion(staged: ImportStaged, kept: string): void {
	const hint = document.createElement("p");
	hint.className = "transfer-hint";
	hint.textContent = `A conversation called ${staged.name} is already here.`;
	const choices = document.createElement("section");
	choices.className = "transfer-group";
	const radios = [
		{ value: "keep", label: `Keep both: import this one as ${kept}` },
		{ value: "replace", label: `Replace ${staged.name}. The one replaced is kept as a backup.` },
	].map(({ value, label }, i) => {
		const row = document.createElement("label");
		row.className = "transfer-row";
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "clash";
		radio.value = value;
		radio.checked = i === 0;
		const name = document.createElement("span");
		name.textContent = label;
		row.append(radio, name);
		choices.append(row);
		return radio;
	});
	const actions = document.createElement("div");
	actions.className = "transfer-actions";
	const go = button("Import", true);
	const cancel = button("Cancel");
	actions.append(go, cancel);
	root.replaceChildren(hint, choices, actions);

	cancel.addEventListener("click", () => {
		release();
		say(NOTHING_PICKED);
		drawChoice();
	});
	go.addEventListener("click", () => {
		const replace = radios.find((radio) => radio.checked)!.value === "replace";
		go.disabled = cancel.disabled = true;
		void write(staged, replace ? staged.name : kept, replace)
			.catch((error: unknown) => {
				release();
				failed(error);
			})
			.finally(drawChoice);
	});
}

drawChoice();

// The menu's clicks come here while this window is focused (`transfer.ts`).
const verbs = windowVerbs((message) => say(message, true));
void onMenu((id) => verbs[id]?.());

// Closing with an import picked and unanswered lets it go; nothing else here
// is held, so the host closing this window or quitting is answered at once
// (ADR 0019 §2).
void onExitFlush(() => {
	release();
	void exitFlushed();
});
