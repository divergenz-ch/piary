// The app page's popover: every menu the page opens goes through here.
//
// A backdrop that closes it, an anchor clamped to the window, and the keyboard
// — focus on the first item, arrows to move, Escape to close. Plain DOM, like
// the rest of the page, and the canvas's own `.doc-block-menu` classes, so the
// canvas's stylesheet draws these.

/** One row of a menu: a choice, a label over the choices after it, or a
 *  sentence the menu says before any choice (`verbatim`: text shown as it
 *  was written, line for line). A choice's `run` is called after the menu has
 *  closed. */
export type MenuItem =
	| { label: string; run: () => void; disabled?: boolean; title?: string; destructive?: boolean }
	| { section: string }
	| { note: string; verbatim?: boolean };

/** The menu that is open, so opening another closes it first. */
let current: { close: (restore: boolean) => void } | null = null;

/** Opens a popover anchored at viewport (x, y), below it, or above it with
 *  `above` for an anchor at the window's bottom edge. It closes on Escape, a
 *  backdrop click, or a chosen item; closed without a choice, focus goes back
 *  where it was. `null` opens nothing: what the menu was for went away before
 *  it could open. */
export function openMenu(x: number, y: number, items: readonly MenuItem[] | null, { above = false }: { above?: boolean } = {}): void {
	current?.close(false);
	if (!items) return;
	const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	const backdrop = document.createElement("div");
	backdrop.className = "doc-menu-backdrop";
	const menu = document.createElement("div");
	menu.className = "doc-block-menu";
	// Clamped in CSS rather than measured: `min()` against the viewport needs no
	// layout read and no resize listener, and the stylesheet's `max-height`
	// handles the vertical case whatever the item count.
	menu.style.left = `min(${x}px, calc(100vw - 15rem))`;
	if (above) {
		// Grown upward from the anchor, and no taller than the room above it.
		menu.style.bottom = `calc(100vh - ${y - 6}px)`;
		menu.style.maxHeight = `calc(${y - 6}px - 1rem)`;
	} else menu.style.top = `min(${y + 6}px, calc(100vh - 4rem))`;

	const close = (restore: boolean) => {
		backdrop.remove();
		menu.remove();
		current = null;
		if (restore && before?.isConnected) before.focus();
	};

	const rows = items.map((item) => {
		if ("section" in item || "note" in item) {
			const label = document.createElement("div");
			label.className = "section" in item ? "doc-menu-label" : item.verbatim ? "doc-menu-note doc-menu-verbatim" : "doc-menu-note";
			label.textContent = "section" in item ? item.section : item.note;
			return label;
		}
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = item.label;
		button.disabled = item.disabled ?? false;
		if (item.title) button.title = item.title;
		if (item.destructive) button.className = "doc-menu-destructive";
		button.addEventListener("click", () => {
			// Closed first: the item's edit places the caret, and a menu still
			// holding focus would take it straight back.
			close(false);
			item.run();
		});
		return button;
	});
	menu.append(...rows);
	// What the keyboard moves between: the choices that can be made.
	const buttons = rows.filter((row): row is HTMLButtonElement => row instanceof HTMLButtonElement && !row.disabled);

	backdrop.addEventListener("click", () => close(true));
	menu.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close(true);
			return;
		}
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
		event.preventDefault();
		const at = buttons.indexOf(event.target as HTMLButtonElement);
		const step = event.key === "ArrowDown" ? 1 : -1;
		buttons[(at + step + buttons.length) % buttons.length]?.focus();
	});

	document.body.append(backdrop, menu);
	current = { close };
	// A menu with nothing to choose still takes focus, or its Escape would go
	// to whatever had it before.
	if (buttons[0]) buttons[0].focus();
	else {
		menu.tabIndex = -1;
		menu.focus();
	}
}
