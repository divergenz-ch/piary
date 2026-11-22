// Focus mode: the window's side controls — the conversation list and its
// button, the block rail, the model chip — slide off to their edges, so the
// window is the document and nothing else. Each comes back while the pointer
// is near its edge, or while focus is inside it (`app/focus.css`). The status
// line stays: a notice is never hidden (ADR 0011).
//
// The state is a class on `body`, and the pointer's edge is three more, so the
// whole of the hiding is CSS.

import "./focus.css";

export interface FocusMode {
	/** Turns focus mode on or off, and remembers which for the next page. */
	toggle(): void;
}

/** Where the choice is kept: a convenience of the user's, so the browser's
 *  storage rather than the store, read by every window as it loads. */
const FOCUS_KEY = "piary-focus";

/** How near an edge the pointer reveals that edge's control: nearing it is
 *  enough, so the user need not hunt for an 8px sliver. */
const EDGE_PX = 100;

function stored(): boolean {
	try {
		return localStorage.getItem(FOCUS_KEY) === "1";
	} catch {
		return false;
	}
}

function store(on: boolean): void {
	try {
		if (on) localStorage.setItem(FOCUS_KEY, "1");
		else localStorage.removeItem(FOCUS_KEY);
	} catch {} // a storage that refuses costs the remembered choice, not the mode
}

/** Applies the stored choice and follows the pointer to the window's edges. */
export function mountFocus(): FocusMode {
	const body = document.body;
	const near = (left: boolean, right: boolean, bottom: boolean) => {
		body.classList.toggle("near-left", left);
		body.classList.toggle("near-right", right);
		body.classList.toggle("near-bottom", bottom);
	};
	let on = stored();
	body.classList.toggle("focus", on);

	window.addEventListener(
		"pointermove",
		(event) => {
			if (!on) return;
			near(event.clientX < EDGE_PX, event.clientX > innerWidth - EDGE_PX, event.clientY > innerHeight - EDGE_PX);
		},
		{ passive: true },
	);

	return {
		toggle() {
			on = !on;
			store(on);
			body.classList.toggle("focus", on);
			// Whatever the pointer last neared is stale by the next time focus mode is on.
			near(false, false, false);
		},
	};
}
