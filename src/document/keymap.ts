// Which command a keystroke means, as data.
//
// The table is pure on purpose, and the reason is the shell: WebDriver's
// keyboard injection on macOS cannot reliably type text or deliver
// `Mod-Shift-<letter>` chords (ADR 0014), so a suite driving the real window
// is the wrong place to assert what a key does. Resolving a binding here makes
// it answerable by `node:test` with no events, no engine and no app — and
// leaves the layer above to prove only that CodeMirror is wired to this table.
//
// Nothing here knows CodeMirror exists. The binding strings use CodeMirror's
// own spelling (`Mod-Enter`, `Shift-Mod-Enter`) because that is the vocabulary
// the view layer binds with, and translating at the boundary would put the
// mapping this module exists to state into two places.

/** Where the caret is, which is what makes the same chord mean two things. */
export const KeyContext = {
	/** The document itself: prose, markers, a settled answer. */
	Prose: "prose",
	/** Inside a notebook cell's editor (docs/notebook-cells.md). */
	Cell: "cell",
	/** A terminal panel that takes input (ADR 0013). */
	Terminal: "terminal",
	/** An artifact's own editor. */
	Artifact: "artifact",
} as const;

export type KeyContext = (typeof KeyContext)[keyof typeof KeyContext];

/**
 * What a binding asks for. The view layer owns the doing; this names the
 * intent so a test can assert the mapping without running it.
 */
export const Command = {
	/** Send the pending prompt, opening a new block for the answer. */
	SendNewBlock: "send-new-block",
	/** Send, continuing the current block rather than opening one. */
	SendContinue: "send-continue",
	/** Queue a follow-up: it runs after what is streaming now. */
	SendFollowUp: "send-follow-up",
	/** Stop what is streaming. */
	Stop: "stop",
	/** A soft line break inside the current paragraph. */
	SoftBreak: "soft-break",
	/** Take the block out, when the caret is at an empty block's head. */
	DeleteBlockAtHead: "delete-block-at-head",
	/** Run the cell the caret is in. */
	RunCell: "run-cell",
	/** Undo / redo. In a cell these are the cell's own, not the document's. */
	Undo: "undo",
	Redo: "redo",
} as const;

export type Command = (typeof Command)[keyof typeof Command];

/** One row of the table. */
export interface Binding {
	/** CodeMirror's spelling of the chord. */
	key: string;
	command: Command;
	/** Where it applies. A chord may appear once per context, never twice in one. */
	context: KeyContext;
	/**
	 * Whether the binding yields when its own precondition does not hold —
	 * `Backspace` only takes a block when the caret is at an empty block's
	 * head, and is ordinary Backspace everywhere else. A conditional binding
	 * must not shadow the default behaviour it sits in front of.
	 */
	conditional?: true;
}

/**
 * Every binding the canvas defines, in precedence order within a context.
 *
 * Order matters for the send chords and is asserted: the most specific chord
 * has to resolve first, or `Alt-Mod-Enter` is swallowed by `Mod-Enter` and
 * continuing a block becomes impossible.
 */
export const BINDINGS: readonly Binding[] = [
	// ⌥⌘⏎ continues the current block; ⇧⌘⏎ queues a follow-up; plain ⌘⏎ opens a
	// new block. Mid-stream the first two are the two real intents — steer now,
	// or run after — and idle, ⌘⏎ is the ordinary send.
	{ key: "Alt-Mod-Enter", command: Command.SendContinue, context: KeyContext.Prose },
	{ key: "Shift-Mod-Enter", command: Command.SendFollowUp, context: KeyContext.Prose },
	{ key: "Mod-Enter", command: Command.SendNewBlock, context: KeyContext.Prose },
	// Unbound in CodeMirror's defaultKeymap, so without this it silently did
	// nothing — and a soft break is what every writing app puts here.
	{ key: "Shift-Enter", command: Command.SoftBreak, context: KeyContext.Prose },
	// The one gesture that removes a block from the keyboard. Conditional: it
	// declines anything that is not an empty block, so ordinary Backspace is
	// untouched.
	{ key: "Backspace", command: Command.DeleteBlockAtHead, context: KeyContext.Prose, conditional: true },
	// Escape stops a stream and otherwise yields, so it still closes a panel or
	// clears a selection when nothing is running.
	{ key: "Escape", command: Command.Stop, context: KeyContext.Prose, conditional: true },

	// A cell runs with ⌘⏎, the same chord prose sends with: both mean "do the
	// thing the caret is in" (docs/notebook-cells.md).
	{ key: "Mod-Enter", command: Command.RunCell, context: KeyContext.Cell },
	// A cell's history is its own while it is being edited, which is why these
	// are bound here rather than inherited.
	{ key: "Mod-z", command: Command.Undo, context: KeyContext.Cell },
	{ key: "Mod-Shift-z", command: Command.Redo, context: KeyContext.Cell },
	{ key: "Mod-y", command: Command.Redo, context: KeyContext.Cell },

	// An artifact's editor sends like prose; it has no cell to run.
	{ key: "Mod-Enter", command: Command.SendNewBlock, context: KeyContext.Artifact },

	// A terminal that takes input gets no bindings at all: every keystroke
	// belongs to the shell (ADR 0013), and a chord stolen here would be a key
	// the user cannot send. Escape included — ^[ is how a terminal program is
	// told to stop.
];

/**
 * The command a chord means in one context, or `null` when the context defines
 * nothing for it and the keystroke belongs to whatever sits below.
 */
export function commandFor(key: string, context: KeyContext): Command | null {
	return BINDINGS.find((binding) => binding.key === key && binding.context === context)?.command ?? null;
}

/** Every binding one context defines, in precedence order. */
export function bindingsFor(context: KeyContext): readonly Binding[] {
	return BINDINGS.filter((binding) => binding.context === context);
}
