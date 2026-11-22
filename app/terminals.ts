// A terminal of the user's own, in the document (ADR 0013): `/terminal` on the
// trailing prompt, or New Terminal in the menu, appends a `pi:view terminal`
// panel and opens the login shell behind it. Keystrokes and resizes go to the
// shell, its output comes back into the panel, and the panel's marker leaving
// ends the shell.
//
// The module keeps no state of its own: the views live in the canvas and the
// PTYs in Rust, whose ownership map is the record of which ids are terminals.

import { onPtyData, onPtyExit, ptyClose, ptyOpen, ptyResize, ptyWrite } from "../src/bridge.ts";
import type { HostFragment } from "./canvas-events.ts";
import { mountExtensions } from "./extensions.ts";
import type { ModelPicker } from "./picks.ts";
import type { AppContext } from "./context.ts";

type TerminalHost = Pick<AppContext, "chat" | "sid">;


/** What a panel runs: the login shell, or the user's own pi with `args`,
 *  resolved by Rust as a session's pi is (`pi_which`). */
export type TerminalProgram = { pi: false } | { pi: true; args: string[] };

/** A fresh id for a terminal panel, in the form its marker takes. */
export const newTerminalId = (): string => `term-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Opens a terminal the user drives: the panel first, so the first byte has
 * somewhere to land, then the program behind it. An empty command and cwd
 * are Rust's to resolve — the shell is `$SHELL`'s, the directory the
 * workspace's. A program that cannot start says so in its own panel, as the
 * thing that failed (ADR 0011). Answers whether the program started.
 *
 * `termId` is the caller's to choose when it must know the panel before its
 * first byte arrives, which can come before the open's own answer.
 */
export async function openTerminal(
	{ chat, sid }: TerminalHost,
	program: TerminalProgram = { pi: false },
	termId = newTerminalId(),
): Promise<boolean> {
	const view = chat.openStreamingView("terminal", termId, true);
	if (!view) return false;
	const args = program.pi ? program.args : [];
	return ptyOpen({ sid, termId, command: "", pi: program.pi, args, cwd: "", cols: null, rows: null }).then(
		() => true,
		(error: unknown) => {
			view.write(`\r\n[terminal unavailable: ${error instanceof Error ? error.message : String(error)}]\r\n`);
			return false;
		},
	);
}

/** A panel's keystrokes and resizes, and its marker leaving the document. */
export function terminalHandlers({ sid }: TerminalHost): HostFragment<"live-view-send" | "live-view-closed"> {
	return {
		// Rejections are dropped: a key pressed as the shell exits is a race,
		// not an error, and a view with no PTY behind it has nobody to hear.
		"live-view-send": ({ id, message }) => {
			if (message["type"] === "input" && typeof message["data"] === "string") {
				void ptyWrite(sid, id, message["data"]).catch(() => {});
			} else if (message["type"] === "resize" && typeof message["cols"] === "number" && typeof message["rows"] === "number") {
				void ptyResize(sid, id, message["cols"], message["rows"]).catch(() => {});
			}
		},
		// Disposing the view frees only the page's half; the shell would run on
		// with nobody reading it. Sent for every live view: an id with no PTY is
		// refused by Rust, which is the right answer.
		"live-view-closed": ({ id }) => void ptyClose(sid, id).catch(() => {}),
	};
}

/** Once per window: the PTYs' output routed to their panels. New Terminal is
 *  the menu's (app/menubar.ts), and `/terminal` is that item's row. */
export async function setupTerminals(host: TerminalHost & Pick<AppContext, "turn" | "notify" | "busy">, picker: Pick<ModelPicker, "addRow" | "chip" | "forget">): Promise<void> {
	const { chat } = host;
	mountExtensions(host, picker);
	await Promise.all([
		onPtyData((id, data) => chat.liveView(id)?.write(data)),
		onPtyExit((id) => chat.liveView(id)?.settle()),
	]);
}
