// The Export window's page: one for the app, opened by File → Export…
// (`src-tauri/src/menu.rs`, ADR 0049).
//
// It asks two things in order — which conversations, then as what — and hands
// both to Rust, which asks where in the system's own panel and writes each
// conversation into the folder chosen. The page names no path. What it adds is
// what needs the format: the attachments each document references, and for
// the two kinds that read without Piary, the conversation drawn (ADR 0066).

import "../src/forward-console.ts";
import "../src/styles/styles.css";
import "./transfer.css";
import "./export-doc.css";

import { docsEntries, docsRead, type ExportKind, type ExportedOne, exitFlushed, exportConversations, onExitFlush, onExportFrom, onMenu } from "../src/bridge.ts";
import { attachmentRefs } from "../src/document/bundle.ts";
import { EXPORT_ROOT } from "../src/document/export-html.ts";
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
	{ kind: "html", label: "Web page (.html)", hint: "The conversation as it is drawn, in one file that opens without Piary." },
	{ kind: "pdf", label: "PDF", hint: "The conversation as it is drawn, on pages." },
];

/** Said when nothing was written because the panel was closed. */
const NOTHING_WRITTEN = "Nothing was exported.";

const root = document.getElementById("export")!;
const outcome = document.getElementById("outcome")!;
/** What this window shows to paper, and to nothing else (`export-doc.css`). */
const paper = document.getElementById("print-root")!;

type Line = { text: string; failed?: boolean };

const say = (lines: readonly Line[]) => {
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

const notExported = (id: string, why: unknown): Line => ({ text: `${id} was not exported: ${why instanceof Error ? why.message : String(why)}.`, failed: true });

/** One conversation's outcome, as a line. `without` is what a drawn export
 *  could not carry. */
function exportedLine({ id, name, missing, error }: ExportedOne, folder: string, without: readonly string[] = []): Line {
	if (error !== null) return notExported(id, error);
	const where = `${id} → ${folder}/${name}`;
	const lacks = [...(missing.length ? [`${counted(missing)} this workspace does not hold: ${missing.join(", ")}`] : []), ...without];
	return { text: lacks.length ? `${where}, without ${lacks.join("; ")}.` : `${where}.` };
}

/** The conversations as their documents: the file alone, or a bundle with the
 *  attachments each document references, read here from what is stored. */
async function exportStored(kind: ExportKind, ids: readonly string[]): Promise<Line[]> {
	const asked = await Promise.all(
		ids.map(async (id) => ({ id, attachments: kind === "markdown" ? [] : attachmentRefs((await docsRead(id)) ?? ""), content: null })),
	);
	const done = await exportConversations(asked, kind);
	return done ? done.conversations.map((one) => exportedLine(one, done.folder)) : [{ text: NOTHING_WRITTEN }];
}

/**
 * The conversations as they are drawn, each a page or a PDF.
 *
 * Each is drawn first, one at a time, by the code behind `export-render.ts`,
 * which is loaded here: it brings the whole canvas, and an export of the
 * documents themselves never needs it. A page goes to Rust as text. A PDF is
 * this window printed, so each conversation is put in `paper` in turn and
 * Rust is asked for that one; the folder is asked for once.
 */
async function exportDrawn(kind: "html" | "pdf", ids: readonly string[]): Promise<Line[]> {
	const { renderConversation } = await import("./export-render.ts");
	const lines = new Map<string, Line>();
	const drawn = [];
	for (const id of ids) {
		say([{ text: `Drawing ${id}…` }]);
		try {
			const md = await docsRead(id);
			if (typeof md !== "string") throw new Error(`${id} has not been saved yet`);
			drawn.push({ id, rendered: await renderConversation(id, md) });
		} catch (error) {
			lines.set(id, notExported(id, error));
		}
	}
	if (kind === "html" && drawn.length) {
		say([{ text: "Writing…" }]);
		const done = await exportConversations(drawn.map(({ id, rendered }) => ({ id, attachments: [], content: rendered.html })), kind);
		if (!done) return [{ text: NOTHING_WRITTEN }];
		for (const [i, one] of done.conversations.entries()) lines.set(one.id, exportedLine(one, done.folder, drawn[i]?.rendered.without));
	}
	if (kind === "pdf") {
		let into: string | undefined;
		for (const { id, rendered } of drawn) {
			say([{ text: `Printing ${id}…` }]);
			const page = document.createElement("div");
			page.className = EXPORT_ROOT;
			page.innerHTML = rendered.body;
			const style = document.createElement("style");
			style.textContent = rendered.css;
			paper.replaceChildren(style, page);
			try {
				// A picture not decoded yet is a blank on the page.
				await Promise.all([...page.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));
				const done = await exportConversations([{ id, attachments: [], content: null }], kind, into);
				// The panel is shown for the first alone, so closing it is the
				// whole export called off.
				if (!done) return [{ text: NOTHING_WRITTEN }];
				into = done.into;
				lines.set(id, exportedLine(done.conversations[0]!, done.folder, rendered.without));
			} finally {
				paper.replaceChildren();
			}
		}
	}
	return ids.flatMap((id) => lines.get(id) ?? []);
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
		void (kind === "html" || kind === "pdf" ? exportDrawn(kind, chosen()) : exportStored(kind, chosen()))
			.then(say, failed)
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
