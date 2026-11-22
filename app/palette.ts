// The command palette: every `/` command in a panel over the window, with a
// field to search them, opened by Commands… in the menu bar. It lists what
// the `/` menu lists (`app/command-catalog.ts`) and a row does what its row
// there does, so the two cannot name or do different things.
//
// Unlike the `/` menu it needs no caret in the trailing prompt: it opens
// wherever the user is, and while a reply streams.

import "./palette.css";
import type { IconNode } from "lucide";
import { iconDOM } from "../src/utils/icons.ts";
import { type CommandEntry, matching } from "./command-catalog.ts";

export interface Palette {
	open(): void;
}

/** Once per window. `entries` is asked at every opening, so the list is
 *  what the `/` menu holds then; `iconOf` is the icon its row there has, and
 *  `choose` runs a row as that menu would. */
export function mountPalette(
	entries: () => readonly CommandEntry[],
	iconOf: (entry: CommandEntry) => IconNode | undefined,
	choose: (entry: CommandEntry) => void,
): Palette {
	let shown: HTMLElement | null = null;

	const close = () => {
		shown?.remove();
		shown = null;
	};

	const open = () => {
		if (shown) return;
		const all = entries();
		const backdrop = document.createElement("div");
		backdrop.className = "palette-backdrop";
		const panel = document.createElement("div");
		panel.className = "palette";
		panel.setAttribute("role", "dialog");
		panel.setAttribute("aria-label", "Commands");
		const field = document.createElement("input");
		field.className = "palette-field";
		field.type = "text";
		field.placeholder = "Search commands";
		field.setAttribute("aria-label", "Search commands");
		const list = document.createElement("ul");
		list.className = "palette-list";
		list.setAttribute("role", "listbox");
		panel.append(field, list);
		backdrop.append(panel);

		let rows: CommandEntry[] = [];
		let at = 0;
		const run = (entry: CommandEntry | undefined) => {
			if (!entry) return;
			close();
			choose(entry);
		};
		const mark = () => {
			[...list.children].forEach((row, i) => {
				row.toggleAttribute("aria-selected", i === at);
				if (i === at) row.scrollIntoView({ block: "nearest" });
			});
		};
		const draw = () => {
			rows = matching(all, field.value);
			at = 0;
			list.replaceChildren(
				...rows.map((entry) => {
					const row = document.createElement("li");
					row.className = "palette-row";
					row.setAttribute("role", "option");
					const name = document.createElement("span");
					name.className = "palette-name";
					name.textContent = `/${entry.name}`;
					const said = document.createElement("span");
					said.className = "palette-said";
					said.textContent = entry.description ?? "";
					const drawn = document.createElement("span");
					drawn.className = "palette-icon";
					const icon = iconOf(entry);
					if (icon) drawn.append(iconDOM(icon, "sm"));
					row.append(drawn, name, said);
					if (entry.shortcut) {
						const keys = document.createElement("kbd");
						keys.className = "palette-keys";
						keys.textContent = entry.shortcut;
						row.append(keys);
					}
					row.addEventListener("click", () => run(entry));
					return row;
				}),
			);
			if (rows.length === 0) {
				const none = document.createElement("li");
				none.className = "palette-none";
				none.textContent = "No command matches.";
				list.append(none);
			}
			mark();
		};

		field.addEventListener("input", draw);
		field.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				if (rows.length) at = (at + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
				mark();
			} else if (event.key === "Enter") {
				event.preventDefault();
				run(rows[at]);
			} else if (event.key === "Escape") {
				event.preventDefault();
				close();
			}
		});
		backdrop.addEventListener("mousedown", (event) => {
			if (event.target === backdrop) close();
		});

		shown = backdrop;
		document.body.append(backdrop);
		draw();
		field.focus();
	};

	return { open };
}
