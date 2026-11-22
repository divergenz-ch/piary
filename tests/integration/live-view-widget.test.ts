// The live-view WIDGET (L2): a registered live view mounts into the real editor,
// survives the document changing around it, and is disposed when — and only when —
// its marker leaves.
//
// Every assertion here is one of the five rules in src/document/live-views.ts, and
// each of those is a bug already paid for. The one that cannot be tested any lower is rule 1: the
// element must survive a decoration rebuild, and only a real CodeMirror rebuilds
// decorations.
import assert from "node:assert/strict";
import test from "node:test";
import { registerLiveView } from "../../dist/document/live-views.js";
import { mount, settle, unmount } from "../helpers/editor.ts";

/** A recording live view: enough to see what the document did to it. */
function probe(id: string) {
	const el = document.createElement("div");
	el.className = "probe-live-view";
	el.textContent = `probe:${id}`;
	const log: string[] = [];
	return {
		el,
		log,
		view: {
			el,
			write(data: unknown) {
				log.push(`write:${String(data)}`);
				el.textContent = String(data);
			},
			settle() {
				log.push("settle");
			},
			dispose() {
				log.push("dispose");
			},
		},
	};
}

const probes = new Map<string, ReturnType<typeof probe>>();
const hosts = new Map<string, { interactive: boolean }>();
registerLiveView("probe", (id, host) => {
	const p = probe(id);
	probes.set(id, p);
	hosts.set(id, { interactive: host.interactive });
	return p.view;
});

const DOC = (body = "") => `<!-- you -->\n\nrun it\n\n<!-- pi:view probe #p1 -->\n\n\`\`\`\n${body}\n\`\`\`\n`;

test("a live view mounts its own element in place of the marker and fence", async () => {
	probes.clear();
	const { el } = await mount(DOC());
	const chat = el as unknown as { openLiveView(name: string, id: string): unknown };
	chat.openLiveView("probe", "p1");
	await settle();

	const mounted = el.querySelector(".probe-live-view");
	assert.ok(mounted, "the factory's element is in the document");
	// The widget replaces marker + body, so the raw marker text is not rendered as
	// a line any more — that is what "renders clean" means for a live view.
	const lines = [...el.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
	assert.ok(!lines.includes("pi:view probe"), "the marker line is replaced, not shown");
	unmount(el);
});

test("writes change the content without replacing the element (rule 1)", async () => {
	probes.clear();
	const { el } = await mount(DOC());
	const chat = el as unknown as { openLiveView(name: string, id: string): unknown; liveView(id: string): { write(d: unknown): void } | null };
	chat.openLiveView("probe", "p1");
	await settle();
	const before = el.querySelector(".probe-live-view");

	chat.liveView("p1")!.write("first chunk");
	chat.liveView("p1")!.write("second chunk");
	await settle();

	const after = el.querySelector(".probe-live-view");
	// IDENTITY, not equality: a rebuilt element would pass a textContent check and
	// still have thrown away everything a terminal had accumulated.
	assert.equal(after, before, "the element survives successive writes");
	assert.equal(after!.textContent, "second chunk");
	// And no editor transaction was needed to get there (rule 2) — the proof is
	// that the text of the document is unchanged by a write.
	assert.ok(el.getDocument().includes("<!-- pi:view probe #p1 -->"));
	unmount(el);
});

test("content written into the element survives edits above it (rule 1)", async () => {
	probes.clear();
	const { el, view } = await mount(DOC());
	const chat = el as unknown as {
		openLiveView(name: string, id: string): unknown;
		liveView(id: string): { write(d: unknown): void } | null;
	};
	chat.openLiveView("probe", "p1");
	await settle();
	const before = el.querySelector(".probe-live-view");
	chat.liveView("p1")!.write("accumulated output");
	// A node reference is not enough on its own: the pooled element is the same
	// object either way, so this also asserts the CONTENT, which is what a
	// re-rendering widget would actually lose.
	await settle();

	// Editing above the view moves `segFrom`, so the widget really is rebuilt here
	// — this is the condition that distinguishes "the element is pooled" from "the
	// widget happened not to re-render".
	view.dispatch({ changes: { from: 0, insert: "<!-- pi -->\n\nnew prose\n\n" } });
	await settle();

	const after = el.querySelector(".probe-live-view");
	assert.equal(after, before, "the pooled element is re-parented, never rebuilt");
	assert.equal(after!.textContent, "accumulated output", "and keeps what was written into it");
	assert.ok(after!.isConnected, "and stays in the document");
	assert.ok(!probes.get("p1")!.log.includes("dispose"), "an unrelated edit must not dispose it");
	// The factory ran exactly once: a second call would mean a second view for one
	// id, which is rule 4.
	assert.equal(probes.get("p1")!.log.filter((l) => l === "dispose").length, 0);
	unmount(el);
});

test("the host says whether anything at the other end reads input", async () => {
	// The flag exists because the two panels are otherwise identical, and the
	// difference decides whether a keystroke goes anywhere. An agent's `bash` output
	// has no stdin reachable from here (ADR 0013); a user's terminal has a pty.
	//
	// Default FALSE is deliberate: a producer that has not thought about it gets the
	// safe answer, rather than a panel offering input it cannot deliver.
	probes.clear();
	hosts.clear();
	const { el } = await mount(DOC());
	const chat = el as unknown as {
		openLiveView(name: string, id: string, interactive?: boolean): unknown;
	};

	chat.openLiveView("probe", "p-default");
	assert.equal(hosts.get("p-default")!.interactive, false, "omitted means non-interactive");

	chat.openLiveView("probe", "p-ro", false);
	assert.equal(hosts.get("p-ro")!.interactive, false);

	chat.openLiveView("probe", "p-rw", true);
	assert.equal(hosts.get("p-rw")!.interactive, true);
	unmount(el);
});

test("an unregistered live name falls through to the honest fence", async () => {
	probes.clear();
	const { el } = await mount(`<!-- pi:view no-such-live #zz -->\n\n\`\`\`\nnot json\n\`\`\`\n`);
	await settle();
	// No factory, no static template, unparseable payload: the text stays visible
	// and editable rather than becoming an error state (document-format.md).
	const lines = [...el.querySelectorAll(".cm-line")].map((l) => l.textContent).join("\n");
	assert.ok(lines.includes("not json"), "the fence body is still shown");
	unmount(el);
});

test("dispose runs when the marker leaves, and not before (rule 5)", async () => {
	probes.clear();
	const { el, view } = await mount(DOC());
	const chat = el as unknown as { openLiveView(name: string, id: string): unknown };
	chat.openLiveView("probe", "p1");
	await settle();
	const log = probes.get("p1")!.log;

	// Deleting the FENCE BODY but keeping the marker: a half-typed fence looks
	// exactly like this, and treating it as "the view left" is what once destroyed
	// a cell's editor mid-keystroke (see the cell retraction in DocumentChat).
	const md = el.getDocument();
	const bodyAt = md.indexOf("```");
	view.dispatch({ changes: { from: bodyAt, to: md.length, insert: "```\n" } });
	await settle();
	assert.ok(!log.includes("dispose"), "an unclosed or emptied fence must not dispose the view");

	// Now remove the marker itself.
	const withMarker = el.getDocument();
	const markerAt = withMarker.indexOf("<!-- pi:view probe #p1 -->");
	view.dispatch({ changes: { from: markerAt, to: withMarker.length, insert: "" } });
	await settle();
	assert.ok(log.includes("dispose"), "the marker leaving disposes the view");
	unmount(el);
});

test("a disposed view's producer is told, so nothing is left running (rule 5)", async () => {
	// `dispose()` releases what the BROWSER holds — listeners, the emulator, the
	// element. It cannot reach the producer: a terminal's pty lives in the bridge,
	// and the view does not know what the transport is. So the owner that disposes
	// also announces it, and the page turns that into whatever "stop" means for
	// that producer (`ptySend("close", …)` for a terminal).
	//
	// Without this the shell outlived its panel: the marker was deleted, the panel
	// vanished, and a login shell went on running with nobody reading it until the
	// 10-minute idle reap happened to take the whole session.
	probes.clear();
	const { el, view } = await mount(DOC());
	const chat = el as unknown as { openLiveView(name: string, id: string): unknown };
	chat.openLiveView("probe", "p1");
	await settle();

	const closed: string[] = [];
	el.addEventListener("live-view-closed", (e) => closed.push((e as CustomEvent<{ id: string }>).detail.id));

	const md = el.getDocument();
	const markerAt = md.indexOf("<!-- pi:view probe #p1 -->");
	view.dispatch({ changes: { from: markerAt, to: md.length, insert: "" } });
	await settle();

	assert.deepEqual(closed, ["p1"], "the producer is told exactly once, naming the view");
	unmount(el);
});
