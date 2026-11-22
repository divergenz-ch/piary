// Link gestures in the real editor — run pnpm build first.
import test from "node:test";
import assert from "node:assert/strict";
import { mount, unmount } from "../helpers/editor.ts";

// A null URL is a scheme the editor must refuse to open (javascript:).
type Link = readonly [source: string, label: string, url: string | null];

const links: readonly Link[] = [
	["[Website](https://piary.example)", "Website", "https://piary.example"],
	["[hello@example.com](mailto:hello@example.com)", "hello@example.com", "mailto:hello@example.com"],
	["[https://label.test](https://destination.test)", "https://label.test", "https://destination.test"],
	["https://wa.me/15555550100", "wa.me", "https://wa.me/15555550100"],
	["[Signal](https://signal.me/#eu/contact)", "Signal", "https://signal.me/#eu/contact"],
	["[Unsafe](javascript:alert(1))", "Unsafe", null],
];

for (const [source, label, url] of links) {
	test(`link gesture: ${label}`, async (t) => {
		const md = `<!-- pi:note -->\n\n${source}\n\n<!-- you -->\n\n`;
		const { el, view } = await mount(md);
		const opened: unknown[][] = [];
		t.mock.method(window, "open", (...args: unknown[]) => opened.push(args));
		// jsdom has no geometry; resolve the pointer to the label under test.
		t.mock.method(view, "posAtCoords", () => md.indexOf(label) + 2);
		const press = (options: MouseEventInit) => {
			const event = new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, ...options });
			view.contentDOM.dispatchEvent(event);
			window.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
			return event;
		};
		try {
			const hidden = [...view.contentDOM.querySelectorAll(".doc-md-hide")].map((span) => span.textContent);
			assert.ok(!hidden.includes(label), "the link label stays visible");
			press({});
			press({ button: 2, ctrlKey: true });
			assert.deepEqual(opened, [], "plain and right-clicks never navigate");
			for (const modifier of ["metaKey", "ctrlKey"]) {
				const event = press({ [modifier]: true });
				if (url) assert.equal(event.defaultPrevented, true, "opening doesn't move the caret");
			}
			assert.deepEqual(opened, url ? [[url, "_blank", "noopener"], [url, "_blank", "noopener"]] : []);
			assert.equal(view.state.doc.toString(), md, "navigation doesn't edit the document");
		} finally {
			unmount(el);
		}
	});
}
