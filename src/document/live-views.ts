// Live views — the registry for `pi:view` templates whose content CHANGES after
// it is first rendered, which `views.ts` templates cannot: a `ViewTemplate` is
// `(data) => HTMLElement`, called once per decoration build, so anything that has
// to take bytes over time (a terminal's output, a progress report, an
// agent-driven form) has no way to receive them. `subsession.ts` needed a private
// side-channel for exactly this reason; this is that need, named once.
//
// The split is deliberate and the one rule to remember: `views.ts` holds STATIC
// templates, this file holds CHANGING ones. A view that renders its payload and
// never moves again belongs there, not here.
//
// This module is pure (ADR 0006) — registry and contract only, no DOM. The
// factories registered in it build elements; the registry never does, which is
// what keeps it in the suite's reach and in `PURE_DOCUMENT_MODULES`.

/**
 * A view that changes after it is rendered. The document owns WHERE it sits; the
 * view owns its own DOM and its own bytes.
 *
 * Five rules bind every implementation, each one a bug that has already been paid
 * for somewhere in this repo or in the prototype it was ported from:
 *
 * 1. **`el` is stable for the view's whole life.** The decoration builder runs on
 *    every document change and the widget is rebuilt each time; the widget's `eq`
 *    compares the element, so an implementation that returns fresh DOM loses
 *    everything the view had accumulated.
 * 2. **`write` touches the view's own DOM and dispatches NO transaction.** A state
 *    effect per chunk rebuilds the widget, which defeats (1). It is also why
 *    `write` returns nothing — there is no path back into the editor here.
 * 3. **Bytes are not document content.** What a process emitted belongs to the
 *    view; what the user authored belongs to the document. So the `pi:view`
 *    payload carries what IDENTIFIES and reconstructs the view, never its output,
 *    and a reload shows an empty view rather than a replay. (`cell-state` in
 *    `views.ts` persists for the mirror-image reason: a widget's value IS the
 *    user's data.)
 * 4. **One view per id**, pooled outside CodeMirror.
 * 5. **`dispose` is lifetime, not visibility.** CodeMirror drops the widgets of
 *    lines that scroll out of the drawn viewport, so disposing from the widget
 *    throws away a live view's content. Only the owner that watches which ids are
 *    still in the document may call it, and "still in the document" means the
 *    MARKER is present — not that the payload parsed, because a fence is unclosed
 *    for as long as it takes to type its second delimiter. And disposing is only
 *    half of leaving: `dispose` reaches the view's own DOM and nothing further, so
 *    the owner must also tell whatever PRODUCES the view that it has gone — a
 *    terminal's pty lives in the bridge, and a panel that merely vanished left a
 *    login shell running with nobody reading it.
 */
export interface LiveView {
	/** The element the widget mounts. Stable for the view's whole life (rule 1). */
	readonly el: HTMLElement;
	/** New content. Whether that replaces or appends is the factory's business:
	 *  a snapshot source (pi's `partialResult` is cumulative) replaces, a byte
	 *  stream appends. The caller never decides (rule 2). */
	write(data: unknown): void;
	/** No more writes are coming — the command ended. Separate from `dispose`
	 *  because a settled view stays on screen and stays readable. */
	settle(): void;
	/** Release what the VIEW holds: its listeners, its timers, its element. Not the
	 *  producer — a view does not know what its transport is, so stopping whatever
	 *  feeds it is the owner's to announce when it disposes one (rule 5). Called when
	 *  the id leaves the document, never on scroll. */
	dispose(): void;
}

/** Builds the live view for one id. `host` is how it talks back out. */
export type LiveViewFactory = (id: string, host: LiveViewHost) => LiveView;

/** What a live view may ask of the page, and the one thing it must ask ABOUT it.
 *  Deliberately tiny: a view cannot do any of these for itself. */
export interface LiveViewHost {
	/**
	 * Whether anything at the other end reads input.
	 *
	 * False for a view OF a process — an agent's `bash`, whose output is streamed to
	 * the document but whose stdin nothing here can reach (there is no channel to a
	 * running pi tool; ADR 0013). True for a terminal the user opened, which has a
	 * pty behind it.
	 *
	 * The view must READ this rather than offering input and letting the message be
	 * dropped: a cursor blinking in a panel that cannot accept a keystroke is a
	 * promise the UI cannot keep.
	 */
	readonly interactive: boolean;
	/** Send data back to whatever produces this view — a keystroke, a resize.
	 *  The page owns the transport; the view does not know what it is. Only
	 *  meaningful when `interactive`. */
	send(message: Record<string, unknown>): void;
	/** The rendered height changed out of band (first output, a freeze); ask the
	 *  editor to re-measure so following content sits at the right offset. */
	measure(): void;
	/** Hand focus back to the prose editor — the view is done with the keyboard. */
	focusEditor(): void;
}

const liveViews = new Map<string, LiveViewFactory>();

/** Register a live-view factory under a `pi:view` NAME. */
export function registerLiveView(name: string, factory: LiveViewFactory): void {
	liveViews.set(name, factory);
}

/** The factory for a `pi:view` NAME, or undefined when none is registered — the
 *  caller then falls back to the static templates and finally to the honest
 *  fence, exactly as an unknown static template does. */
export function getLiveView(name: string): LiveViewFactory | undefined {
	return liveViews.get(name);
}
