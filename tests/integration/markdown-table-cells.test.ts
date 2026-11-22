// A rendered table's cells in the real editor — run pnpm build first.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, unmount } from "../helpers/editor.ts";

const TABLE =
	"| Item | Price |\n|---|---|\n| **Subtotal** | **696.00** |\n| Fuel \\* | [terms](https://x.test) |\n| [x](javascript:alert(1)) | `net` |";
const md = `<!-- pi -->\n\n${TABLE}\n\n<!-- you -->\n\n`;

const cells = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>(".doc-md-table td")];
const focus = (el: HTMLElement) => el.dispatchEvent(new window.FocusEvent("focus"));
/** Focus leaving the table for somewhere outside it, which is what commits. */
const leave = (el: HTMLElement) => el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));

test("a cell shows its inline markdown rendered, never the marks", async () => {
	const { el, view } = await mount(md);
	try {
		const [subtotal, amount, fuel, terms, unsafe, code] = cells(view.contentDOM);
		assert.equal(subtotal.textContent, "Subtotal");
		assert.equal(subtotal.querySelector("strong")?.textContent, "Subtotal", "bold is drawn as bold");
		assert.equal(amount.textContent, "696.00");
		assert.equal(fuel.textContent, "Fuel *", "an escape shows its character alone");
		assert.equal(terms.textContent, "terms", "a link shows its label");
		assert.equal(unsafe.textContent, "x");
		assert.equal(code.querySelector("code")?.textContent, "net");
	} finally {
		unmount(el);
	}
});

test("a focused cell shows its source, and leaving it unedited changes nothing", async () => {
	const { el, view } = await mount(md);
	try {
		const [subtotal] = cells(view.contentDOM);
		focus(subtotal);
		assert.equal(subtotal.textContent, "**Subtotal**", "the cell being edited is its markdown");
		leave(subtotal);
		assert.equal(view.state.doc.toString(), md, "a look is not an edit: the marks are still in the document");
		assert.equal(cells(view.contentDOM)[0].textContent, "Subtotal", "and the cell is drawn rendered again");
		assert.ok(cells(view.contentDOM)[0].querySelector("strong"));
	} finally {
		unmount(el);
	}
});

test("an edit to a cell's source lands in the document, marks included", async () => {
	const { el, view } = await mount(md);
	try {
		const [subtotal] = cells(view.contentDOM);
		focus(subtotal);
		subtotal.textContent = "**Total**";
		leave(subtotal);
		assert.equal(view.state.doc.toString(), md.replace("**Subtotal**", "**Total**"));
		assert.equal(cells(view.contentDOM)[0].querySelector("strong")?.textContent, "Total");
	} finally {
		unmount(el);
	}
});

test("Escape gives a cell back as it was, rendered", async () => {
	const { el, view } = await mount(md);
	try {
		const [subtotal] = cells(view.contentDOM);
		focus(subtotal);
		subtotal.textContent = "scratch";
		subtotal.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		assert.equal(subtotal.textContent, "Subtotal");
		leave(subtotal);
		assert.equal(view.state.doc.toString(), md);
	} finally {
		unmount(el);
	}
});

test("a link in a cell opens on a modified click only, and only where the canvas would open it", async (t) => {
	const { el, view } = await mount(md);
	const opened: unknown[][] = [];
	t.mock.method(window, "open", (...args: unknown[]) => opened.push(args));
	try {
		const [, , , terms, unsafe] = cells(view.contentDOM);
		const press = (cell: HTMLElement, options: MouseEventInit) => {
			const event = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, ...options });
			(cell.firstElementChild ?? cell).dispatchEvent(event);
			return event;
		};
		press(terms, {});
		assert.deepEqual(opened, [], "a plain click is for editing");
		assert.equal(press(terms, { metaKey: true }).defaultPrevented, true, "opening does not start an edit");
		press(unsafe, { metaKey: true });
		assert.deepEqual(opened, [["https://x.test", "_blank", "noopener"]]);
		assert.equal(view.state.doc.toString(), md);
	} finally {
		unmount(el);
	}
});
