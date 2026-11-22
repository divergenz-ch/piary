// The Export window's page: one for the app, opened by File → Export…
// (`src-tauri/src/menu.rs`, ADR 0049).
//
// It asks two things in order — which conversations, then as what — and hands
// both to Rust, which asks where in the system's own panel and writes each
// conversation into the folder chosen. The page names no path. What it adds is
// what needs the format: the attachments each document references.

import "../src/forward-console.ts";
import "../src/styles/styles.css";
import "./transfer.css";

import { docsEntries, docsRead, type ExportKind, type ExportedOne, exitFlushed, exportConversations, onExitFlush, onExportFrom, onMenu } from "../src/bridge.ts";
import { attachmentRefs } from "../src/document/bundle.ts";
import { nameOf } from "./documents.ts";
import { counted, windowVerbs } from "./transfer.ts";

/** How many conversations are read for a heading, as Open… reads them: past
 *  this many the list names the rest by id, so a workspace of hundreds draws
 *  at once. */
const HEADINGS_READ = 50;

/** The forms a conversation leaves in, the first the one chosen to begin with. */
const KINDS: readonly { kind: ExportKind; label: string; hint: string }[] = [
	{ kind: "markdown", label: "Markdown (.md)", hint: "The conversation's file alone." },
	{ kind: "folder", label: "Folder, with attachments", hint: "The file beside the files it shows." },
	{ kind: "zip", label: "Zip, with attachments", hint: "That folder as one file, to hand to someone." },
];

/** Said when nothing was written because the panel was closed. */
const NOTHING_WRITTEN = "Nothing was exported.";

const root = document.getElementById("export")!;
const outcome = document.getElementById("outcome")!;

const say = (lines: readonly { text: string; failed?: boolean }[]) => {
	outcome.replaceChildren(
		...lines.map(({ text, failed }) => {
			const line = document.createElement("p");
			line.textContent = text;
			if (failed) line.className = "transfer-failed";
			return line;
		}),
	);
};
const failed = (error: unknown) => say([{ text: String(error), failed: true }]);

/** One conversation's outcome, as a line. */
function exportedLine({ id, name, missing, error }: ExportedOne, folder: string): { text: string; failed?: boolean } {
	if (error !== null) return { text: `${id} was not exported: ${error}.`, failed: true };
	const where = `${id} → ${folder}/${name}`;
	return missing.length ? { text: `${where}, without ${counted(missing)} this workspace does not hold: ${missing.join(", ")}.` } : { text: `${where}.` };
}

function section(title: string): HTMLElement {
	const group = document.createElement("section");
	group.className = "transfer-group";
	const heading = document.createElement("h2");
	heading.textContent = title;
	group.append(heading);
	return group;
}

/** Draws the window on the workspace as it is now, with `from` chosen: the
 *  conversation the export was asked for, if it was asked for one. */
async function draw(from: string | null): Promise<void> {
	const entries = await docsEntries();
	const texts = await Promise.all(entries.map(({ id }, i) => (i < HEADINGS_READ ? docsRead(id).catch(() => null) : null)));

	const which = section("Which conversations");
	const list = document.createElement("div");
	list.className = "transfer-list";
	const boxes = entries.map(({ id }, i) => {
		const row = document.createElement("label");
		row.className = "transfer-row";
		const box = document.createElement("input");
		box.type = "checkbox";
		box.value = id;
		box.checked = id === from;
		const name = document.createElement("span");
		name.textContent = nameOf(id, texts[i] ?? null);
		const tag = document.createElement("span");
		tag.className = "transfer-id";
		tag.textContent = id;
		row.append(box, name, tag);
		list.append(row);
		return box;
	});
	if (!entries.length) list.textContent = "No conversations yet";
	which.classList.add("transfer-grow");
	which.append(list);

	const as = section("As what");
	const radios = KINDS.map(({ kind, label, hint }, i) => {
		const row = document.createElement("label");
		row.className = "transfer-row";
		row.title = hint;
		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "kind";
		radio.value = kind;
		radio.checked = i === 0;
		const name = document.createElement("span");
		name.textContent = label;
		row.append(radio, name);
		as.append(row);
		return radio;
	});

	const actions = document.createElement("div");
	actions.className = "transfer-actions";
	const go = document.createElement("button");
	go.type = "button";
	go.className = "transfer-go";
	go.textContent = "Export…";
	actions.append(go);

	const chosen = () => boxes.filter((box) => box.checked).map((box) => box.value);
	const enable = () => void (go.disabled = chosen().length === 0);
	list.addEventListener("change", enable);
	enable();

	go.addEventListener("click", () => {
		const kind = radios.find((radio) => radio.checked)!.value as ExportKind;
		go.disabled = true;
		say([]);
		void (async () => {
			const asked = await Promise.all(
				chosen().map(async (id) => ({
					id,
					// The markdown file alone carries none; a bundle carries the
					// ones its document references, read here from what is stored.
					attachments: kind === "markdown" ? [] : attachmentRefs((await docsRead(id)) ?? ""),
				})),
			);
			const done = await exportConversations(asked, kind);
			say(done ? done.conversations.map((one) => exportedLine(one, done.folder)) : [{ text: NOTHING_WRITTEN }]);
		})()
			.catch(failed)
			.finally(enable);
	});

	root.replaceChildren(which, as, actions);
}

// The conversation that was in front when Export… was chosen, or the one
// whose row asked.
void draw(new URLSearchParams(location.search).get("from")).catch(failed);

// Asked for again while open, for one conversation: drawn again, on that one
// alone — the workspace may hold conversations it did not when this window
// opened — and what the last export said no longer describes what is chosen.
void onExportFrom((id) => {
	say([]);
	void draw(id).catch(failed);
});

// The menu's clicks come here while this window is focused (`transfer.ts`).
const verbs = windowVerbs((message) => say([{ text: message, failed: true }]));
void onMenu((id) => verbs[id]?.());

// This window holds nothing to write, so the host closing it or quitting is
// answered at once (ADR 0019 §2).
void onExitFlush(() => void exitFlushed());
