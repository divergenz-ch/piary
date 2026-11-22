// A prompt from the canvas to pi, and the answer back into the document.
//
// The thinnest path that makes the app usable: the caret's prompt goes out
// through `src/bridge.ts`, pi's events come back, and the canvas writes them
// into the block the turn opened at. One canvas, not a transcript (ADR 0005).
//
// **What this deliberately is not** is one `send` that reaches every member of
// the element — the shape ADR 0009 declines. Each thing a turn needs arrives
// here on its own: a prompt is sent,
// a turn streams, the document holds the answer, and a send while it runs
// steers it or queues a follow-up.

import type { ToolResultMessage } from "@earendil-works/pi-ai";
import type { CellFailure, DocumentChat } from "../src/components/DocumentChat.ts";
import { parseDocument, pendingUserText, serializeUser, withPromptPrefixes } from "../src/document/format.ts";
import { attachmentsAbove, historyAbove, historyOf, promptAt, promptPrefixes, runAnchor, tailPrompt } from "../src/document/run.ts";
import { partialText } from "../src/document/tool-output.ts";
import { carrying } from "./attachments.ts";
import { type FaceBlocks, sentPrompt } from "./face/log.ts";
import { CellReports } from "./cell-reports.ts";
import type { CanvasEdit } from "../src/document/canvas-edit.ts";
import { CanvasEdits, requestedEdit } from "./canvas-edits.ts";
import { CELL_VERDICT_MS, CellVerdicts, requestedCell } from "./cell-verdicts.ts";
import { syncHistory } from "./history.ts";
import { RunStatus } from "./run-status.ts";
import { OutputPanels } from "./output-panels.ts";
import { preferences, watchPreferences } from "./preferences.ts";
import { BUDGET_TOOL, budgetMs, budgetSteer, DEFAULT_BUDGET_MS, RUN_LIMIT_MS, RunLimits } from "./run-limits.ts";
import { stamped } from "./now.ts";
import { providerErrorText, refusalText } from "./provider-error.ts";
import { signInNeeded } from "./sign-in-pure.ts";
import { onPiEvent, onPiExited, piRunning, piSend, piStart, piStop, type PiReply } from "../src/bridge.ts";

/**
 * How long a running turn may go without an event before the page asks pi
 * whether it is still running one.
 *
 * Longer than a plausible gap between chunks, which pi streams several times a
 * second. It can be far shorter than a long tool call or a model thinking for a
 * minute — both silent and alive — because expiry asks rather than unlocks: a
 * bound that fires early costs one `get_state` round trip, not a turn. That is
 * the whole reason this is a probe and not a watchdog (ADR 0019 §4).
 */
const SILENCE_PROBE_MS = 15_000;

/** What the user is told when pi is gone mid-turn, by whichever route found
 *  out. The promise is kept by `send`, which starts pi before every prompt. */
const PI_GONE = "pi stopped. The next send starts it again.";

/** What the user is told when pi is still running but did not answer the
 *  silence probe. No restart is promised: `piStart` is a no-op on a live
 *  session, so the next send reaches this same pi. Quitting reaps it
 *  (ADR 0019 §2), and that is the one way out the app has today. */
const PI_UNRESPONSIVE = "pi stopped answering, so this turn was ended. pi is still running; quitting Piary stops it.";

/** What a turn needs to reach the document and the user. */
export interface TurnDeps {
	chat: DocumentChat;
	/** Shown when a turn cannot start or dies. A failure is visible, never
	 *  swallowed (ADR 0011). */
	notify: (message: string) => void;
	/** The widget state the page holds, written into pi's transcript by a
	 *  rebuild in place of whatever it carried. */
	cellState?: () => unknown;
	/** Run before each send's history sync, pi up: a conversation pi has no
	 *  messages for takes the model staged for it (`app/model.ts`). */
	prepare?: () => Promise<void>;
	/** After a rewritten history restarted pi, or may have: whoever shows what
	 *  pi runs asks it again. */
	restarted?: () => Promise<void>;
	/** Offers to sign in, after a refusal pi gave for want of any provider
	 *  (`app/sign-in-pure.ts`). */
	offerSignIn?: () => void;
	/** pi took a prompt, so it has a provider to answer with. */
	promptTaken?: () => void;
	/** What a message tells pi of the user's face while it was written, and
	 *  word that pi took it (`app/face/index.ts`). */
	face?: FaceBlocks;
}

/** How often the run badge's clock moves. Its finest unit is a second. */
const RUN_STATUS_TICK_MS = 1_000;
/** How long an unasked reply may take before it is given up: it is a sentence
 *  or two, and nobody is waiting for it. */
const ASIDE_MAX_MS = 60_000;
/** How long a cut-off unasked reply is given to settle before the user's own
 *  message goes regardless. */
const ASIDE_ABORT_MS = 5_000;

/**
 * pi's assistant message, as much of it as this slice reads.
 *
 * Deliberately narrow: the full shape is pi's and belongs to the page's own
 * renderer, which already knows it. Widening this here would be a second place
 * to update whenever pi grows a field (ADR 0002's wire is the interface).
 */
type AssistantPartial = {
	role?: string;
	content?: unknown;
};

/** An unasked reply being asked for: what pi has said of it, whether it was
 *  handed to pi yet, whether it was cut off, and who waits for it. */
interface Aside {
	said: string | null;
	cut: boolean;
	sent: boolean;
	done: (said: string | null) => void;
}

/** One session's turn, while it is running. */
export class Turn {
	readonly #deps: TurnDeps;
	readonly #sid: string;
	/** Whether a turn is in flight. A send while one runs is handed to it
	 *  (`#interject`) rather than opening another. */
	#running = false;
	/** What this run has told pi about its failing cells (`notebook-cells.md` §Policy). */
	readonly #reports = new CellReports();
	/** This run's failed writes per cell, which bound the `cell` tool's loop. */
	readonly #verdicts = new CellVerdicts();
	/** This run's refused canvas edits, which bound the `canvas_edit` tool's loop. */
	readonly #edits = new CanvasEdits();
	/** Cells whose verdict the `cell` tool is waiting on: the verdict is what
	 *  tells pi about them, so the sweep does not steer them meanwhile. */
	readonly #judging = new Set<string>();
	/** This run's clock and tool-call count, against the app's hard bounds. */
	readonly #limits = new RunLimits();
	/** Which running tool's output gets a panel, and when (`output-panels.ts`). */
	readonly #panels = new OutputPanels((id, text) => this.#showOutput(id, text));
	/** Fires at the time bound: a run silent past it still has to stop. */
	#limitTimer: ReturnType<typeof setTimeout> | undefined;
	/** The limit this run was stopped at, written into the document when pi
	 *  confirms the stop. */
	#stoppedAt: string | null = null;
	/** Why the provider refused the run's last request, when pi will not retry
	 *  it: pi reports it on an assistant message with no content, which would
	 *  otherwise leave the turn an empty answer. Written when pi settles. */
	#refusedWith: string | null = null;
	/** When this run began, and the soft limit it runs under: the agent's
	 *  estimate once it has given one (ADR 0031). */
	#runStarted = 0;
	#budgetMs = DEFAULT_BUDGET_MS;
	/** Fires when the soft limit passes; it steers once per run. */
	#budgetTimer: ReturnType<typeof setTimeout> | undefined;
	#budgetSteered = false;
	/** What the run is doing, for the badge, and the tick that moves its clock. */
	readonly #status = new RunStatus();
	#statusTick: ReturnType<typeof setInterval> | undefined;
	/** The prompt has been handed to pi. Until then a user message on the
	 *  stream is no part of this turn — nothing the preflight sends is the
	 *  user speaking. */
	#promptSent = false;
	/** A send is reading the page's cell values before its turn opens; a
	 *  second send then is not a second turn. */
	#preparing = false;
	/** pi echoes the prompt back as a user message; that text is already in
	 *  the document, so the first one after the send is dropped. */
	#promptEchoPending = false;
	#unsubscribe: Array<() => void> = [];
	/** Whoever is waiting for the running turn to end — `end`, today. */
	#settled: Array<() => void> = [];
	/** Armed while a turn runs, re-armed by each of its events; expiry probes. */
	#silence: ReturnType<typeof setTimeout> | undefined;
	/** A probe is in flight, so a second expiry does not stack another. */
	#probing = false;
	/** Exits a rebuild caused, still to be reported: those are not pi going away. */
	#expectedExits = 0;
	/** Whoever follows what a turn writes into the page. */
	readonly #listeners: Array<() => void> = [];
	/** An unasked reply being asked for (`aside`): what pi has said of it, who
	 *  waits for it, and whether it was cut off, which leaves pi's events for
	 *  it to be let pass until pi settles. */
	#aside: Aside | null = null;

	constructor(sid: string, deps: TurnDeps) {
		this.#sid = sid;
		this.#deps = deps;
		// A preference changed mid-run shows at once, not at the run's next event.
		watchPreferences(() => {
			if (this.#running) this.#showRun();
		});
	}

	/** Hears every change a turn makes to the document — each streamed chunk,
	 *  the finished answer, the turn closing — which no save reports while the
	 *  turn runs. */
	onChanged(listener: () => void): void {
		this.#listeners.push(listener);
	}

	#changed(): void {
		for (const listener of this.#listeners) listener();
	}

	/** Whether a turn is currently streaming. */
	get running(): boolean {
		return this.#running;
	}

	/** The flag and the canvas move together, always.
	 *
	 *  `streaming` is what engages every protection the canvas has for a turn in
	 *  flight — the change filter over the machine's region, the `edit` guard, the
	 *  typed-during-turn flag, and `Escape` meaning stop. Setting `#running`
	 *  without it left all of that inert, so the page offered no protection and no
	 *  way to interrupt. */
	#setRunning(running: boolean) {
		this.#running = running;
		if (!running) this.#promptSent = this.#promptEchoPending = false;
		clearTimeout(this.#limitTimer);
		clearTimeout(this.#budgetTimer);
		this.#limitTimer = this.#budgetTimer = undefined;
		this.#panels.clear();
		if (running) {
			this.#stoppedAt = null;
			this.#refusedWith = null;
			this.#budgetSteered = false;
			this.#runStarted = Date.now();
			this.#limits.start(this.#runStarted);
			this.#limitTimer = setTimeout(() => this.#checkLimits(), RUN_LIMIT_MS);
			this.#status.start(this.#runStarted, DEFAULT_BUDGET_MS);
			this.#setBudget(DEFAULT_BUDGET_MS);
			clearInterval(this.#statusTick);
			this.#statusTick = setInterval(() => this.#showRun(), RUN_STATUS_TICK_MS);
		} else if (this.#statusTick !== undefined) {
			clearInterval(this.#statusTick);
			this.#statusTick = undefined;
			this.#status.end(Date.now(), this.#stoppedAt);
		}
		this.#showRun();
		this.#deps.chat.streaming = running;
		this.#armSilence();
		if (!running) for (const resolve of this.#settled.splice(0)) resolve();
	}

	/** Restarts the silence bound while a turn runs, and clears it otherwise. */
	#armSilence(): void {
		clearTimeout(this.#silence);
		this.#silence = this.#running ? setTimeout(() => void this.#probe(), SILENCE_PROBE_MS) : undefined;
	}

	/**
	 * Asks pi whether the turn is still running, and believes the answer.
	 *
	 * Streaming: the silence was a long tool call or a slow model, so wait
	 * again and show nothing. Not streaming: the ending was lost, so the turn
	 * ends here. No answer at all: pi is wedged or gone, so the turn ends and
	 * `piRunning` says which — gone gets the notice an exit gives, wedged one
	 * that promises no restart. Either way the process is left alone: stopping
	 * it is `piStop`'s call, not this one's. Never unlock without asking: a turn
	 * pi is still writing is the second writer ADR 0005 exists to prevent
	 * (ADR 0019 §4).
	 */
	async #probe(): Promise<void> {
		if (!this.#running || this.#probing) return;
		this.#probing = true;
		const reply = await piSend(this.#sid, { type: "get_state" }).catch(() => null);
		this.#probing = false;
		// An event may have ended the turn while the question was out.
		if (!this.#running) return;
		if (reply?.success === true && reply.data?.["isStreaming"] === true) {
			this.#armSilence();
			return;
		}
		this.#setRunning(false);
		this.#deps.chat.endTurn();
		this.#changed();
		if (reply?.success === true) {
			this.#deps.notify("pi had already finished; the turn is over.");
			return;
		}
		// A session the host cannot answer for is treated as gone: the next send
		// starts pi either way, so the exit's promise is the true one.
		const alive = await piRunning(this.#sid).catch(() => false);
		this.#deps.notify(alive ? PI_UNRESPONSIVE : PI_GONE);
	}

	/** Ask pi to abandon the turn. The answer so far stays in the document:
	 *  stopping is not undoing. `agent_settled` finalizes it like any other
	 *  ending, and if that ending is lost the silence probe finds it, so
	 *  nothing here closes the turn by hand. */
	async stop(): Promise<void> {
		if (!this.#running) return;
		await piSend(this.#sid, { type: "abort" }).catch(() => {
			// The turn is over for this page either way; a refused abort must not
			// leave the canvas locked against the writer.
			this.#setRunning(false);
			this.#deps.chat.endTurn();
			this.#changed();
		});
	}

	/**
	 * Ends the running turn the way Escape does, and waits for it to settle —
	 * at most `boundMs`, because an abort pi does not honour must not hold a
	 * quit hostage (ADR 0019 §3). The abort is what lets pi finalize the answer
	 * so far, so the buffer a flush writes after this is the whole of it.
	 */
	async end(boundMs: number): Promise<void> {
		if (!this.#running) return;
		const settled = new Promise<void>((resolve) => this.#settled.push(resolve));
		let timer: ReturnType<typeof setTimeout> | undefined;
		const bound = new Promise<void>((resolve) => {
			timer = setTimeout(resolve, boundMs);
		});
		await Promise.race([this.stop().then(() => settled), bound]);
		clearTimeout(timer);
	}

	/**
	 * Starts the session and begins relaying its events into the document.
	 *
	 * Called once, before the first send: `piStart` is idempotent, but the
	 * subscriptions are not, and two listeners would write every chunk twice.
	 */
	async open(): Promise<void> {
		await piStart(this.#sid);
		this.#unsubscribe.push(
			await onPiEvent((sid, event) => {
				if (sid === this.#sid) this.#onEvent(event);
			}),
		);
		this.#unsubscribe.push(
			await onPiExited((sid) => {
				if (sid !== this.#sid) return;
				// A rebuild stops pi on purpose, and its exit is reported like any
				// other; that one is not news.
				if (this.#expectedExits > 0) {
					this.#expectedExits--;
					return;
				}
				// A turn still streaming when pi goes away would hang with a
				// half-written answer and no explanation.
				if (this.#running) {
					this.#setRunning(false);
					this.#deps.chat.endTurn();
					this.#changed();
				}
				this.#deps.notify(PI_GONE);
			}),
		);
	}

	/**
	 * Stops this session's pi on purpose, so the next send starts one that
	 * reads what has changed on disk since, a credential above all. Its exit is
	 * not news. The window's terminals stay. Answers whether a pi was stopped:
	 * none runs to stop, or one is answering a turn, which it evidently has a
	 * provider for, and whose exit would leave the turn waiting on nothing.
	 */
	async stopPi(): Promise<boolean> {
		if (this.#running || !(await piRunning(this.#sid).catch(() => false))) return false;
		this.#expectedExits++;
		await piStop(this.#sid, true).catch(() => {
			this.#expectedExits = Math.max(0, this.#expectedExits - 1);
		});
		return true;
	}

	/** Stops relaying. The session itself outlives this — `piStop` ends that.
	 *  The silence bound goes too: a torn-down turn must not probe into a page
	 *  that has stopped listening. */
	close(): void {
		for (const off of this.#unsubscribe) off();
		this.#unsubscribe = [];
		clearTimeout(this.#silence);
		this.#silence = undefined;
	}

	/**
	 * Hands pi `message` with no prompt on the page, and answers what pi said
	 * to it: its words, the empty string for none, `null` when it could not be
	 * asked or was cut off. Nothing is drawn and no turn opens on the page: what
	 * to do with the words is the caller's (ADR 0061). Refused while a turn
	 * runs; a send made meanwhile cuts it off first.
	 */
	async aside(message: string): Promise<string | null> {
		if (this.#running || this.#preparing || this.#aside) return null;
		let done!: (said: string | null) => void;
		const answered = new Promise<string | null>((resolve) => (done = resolve));
		const aside: Aside = { said: null, cut: false, sent: false, done };
		this.#aside = aside;
		const fail = (): void => {
			if (this.#aside === aside) this.#aside = null;
			done(null);
		};
		// pi may never settle; the user is not waiting, but the page is not held either.
		const bound = setTimeout(() => void this.#endAside(), ASIDE_MAX_MS);
		void answered.then(() => clearTimeout(bound));
		try {
			await piStart(this.#sid);
			await this.#deps.prepare?.();
			const cellState = this.#deps.cellState;
			const synced = await syncHistory(this.#sid, historyOf(this.#deps.chat.getDocument()), () => this.#expectedExits++, cellState ? { cellState: cellState() } : {});
			if (synced === "rebuilt") await this.#deps.restarted?.();
			// Cut off while pi was brought up to date: nothing was asked.
			if (aside.cut) return fail(), answered;
			aside.sent = true;
			const reply = await piSend(this.#sid, { type: "prompt", message: stamped(message) });
			if (reply?.success !== true || reply.data?.["disposition"] === "handled") fail();
		} catch {
			fail();
		}
		return answered;
	}

	/** Whether an unasked reply is being asked for. */
	get asking(): boolean {
		return this.#aside !== null;
	}

	/** Cuts off an unasked reply: whoever asked hears `null` at once, and pi is
	 *  told to stop and given a moment to settle, so the turn that follows does
	 *  not open under its last events. */
	async #endAside(): Promise<void> {
		const aside = this.#aside;
		if (!aside || aside.cut) return;
		aside.cut = true;
		aside.done(null);
		// Not handed to pi yet: there is nothing to stop and nothing to wait for.
		if (!aside.sent) {
			this.#aside = null;
			return;
		}
		const settled = new Promise<void>((resolve) => this.#settled.push(resolve));
		await piSend(this.#sid, { type: "abort" }).catch(() => null);
		await Promise.race([settled, new Promise<void>((resolve) => setTimeout(resolve, ASIDE_ABORT_MS))]);
		if (this.#aside === aside) this.#aside = null;
	}

	/** pi's events while an unasked reply is asked for: kept off the page. */
	#onAside(event: Record<string, unknown>): void {
		const aside = this.#aside;
		if (!aside) return;
		if (event["type"] === "message_end") {
			const message = event["message"] as AssistantPartial | undefined;
			if (message?.role === "assistant" && !isRefusal(message)) aside.said = textOfAssistant(message);
		}
		// An unasked reply is words. One that reaches for a tool, or asks the page
		// something, would act with nothing on the page to show it: it is stopped.
		if (event["type"] === "tool_execution_start" || event["type"] === "extension_ui_request") return void this.#endAside();
		if (event["type"] !== "agent_settled" && event["type"] !== "error") return;
		this.#aside = null;
		for (const resolve of this.#settled.splice(0)) resolve();
		if (!aside.cut) aside.done(event["type"] === "error" ? null : aside.said);
	}

	/**
	 * Sends `text` as a prompt, its answer opening under the prompt `at` is in.
	 *
	 * `at` is the caret's offset: the prompt it is inside is the one that runs,
	 * and its answer lands under it, which is the whole of ADR 0005's positional
	 * prompt. A caret in no prompt means the one at the tail. `run.ts` resolves
	 * which prompt that is and where its answer begins.
	 *
	 * While a turn runs, a send is handed to it instead (`#interject`): a steer,
	 * or a follow-up when `followUp` is set.
	 */
	async send(text: string, at?: number, followUp = false): Promise<void> {
		// A message of the user's comes before anything the agent was asked unasked.
		if (this.#aside) await this.#endAside();
		if (this.#running || this.#preparing) return this.#interject(followUp);
		if (!text.trim()) return;
		// What the user has set on the page's cells goes with the prompt
		// (`promptPrefixes`). Read from the page's own engine, so no network
		// stands between the keystroke and the turn opening.
		this.#preparing = true;
		const values = await this.#deps.chat.cellValues().catch(() => ({}));
		this.#preparing = false;
		// A fresh prompt is a fresh run: its cells get their own reports.
		this.#reports.reset();
		this.#verdicts.reset();
		this.#edits.reset();

		// The history is what stands above the prompt being run, measured before
		// the turn opens: opening it writes the region below the prompt, and a
		// re-run's old answer is cut from below it too, so neither is history.
		const before = this.#deps.chat.getDocument();
		const { segments } = parseDocument(before);
		const caret = at === undefined ? -1 : promptAt(segments, at);
		const index = caret >= 0 ? caret : tailPrompt(segments);
		const history = historyAbove(before, index >= 0 ? (segments[index] ?? null) : null);
		// What the prompt carries, read off the same text: images as vision
		// content, anything else named by path (the format's §Attachments).
		const attached = index >= 0 ? attachmentsAbove(segments, index) : [];
		// The lines the prompt carries in front of its text: written into the
		// prompt on the page and sent with it, so the two hold the same text.
		const prefixes = index >= 0 ? promptPrefixes(before, index, values) : [];

		// The block opens BEFORE the send, so the answer has somewhere to go the
		// moment the first chunk arrives rather than racing it — and so a rebuild,
		// which restarts pi, happens behind something already on screen.
		// It opens just past the prompt's own text, never at the caret itself: a
		// caret inside an edited prompt would split it, and the half below the
		// caret would be stranded under the reply, in pi's block. `run.ts` says
		// where that is.
		this.#deps.chat.beginTurn(runAnchor(before, caret < 0, index), prefixes);
		this.#setRunning(true);

		// Started before every send, not only at `open`: a pi that went away is
		// reaped and its slot freed (ADR 0019 §5), so this starts a fresh one —
		// what `onPiExited`'s notice promises — and is a no-op for a live one.
		const started = await piStart(this.#sid).then(
			(): PiReply => null,
			(error: unknown): PiReply => ({ success: false, error: String(error) }),
		);
		if (!started) {
			await this.#deps.prepare?.();
			// The document is the history (ADR 0002): what pi remembers is made to
			// match what the page says before the prompt goes (ADR 0021).
			try {
				const cellState = this.#deps.cellState;
				const synced = await syncHistory(this.#sid, history, () => this.#expectedExits++, cellState ? { cellState: cellState() } : {});
				if (synced === "rebuilt") await this.#deps.restarted?.();
			} catch (error) {
				await this.#abandon(before, `The conversation could not be brought up to date: ${String(error)}`);
				// The rewrite may have restarted pi before it failed. Not waited
				// for: a pi that is gone answers late, and the turn is already over.
				void this.#deps.restarted?.();
				return;
			}
		}
		let reply = started;
		if (!reply) {
			const prompt = await carrying(this.#sid, { type: "prompt", message: withPromptPrefixes(text, prefixes) }, attached);
			// A command of pi's is no message, and its arguments are not the app's
			// to add to; a caret in no prompt has no key log either.
			const face = index >= 0 && !text.trimStart().startsWith("/") ? this.#deps.face?.blockFor(prompt.message, sentPrompt(before, segments, index)) : undefined;
			prompt.message = stamped(prompt.message, face);
			this.#promptSent = this.#promptEchoPending = true;
			reply = await piSend(this.#sid, prompt);
			if (reply?.success === true) this.#deps.face?.taken();
		}
		// A late reply is not a refusal: pi may have taken the prompt and be
		// writing the answer now, so unlocking here would hand the region to a
		// second writer. Ask instead, as silence does (ADR 0019 §4).
		if (reply?.success === false && reply.timedOut === true) {
			void this.#probe();
			return;
		}
		// pi ran the prompt as a command of its own (`/block new`, an extension's
		// command) and started no run: no answer and no `agent_settled` will come,
		// so the turn ends here, with nothing written.
		if (reply?.success === true && reply.data?.["disposition"] === "handled") {
			this.#setRunning(false);
			this.#deps.chat.endTurn();
			this.#changed();
			return;
		}
		if (reply?.success === true) this.#deps.promptTaken?.();
		if (reply?.success === false) {
			this.#setRunning(false);
			// Recorded in the document like any other reply, not just in a
			// notice: the conversation is the file, and a failed turn is part of
			// what happened (ADR 0001).
			this.#deps.chat.appendError(reply.error ?? "pi refused the prompt");
			this.#deps.chat.endTurn();
			this.#changed();
			this.#deps.notify(reply.error ?? "The prompt was refused.");
			// Only pi's own answer says why, never the error's wording: a pi that
			// lists no models has no provider to answer with.
			const models = await piSend(this.#sid, { type: "get_available_models" }).catch((): PiReply => null);
			if (signInNeeded(reply, models)) this.#deps.offerSignIn?.();
		}
	}

	/**
	 * Hands the tail's draft to the running turn: now, between tool calls, or
	 * queued for after the answer (`followUp`). The draft is what goes, wherever
	 * the caret is — never the text of a prompt above it — carried as a prompt
	 * is, and it leaves the tail only once pi has taken it. pi's echo is what
	 * writes it into the document, where it arrived (`#onEvent`), so it lands
	 * once. A refusal leaves the draft where it was and says why.
	 *
	 * Before the prompt has gone there is nothing to hand it to, so a send then
	 * does nothing and the draft stays.
	 */
	async #interject(followUp: boolean): Promise<void> {
		if (!this.#promptSent) return;
		const md = this.#deps.chat.getDocument();
		const draft = pendingUserText(md);
		if (!draft?.trim()) return;
		const { segments } = parseDocument(md);
		const command = await carrying(this.#sid, { type: followUp ? "follow_up" : "steer", message: draft }, attachmentsAbove(segments, tailPrompt(segments)));
		command.message = stamped(command.message, this.#deps.face?.blockFor(command.message, sentPrompt(md, segments, tailPrompt(segments))));
		const reply = await piSend(this.#sid, command).catch((error: unknown): PiReply => ({ success: false, error: String(error) }));
		if (reply?.success === true) this.#deps.face?.taken();
		if (reply?.success === true) this.#deps.chat.clearTail();
		else this.#deps.notify(reply?.error ?? "pi did not take the message.");
	}

	/**
	 * Takes back a turn whose preparation failed before anything was prompted:
	 * the region comes out and the document is put back as it was — a splice,
	 * so live cells keep their state and ⌘Z still works — and the reason is
	 * said. A rebuild that failed may or may not have stopped pi, so an exit
	 * still to come is pi's news again.
	 */
	async #abandon(before: string, reason: string): Promise<void> {
		this.#expectedExits = 0;
		this.#setRunning(false);
		this.#deps.chat.endTurn();
		this.#changed();
		// `streaming` reaches the editor on its next update, and the editor
		// refuses structural edits while it believes a turn runs.
		await this.#deps.chat.updateComplete;
		this.#deps.chat.replaceDocument(before);
		this.#deps.notify(reason);
	}

	/**
	 * Tells pi a cell this turn wrote has failed, while the turn still runs, so
	 * the agent fixes it in the same turn (`notebook-cells.md` §Policy). Once
	 * the run is over nothing is sent: the red rail is the report.
	 */
	reportCellFailure(detail: CellFailure): void {
		if (!this.#running || this.#judging.has(detail.id)) return;
		const message = this.#reports.report(detail);
		if (message) void this.#steer(message);
	}

	/**
	 * Stops the run the way Escape does once it has passed a hard bound
	 * (`run-limits.ts`), and says so — in the document when pi confirms the
	 * stop, and on the status line now. Once per run.
	 */
	#checkLimits(): void {
		if (!this.#running || this.#stoppedAt) return;
		const passed = this.#limits.passed(Date.now());
		if (!passed) return;
		this.#stoppedAt = passed;
		this.#deps.notify(passed);
		void this.stop();
	}

	/** Shows the badge and its max time at the top of the run's answer, and
	 *  the cell chip on its artifact, as the run stands now. The preference
	 *  is the wash's alone: the artifact locks itself by the chip's tone
	 *  (ADR 0054). */
	#showRun(): void {
		this.#deps.chat.showRunStatus(this.#status.label(Date.now()), this.#status.budgetLabel());
		const cell = this.#status.cell();
		this.#deps.chat.showCellActivity(cell && { ...cell, pulse: preferences().cellWorkPulse && cell.tone === "working" });
	}

	/**
	 * Runs this turn under a soft limit of `ms` from its start. When it passes,
	 * pi is steered once to stop, report and ask (ADR 0031); a run that has
	 * already been steered is not steered again by a later estimate.
	 */
	#setBudget(ms: number): void {
		if (this.#budgetSteered) return;
		clearTimeout(this.#budgetTimer);
		this.#budgetMs = ms;
		this.#status.budget(ms);
		const left = this.#runStarted + ms - Date.now();
		this.#budgetTimer = setTimeout(() => {
			this.#budgetTimer = undefined;
			if (!this.#running || this.#stoppedAt) return;
			this.#budgetSteered = true;
			this.#status.wrapping();
			this.#showRun();
			void this.#steer(budgetSteer(this.#budgetMs));
		}, Math.max(0, left));
	}

	/**
	 * Answers the `cell` tool's question about the cell it just wrote: the
	 * canvas's verdict, bounded per cell by `CellVerdicts`
	 * (`notebook-cells.md` §Policy). A failure told this way is told: the sweep
	 * does not steer it again.
	 */
	async #answerVerdict(requestId: string, cellId: string): Promise<void> {
		this.#judging.add(cellId);
		this.#status.checking(cellId);
		this.#showRun();
		const judged = await this.#deps.chat.cellVerdict(cellId, CELL_VERDICT_MS);
		const answer = this.#verdicts.answer(cellId, judged);
		this.#status.verdict(cellId, answer, this.#deps.chat.cellReaders(cellId));
		if (judged.verdict === "failed") this.#reports.told(`${cellId}|${judged.error}`);
		this.#judging.delete(cellId);
		await piSend(this.#sid, { type: "extension_ui_response", id: requestId, value: JSON.stringify(answer) }).catch(() => null);
	}

	/** Answers the `canvas_edit` tool: the canvas applies the edit or says why
	 *  it cannot, bounded per run by `CanvasEdits` (ADR 0033). */
	async #answerEdit(requestId: string, edit: CanvasEdit): Promise<void> {
		const answer = this.#edits.answer(this.#deps.chat.applyCanvasEdit(edit));
		await piSend(this.#sid, { type: "extension_ui_response", id: requestId, value: JSON.stringify(answer) }).catch(() => null);
	}

	/** Hands pi a message for the running turn. Advisory: a refusal is dropped,
	 *  and the turn goes on as it was. What pi delivers comes back on the stream
	 *  and is written where it arrived. */
	async #steer(message: string): Promise<void> {
		await piSend(this.#sid, { type: "steer", message }).catch(() => null);
	}

	/**
	 * Draws a running tool's output as a panel in the answer, opening it on the
	 * first output it is given. It is never interactive: its stdin is pi's, and
	 * nothing on the page reaches a running tool (ADR 0013). The panel is page
	 * material; the `pi:result` under the call is what the transcript holds.
	 */
	#showOutput(id: string, text: string): void {
		const chat = this.#deps.chat;
		const open = chat.liveView(id);
		if (open) {
			open.write(text);
			return;
		}
		// Opening it writes the panel's marker into the document.
		chat.openStreamingView("terminal", id, false)?.write(text);
		this.#changed();
	}

	/** Routes one of pi's events into the document. */
	#onEvent(event: Record<string, unknown>): void {
		if (this.#aside) return this.#onAside(event);
		// Every event is proof of life — a `tool_execution_update` during a long
		// `bash` as much as a chunk of the answer — so any one restarts the bound.
		this.#armSilence();
		this.#status.event(event);
		// What pi holds for the run, steers and follow-ups not yet delivered: pi
		// counts it, the badge says it.
		if (event["type"] === "queue_update") {
			const length = (key: string) => (Array.isArray(event[key]) ? (event[key] as unknown[]).length : 0);
			this.#status.queued(length("steering") + length("followUp"));
		}
		this.#showRun();
		if (event["type"] === "tool_execution_start") {
			if (typeof event["toolCallId"] === "string") this.#panels.start(event["toolCallId"], String(event["toolName"] ?? ""));
			this.#limits.toolCall();
			this.#checkLimits();
			if (event["toolName"] === BUDGET_TOOL) this.#setBudget(budgetMs((event["args"] as { minutes?: unknown } | undefined)?.minutes));
		}
		switch (event["type"]) {
			case "message_start": {
				// A user message pi delivers mid-turn — a steer, a follow-up — is
				// written where it arrived, so the document and pi's transcript hold
				// the same messages and nothing is said to the agent unseen
				// (`notebook-cells.md` §Policy). Folded: no command in the app opens
				// a block of its own.
				const message = event["message"] as { role?: string; content?: Parameters<typeof serializeUser>[0] } | undefined;
				if (!this.#running || !this.#promptSent || message?.role !== "user") break;
				if (this.#promptEchoPending) {
					this.#promptEchoPending = false;
					break;
				}
				const user = serializeUser(message.content ?? "");
				if (user) {
					this.#deps.chat.appendUserMessage(user, true);
					this.#changed();
				}
				break;
			}
			case "message_update": {
				const partial = this.#assistantOf(event);
				if (partial) this.#deps.chat.applyAssistantPartial(partial as never);
				this.#changed();
				break;
			}
			case "agent_end": {
				const refusal = refusalOf(event);
				if (refusal) this.#refusedWith = refusal;
				break;
			}
			case "message_end": {
				const message = event["message"] as AssistantPartial | undefined;
				if (message?.role === "assistant") {
					// A refusal has nothing to show; its reason is written when pi settles.
					if (isRefusal(message)) break;
					this.#deps.chat.finalizeAssistant(message as never);
					this.#changed();
				} else if (message?.role === "toolResult") {
					// The result lands under its call, as the transcript holds it: the
					// next send reads the document back as pi's history (ADR 0021).
					this.#deps.chat.appendToolResult(message as ToolResultMessage);
					this.#changed();
				}
				break;
			}
			// A tool's output while it runs. Each `partialResult` is the output so
			// far, whole, so a dropped update costs nothing; whether it is drawn as
			// a panel is `#panels`' to say.
			case "tool_execution_update": {
				const text = partialText(event["partialResult"]);
				const id = typeof event["toolCallId"] === "string" ? event["toolCallId"] : "";
				if (id) this.#panels.update(id, String(event["toolName"] ?? ""), text);
				break;
			}
			// The command ended: a panel stays on screen and stops expecting writes.
			case "tool_execution_end": {
				const id = typeof event["toolCallId"] === "string" ? event["toolCallId"] : "";
				if (!id) break;
				this.#panels.end(id);
				this.#deps.chat.liveView(id)?.settle();
				break;
			}
			case "agent_settled":
				// pi is done with the turn, whether it answered or stopped. The
				// canvas is told once, here, rather than guessing from the last
				// chunk it happened to see.
				if (this.#stoppedAt) this.#deps.chat.appendError(this.#stoppedAt);
				else if (this.#refusedWith) this.#deps.chat.appendError(this.#refusedWith);
				this.#setRunning(false);
				this.#deps.chat.endTurn();
				this.#changed();
				// One fence per cell (`notebook-cells.md`), but only between turns:
				// a new turn may have started by the time the canvas has rendered.
				void this.#deps.chat.updateComplete.then(() => {
					if (!this.#running) this.#deps.chat.compactRedefinitions();
				});
				break;
			case "error": {
				const message = typeof event["message"] === "string" ? providerErrorText(event["message"]) : "pi reported an error";
				this.#setRunning(false);
				this.#deps.chat.appendError(message);
				this.#deps.chat.endTurn();
				this.#changed();
				break;
			}
			case "extension_ui_request": {
				const asked = requestedCell(event);
				if (asked) void this.#answerVerdict(asked.requestId, asked.cellId);
				const edit = requestedEdit(event);
				if (edit) void this.#answerEdit(edit.requestId, edit.edit);
				break;
			}
			default:
				// Every other event belongs to a surface the app does not draw:
				// thinking among them. Ignored rather than mishandled.
				break;
		}
	}

	/**
	 * The assistant partial inside a `message_update`, if there is one.
	 *
	 * pi puts it in one of two places depending on the event, and an all-empty
	 * partial is dropped: writing it would wipe the placeholder the canvas drew
	 * when the turn opened.
	 */
	#assistantOf(event: Record<string, unknown>): AssistantPartial | null {
		const direct = event["message"] as AssistantPartial | undefined;
		const nested = (event["assistantMessageEvent"] as { partial?: AssistantPartial } | undefined)?.partial;
		const partial = direct ?? nested;
		if (partial?.role !== "assistant") return null;
		const content = partial.content;
		const empty = !content || (Array.isArray(content) && content.length === 0);
		return empty ? null : partial;
	}
}

/** The words of an assistant message, without its thinking or its calls. */
function textOfAssistant(message: unknown): string {
	const content = (message as { content?: unknown } | undefined)?.content;
	if (!Array.isArray(content)) return "";
	return content.map((part: { type?: string; text?: string }) => (part.type === "text" ? (part.text ?? "") : "")).join("").trim();
}

/** An assistant message the provider refused: stopped on `error`, with nothing
 *  written. A message that streamed text before failing keeps its text. */
function isRefusal(message: unknown): boolean {
	const m = message as { stopReason?: unknown; content?: unknown } | undefined;
	return m?.stopReason === "error" && (!Array.isArray(m.content) || m.content.length === 0);
}

/** Why the run's last request was refused and by whom, as the user reads it,
 *  from pi's `agent_end`; null when it was not, or when pi will retry it
 *  (`willRetry`) and the retry answers. */
function refusalOf(event: Record<string, unknown>): string | null {
	if (event["willRetry"] === true) return null;
	const messages = Array.isArray(event["messages"]) ? (event["messages"] as Array<Record<string, unknown>>) : [];
	const last = messages.filter((m) => m["role"] === "assistant").at(-1);
	if (last?.["stopReason"] !== "error") return null;
	return refusalText(typeof last["errorMessage"] === "string" && last["errorMessage"] ? last["errorMessage"] : "the provider refused the request", last);
}
