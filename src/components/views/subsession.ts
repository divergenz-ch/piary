// The `subsession` view template (step 12): the sub-agent block's link widget.
// Payload `{sid, title, prompt?}` — a child session that runs on its own,
// appears in the session list, and has its own document. `prompt` preserves the
// full notebook-authored invocation; legacy blocks can fall back to `title`.
// Everywhere else the block degrades to a JSON fence naming the child.
//
// Live status does not live in the payload (the document would then lie about a
// finished run): the host pushes it through `setSubsessionStatus`, and rendered
// widgets repaint themselves. Widgets whose DOM has been dropped are pruned on
// the next push — no subscription bookkeeping.

export type SubsessionStatus = "idle" | "running" | "done" | "error";

const statuses = new Map<string, SubsessionStatus>();
const widgets = new Set<HTMLElement>();

function paint(root: HTMLElement, status: SubsessionStatus) {
	root.className = `doc-subsession ${status}`;
	const dot = root.querySelector(".doc-subsession-status");
	if (dot) dot.textContent = status;
	const stop = root.querySelector<HTMLButtonElement>(".doc-subsession-stop");
	if (stop) stop.hidden = status !== "running";
}

/** Host → widget: the child's rolled-up state, from its `/events` stream. */
export function setSubsessionStatus(sid: string, status: SubsessionStatus): void {
	statuses.set(sid, status);
	for (const root of widgets) {
		if (!root.isConnected) widgets.delete(root);
		else if (root.dataset.sid === sid) paint(root, status);
	}
}

export function subsessionStatus(sid: string): SubsessionStatus {
	return statuses.get(sid) ?? "idle";
}

function action(cls: string, label: string, sid: string, event: string): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = cls;
	btn.textContent = label;
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		btn.dispatchEvent(new CustomEvent(event, { detail: { sid }, bubbles: true, composed: true }));
	});
	return btn;
}

export function renderSubsession(data: unknown): HTMLElement | null {
	const d = data as { sid?: unknown; title?: unknown; prompt?: unknown } | null;
	if (!d || typeof d !== "object" || typeof d.sid !== "string") return null;
	const sid = d.sid;
	const root = document.createElement("div");
	root.dataset.sid = sid;

	const head = document.createElement("div");
	head.className = "doc-subsession-head";
	const status = document.createElement("span");
	status.className = "doc-subsession-status";
	const title = document.createElement("span");
	title.className = "doc-subsession-title";
	title.textContent =
		typeof d.prompt === "string" && d.prompt.trim()
			? d.prompt.trim()
			: typeof d.title === "string" && d.title
				? d.title
				: sid;
	head.append(status, title);

	const bar = document.createElement("div");
	bar.className = "doc-subsession-actions";
	bar.append(
		action("doc-subsession-open", "open", sid, "subsession-open"),
		action("doc-subsession-stop", "stop", sid, "subsession-stop"),
	);
	const name = document.createElement("span");
	name.className = "doc-subsession-sid";
	name.textContent = sid;
	bar.append(name);

	root.append(head, bar);
	paint(root, subsessionStatus(sid));
	widgets.add(root);
	return root;
}
