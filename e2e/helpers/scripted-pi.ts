// A pi that answers from a script, installed into the page before any module
// runs. Not a test — a harness, kept next to the flows it serves.
//
// The flows in `e2e/flows.spec.ts` need pi to answer a prompt. They must not
// need a model, a network or a credential to do it, and the real app's own
// `pnpm test:app` is where a real process belongs. So this stands in for the Rust half — and only the Rust half: the canvas,
// the keymap, `src/bridge.ts` and `app/turn.ts` are all the real thing.
//
// **Why this replaces `invoke` and nothing else.** `src/bridge.ts` is the only
// module that talks to Rust, lint-enforced, and everything it does goes through
// `invoke` — including events: `listen()` is itself an
// `invoke("plugin:event|listen", { handler: transformCallback(fn) })`. So
// capturing `invoke` plus `transformCallback` captures the whole surface, which
// is the seam working as designed.

import type { Usage } from "@earendil-works/pi-ai";
import { KNOWN_COMMANDS, refusal } from "./ipc-surface.ts";

/** One event from pi, in the shape `app/turn.ts` reads. */
export interface PiEvent {
	type: string;
	[key: string]: unknown;
}

/** What the page did, so a flow can assert on what pi was told. */
export interface PiLog {
	/** Every `pi_send` the page made, in order. `command` is pi's own rpc verb
	 *  object — `{ type: "prompt", message }` for a send, `{ type: "abort" }` for
	 *  a stop, `{ type: "steer" | "follow_up", message }` for what is sent while
	 *  a turn runs — because that is what `piSend` passes (`src/bridge.ts:244`). */
	sent: Array<{ sid: string; command: { type: string; message?: string } }>;
	/** Every `docs_write` the page made. The document store is the file, and the
	 *  file is the truth (ADR 0001) — so what was handed to it is observable. */
	writes: Array<{ id: string; content: string }>;
	/** The same writes in the order they FINISHED — what the file holds is the
	 *  last of these, which is not the last one made when an earlier write is
	 *  slower than a later one. */
	landed: Array<{ id: string; content: string }>;
	/** Every command invoked, for the rare assertion about plumbing. */
	calls: string[];
	/** Every transcript the page wrote whole before a send (ADR 0021), in order. */
	rebuilds: Array<{ sid: string; sessionFile: string; entries: unknown[] }>;
	/** Every `preferences_write` the page made: the whole of the preferences each time. */
	preferences: Array<Record<string, unknown>>;
}

/** An assistant `message_update`, which is how an answer streams in. */
export const partial = (text: string): PiEvent => ({
	type: "message_update",
	message: { role: "assistant", content: [{ type: "text", text }] },
});

/** The same message, final. `app/turn.ts` finalizes on this. `usage` is what
 *  the model reported for the step, in pi-ai's shape, as a real pi carries it. */
export const final = (text: string, usage?: Usage): PiEvent => ({
	type: "message_end",
	message: { role: "assistant", content: [{ type: "text", text }], ...(usage && { usage }) },
});

/** One assistant message writing a `cell` tool call, streamed then final — the
 *  shape `tests/integration/editor.test.ts`'s `streamCell` drives the canvas with. */
export const cellAnswer = (source: string, id: string, text = "here it is"): PiEvent[] => {
	const message = {
		role: "assistant",
		content: [
			{ type: "text", text },
			{ type: "toolCall", id: `toolu_${id}`, name: "cell", arguments: { source, id } },
		],
	};
	return [
		{ type: "message_update", message },
		{ type: "message_end", message },
	];
};

/** A step's usage in pi-ai's `Usage` shape, with `totalTokens` the sum as
 *  providers report it and the cost split left at zero but its total. */
export const usageOf = (input: number, output: number, cacheRead = 0, cacheWrite = 0, cost = 0): Usage => ({
	input,
	output,
	cacheRead,
	cacheWrite,
	totalTokens: input + output + cacheRead + cacheWrite,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

/** An assistant message that says something, then calls a tool: what pi ends
 *  a turn's first step with when the model wants a tool run. */
export const toolCallAnswer = (name: string, id: string, args: Record<string, unknown>, text: string, usage?: Usage): PiEvent => ({
	type: "message_end",
	message: {
		role: "assistant",
		content: [
			{ type: "text", text },
			{ type: "toolCall", id, name, arguments: args },
		],
		stopReason: "toolUse",
		...(usage && { usage }),
	},
});

/** A tool running, as pi's `AgentEvent` reports it. Each update's
 *  `partialResult` is CUMULATIVE — the output so far, whole — and the first is
 *  empty, as pi's bash emits one `{ content: [] }` the moment it starts. */
export const toolRun = (id: string, name: string, chunks: string[]): PiEvent[] => {
	const base = { toolCallId: id, toolName: name, args: {} };
	const snapshots = chunks.map((_, i) => chunks.slice(0, i + 1).join(""));
	const output = snapshots.at(-1) ?? "";
	return [
		{ type: "tool_execution_start", ...base },
		{ type: "tool_execution_update", ...base, partialResult: { content: [] } },
		...snapshots.map((text) => ({
			type: "tool_execution_update",
			...base,
			partialResult: { content: [{ type: "text", text }] },
		})),
		{
			type: "tool_execution_end",
			toolCallId: id,
			toolName: name,
			result: { content: [{ type: "text", text: output }] },
			isError: false,
		},
	];
};

/** The tool's result as pi records it: a `toolResult` message, which joins
 *  the transcript the way an assistant answer does. */
export const toolResultEnd = (id: string, name: string, text: string, isError = false): PiEvent => ({
	type: "message_end",
	message: {
		role: "toolResult",
		toolCallId: id,
		toolName: name,
		content: [{ type: "text", text }],
		isError,
		timestamp: 1,
	},
});

/** What pi answers a queued follow-up with, once it is delivered. A fixed
 *  text that quotes nothing, so a flow can count the follow-up's own words in
 *  the document and find them once. */
export const FOLLOW_UP_ANSWER = "Done, as asked.";

/** pi is done with the turn, however it went. The canvas is told once, here. */
export const settled = (): PiEvent => ({ type: "agent_settled" });

/** pi reported a failure. */
export const failed = (message: string): PiEvent => ({ type: "error", message });

/**
 * Answers every prompt with the same script, one event at a time.
 *
 * `stepMs` spaces the events out so a flow can act BETWEEN them — typing while
 * an answer streams is the canvas's whole premise (ADR 0005), and it cannot be
 * tested against a script that arrives all at once.
 */
export function answerWith(script: PiEvent[], stepMs = 60, options: Options = {}): string {
	return install(`(prompt) => ({ script: ${JSON.stringify(script)}, stepMs: ${stepMs} })`, options);
}

/** Answers each prompt differently, by what it says. The resolver runs IN the
 *  page, so it must be self-contained — no closure over the test's scope. */
export function answerBy(resolver: string, options: Options = {}): string {
	return install(resolver, options);
}

/** What the scripted host does beyond answering prompts. */
export interface Options {
	/** What pi sends when asked to `abort`: the rest of the running answer is
	 *  dropped and these follow, spaced like a script. Absent, an abort is
	 *  recorded and ignored — a pi that does not honour it. */
	onAbort?: PiEvent[];
	/** What the store already holds for the page's document, answered after
	 *  `delayMs` — a `docs_read` that takes a while, which is the boot race's
	 *  whole condition. Absent, the store holds nothing. Either way, once a
	 *  write has landed — or an outside edit (`__PI_EXTERNAL_EDIT__`) — a read
	 *  answers that instead, at once, as the real store would. */
	stored?: { content: string; delayMs: number };
	/** What `preferences_read` answers: what the user keeps. Absent, nothing is
	 *  kept and the page runs on its defaults. */
	preferences?: Record<string, unknown>;
	/** The script the page's face follows (`app/face/scripted.ts`): what
	 *  `face_source` answers with. Absent, nothing reads a face; a page spec
	 *  never gets the camera. */
	faceScript?: string;
	/** How long each `docs_write` takes, by the order it was made; a write past
	 *  the end of the list is immediate. A real write syncs to the drive, and
	 *  the drive decides how long that takes. */
	writeDelaysMs?: number[];
	/** Which `docs_write`s fail, by the order they were made, and with what —
	 *  a drive that is full or gone. A failed write lands nothing. */
	writeFailures?: Record<number, string>;
	/** What pi answers to `get_state` — the silence probe's question (ADR 0019
	 *  §4) — as the reply's `data`, with the session's transcript path added
	 *  the way pi reports it. Absent, pi says it is not streaming. */
	state?: { isStreaming: boolean; model?: { provider: string; id: string; name: string } };
	/** pi has stopped answering: `get_state` gets no reply in pi's shape, which
	 *  a probe reads as pi not answering. A real pi answers it whenever it can,
	 *  which is why this is the exception rather than the default. */
	wedged?: boolean;
	/** What `pi_running` answers — whether the session still has a live pi.
	 *  Absent, it does, which is what a pi that is wedged rather than gone
	 *  looks like to a probe that got no answer. */
	running?: boolean;
	/** What `pi_send` answers for a prompt, in place of pi's acceptance — a
	 *  refusal, a reply that timed out on the Rust side, or a `handled`
	 *  disposition: pi ran the prompt as a command of its own, and a prompt it
	 *  handles is not echoed. The script still runs; a flow that wants silence
	 *  passes an empty one. */
	promptReply?: { success: boolean; error?: string; timedOut?: boolean; data?: { disposition: string } };
	/** How long `get_entries` takes to answer: the preflight held open, so a
	 *  flow can act while the prompt has not been sent yet. */
	entriesDelayMs?: number;
	/** What `pi_send` answers for a steer, in place of pi's queueing it — a
	 *  refusal, which queues nothing and delivers nothing. */
	steerReply?: { success: false; error?: string };
	/** What pi answers to `get_session_stats`, as the reply's `data`: pi-coding-agent's
	 *  `SessionStats`, the part of it the page reads. Absent, it is answered
	 *  with nothing, as any command this harness does not script. */
	stats?: {
		tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
		cost: number;
		contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
	};
}

/**
 * The init script. Returns source for `page.addInitScript`, which runs before
 * any module — so `inApp()` is already true and the console forwarder's first
 * call does not reject on an import-time throw.
 */
function install(resolver: string, options: Options): string {
	return `
(() => {
  const log = { sent: [], writes: [], landed: [], calls: [], rebuilds: [], preferences: [] };
  // What pi remembers, per session: every prompt it took and every answer it
  // finished, as \`get_entries\` reports them — or, after a rebuild, exactly
  // the entries the page wrote (ADR 0021).
  const transcripts = new Map();
  const remember = (sid, message) => {
    const entries = transcripts.get(sid) ?? [];
    const id = "s" + entries.length;
    entries.push({ type: "message", id, parentId: entries.at(-1)?.id ?? null, timestamp: "2026-01-01T00:00:00.000Z", message });
    transcripts.set(sid, entries);
  };
  // The file as the store holds it: what the last write that FINISHED left
  // there, or what an outside editor put there since.
  const disk = new Map();
  const options = ${JSON.stringify(options)};
  let answering = [];           // the running answer's pending events
  // Follow-ups pi holds until the running answer is done, by their text.
  const followUps = [];
  const queueUpdate = (sid, steering, followUp) =>
    emit("pi-event", [sid, { type: "queue_update", steering, followUp: [...followUp] }]);
  // pi delivers a follow-up once the answer it waited for is final, and
  // answers it before the turn settles: the user message, the queue it left,
  // then a short answer — each joining the transcript as it arrives.
  const deliverFollowUps = (sid) => {
    while (followUps.length > 0) {
      const message = { role: "user", content: [{ type: "text", text: followUps.shift() }], timestamp: 1 };
      remember(sid, message);
      emit("pi-event", [sid, { type: "message_start", message }]);
      queueUpdate(sid, [], followUps);
      const reply = { role: "assistant", content: [{ type: "text", text: ${JSON.stringify(FOLLOW_UP_ANSWER)} }] };
      emit("pi-event", [sid, { type: "message_update", message: reply }]);
      remember(sid, reply);
      emit("pi-event", [sid, { type: "message_end", message: reply }]);
    }
  };
  const handlers = new Map();   // callback id -> fn
  const listeners = new Map();  // event name -> [callback id]
  let nextId = 1;
  const resolve = ${resolver};
  // The surface this fake answers (ipc-surface.ts); anything else is refused.
  const known = new Set(${JSON.stringify(KNOWN_COMMANDS)});

  // Rust emits to every listener of a name; replay that shape exactly.
  const emit = (name, payload) => {
    for (const id of listeners.get(name) ?? []) handlers.get(id)?.({ event: name, payload });
  };

  window.__PI_LOG__ = log;
  // Flows drive extra events through this — a stray chunk after a turn ended,
  // for instance, which has no prompt to be the answer to.
  window.__PI_EMIT__ = (name, payload) => emit(name, payload);
  // Another program changing a document on disk: the file changes, then the
  // watcher says so — in that order, as notify reports a rename that is done.
  window.__PI_EXTERNAL_EDIT__ = (id, content) => {
    disk.set(id, content);
    emit("doc-changed", id);
  };

  // What \`listen\`'s unlisten reaches for before it asks Rust to forget a
  // listener; the real app's event plugin installs it.
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  window.__TAURI_INTERNALS__ = {
    // What \`getCurrentWebviewWindow()\` reads: the page scopes its exit-flush
    // listener to its own window, as the real app labels it.
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (callback) => {
      const id = nextId++;
      handlers.set(id, callback);
      return id;
    },
    invoke: (command, args) => {
      log.calls.push(command);
      if (!known.has(command)) return Promise.reject(new Error(${JSON.stringify(refusal("<cmd>"))}.replace("<cmd>", command)));
      if (command === "plugin:event|listen") {
        const ids = listeners.get(args.event) ?? [];
        ids.push(args.handler);
        listeners.set(args.event, ids);
        return Promise.resolve(nextId++);
      }
      if (command === "docs_write") {
        const write = { id: args.id, content: args.content };
        const delayMs = options.writeDelaysMs?.[log.writes.length] ?? 0;
        const failure = options.writeFailures?.[log.writes.length];
        log.writes.push(write);
        return new Promise((resolve, reject) =>
          setTimeout(() => {
            if (failure !== undefined) return reject(failure);
            log.landed.push(write);
            disk.set(write.id, write.content);
            resolve();
          }, delayMs),
        );
      }
      if (command === "pi_send") {
        log.sent.push({ sid: args.sid, command: args.command });
        // Only a prompt gets answered. An abort or anything else is recorded
        // and left to the flow to assert on.
        const answer = args.command?.type === "prompt" ? resolve(args.command.message) : null;
        // A prompt pi takes comes back as a user message before its answer,
        // as a real pi's does — the page must recognise it, not write it twice.
        const refused = options.promptReply && options.promptReply.success === false && !options.promptReply.timedOut;
        const handled = options.promptReply?.data?.disposition === "handled";
        if (args.command?.type === "prompt" && !refused && !handled) {
          const echo = { role: "user", content: [{ type: "text", text: args.command.message }] };
          setTimeout(() => emit("pi-event", [args.sid, { type: "message_start", message: echo }]), 0);
        }
        // A steer is queued, then delivered: pi reports the queue holding it
        // before it replies, then the message joins the transcript where it
        // arrives and comes back on the stream as a user message, and the
        // queue is empty again.
        if (args.command?.type === "steer") {
          if (options.steerReply) return Promise.resolve({ type: "response", command: "steer", ...options.steerReply });
          const message = { role: "user", content: [{ type: "text", text: args.command.message }], timestamp: 1 };
          queueUpdate(args.sid, [args.command.message], []);
          setTimeout(() => {
            remember(args.sid, message);
            emit("pi-event", [args.sid, { type: "message_start", message }]);
            queueUpdate(args.sid, [], []);
          }, 0);
          return Promise.resolve({ type: "response", command: "steer", success: true, data: { disposition: "queued" } });
        }
        // A follow-up waits for the running answer (\`deliverFollowUps\`).
        if (args.command?.type === "follow_up") {
          followUps.push(args.command.message);
          queueUpdate(args.sid, [], followUps);
          return Promise.resolve({ type: "response", command: "follow_up", success: true, data: { disposition: "queued" } });
        }
        if (answer) {
          // Spaced out, and asynchronous: the page must be free to take input
          // between chunks, which is the thing most worth testing here.
          // The answer a queued follow-up waits for: the script's last final
          // assistant message. One queued after it still lands before the
          // turn settles.
          const last = answer.script.findLastIndex((e) => e.type === "message_end" && e.message?.role === "assistant");
          answering = answer.script.map((event, i) =>
            setTimeout(() => {
              if (event.type === "agent_settled") deliverFollowUps(args.sid);
              // pi records an assistant answer and a tool result alike, so a
              // history compare after a tool turn reads what a real pi holds.
              const role = event.message?.role;
              if (event.type === "message_end" && (role === "assistant" || role === "toolResult")) remember(args.sid, event.message);
              emit("pi-event", [args.sid, event]);
              if (i === last) deliverFollowUps(args.sid);
            }, (i + 1) * answer.stepMs),
          );
        }
        if (args.command?.type === "prompt") {
          remember(args.sid, { role: "user", content: [{ type: "text", text: args.command.message }], timestamp: 1 });
        }
        if (args.command?.type === "get_entries") {
          const entries = transcripts.get(args.sid) ?? [];
          const reply = {
            type: "response",
            command: "get_entries",
            success: true,
            data: { entries, leafId: entries.at(-1)?.id ?? null },
          };
          return new Promise((resolve) => setTimeout(() => resolve(reply), options.entriesDelayMs ?? 0));
        }
        if (args.command?.type === "get_state" && !options.wedged) {
          const sessionFile = "/tmp/scripted-pi/2026-01-01T00-00-00-000Z_" + args.sid + ".jsonl";
          const state = options.state ?? { isStreaming: false };
          return Promise.resolve({ type: "response", command: "get_state", success: true, data: { ...state, sessionFile } });
        }
        if (args.command?.type === "get_session_stats" && options.stats) {
          return Promise.resolve({ type: "response", command: "get_session_stats", success: true, data: options.stats });
        }
        if (args.command?.type === "prompt" && options.promptReply) {
          return Promise.resolve({ type: "response", command: "prompt", ...options.promptReply });
        }
        if (args.command?.type === "abort" && options.onAbort) {
          for (const timer of answering) clearTimeout(timer);
          answering = [];
          options.onAbort.forEach((event, i) => {
            setTimeout(() => emit("pi-event", [args.sid, event]), (i + 1) * 20);
          });
        }
        return Promise.resolve();
      }
      if (command === "pi_rebuild") {
        log.rebuilds.push({ sid: args.sid, sessionFile: args.sessionFile, entries: args.entries });
        transcripts.set(args.sid, [...args.entries]);
        return Promise.resolve();
      }
      if (command === "docs_read" && disk.has(args.id)) return Promise.resolve(disk.get(args.id));
      if (command === "docs_read" && options.stored) {
        const { content, delayMs } = options.stored;
        return new Promise((resolve) => setTimeout(() => resolve(content), delayMs));
      }
      // Everything else is plumbing a flow does not assert on. Answer in the
      // shape src/bridge.ts expects: a list where it reads a list, else void.
      if (command === "docs_list" || command === "pi_sessions") return Promise.resolve([]);
      if (command === "docs_read") return Promise.resolve(null);
      if (command === "pi_running") return Promise.resolve(options.running ?? true);
      if (command === "preferences_read") return Promise.resolve(options.preferences);
      // Kept, and told to the page, as Rust tells every window (ADR 0048).
      if (command === "preferences_write") {
        options.preferences = args.preferences;
        log.preferences.push(args.preferences);
        emit("preferences-changed", args.preferences);
        return Promise.resolve();
      }
      if (command === "face_source") return Promise.resolve(options.faceScript ? { kind: "script", script: options.faceScript } : { kind: "none" });
      return Promise.resolve();
    },
  };
})();
`;
}

/** A request the provider refused, as pi reports it: an assistant message with
 *  no content that stopped on `error`, then the run's end, `willRetry` saying
 *  whether pi will send it again. `from` is the provider and model pi sent it
 *  to, which a real pi's message always names. */
export const providerRefused = (errorMessage: string, willRetry = false, from?: { provider: string; model: string }): PiEvent[] => {
	const message = { role: "assistant", content: [], stopReason: "error", errorMessage, ...from };
	return [
		{ type: "message_end", message },
		{ type: "agent_end", messages: [message], willRetry },
	];
};
