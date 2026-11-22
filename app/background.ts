// One session's run with no canvas showing it: a child started from a parent's
// window. Its events are written into the document's text through the mirror
// (`src/document/mirror.ts`) — the events the app's own `Turn` writes on screen,
// no others, so the document equals what an on-screen run would have left —
// and saved through the store. A window showing the child takes each save in
// through its watcher, as it takes any outside edit (ADR 0018 §3).

import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";
import { docsWrite, onPiEvent } from "../src/bridge.ts";
import { setSubsessionStatus, subsessionStatus } from "../src/components/views/subsession.ts";
import { serializeUser } from "../src/document/format.ts";
import { closeMirror, type Mirror, mirrorError, mirrorFinal, mirrorPartial, mirrorText, mirrorToolResult, mirrorUser, openMirror } from "../src/document/mirror.ts";

/** How a follow is told to go on: `echoPending` drops the first user message
 *  pi delivers — the prompt, already in the document; `progress` hears the run
 *  as it stands after each save, and `null` once pi has settled it. */
export interface FollowOptions {
	echoPending: boolean;
	progress?: (mirror: Mirror | null) => void;
}

/**
 * Follows `sid`'s run until pi settles it: writing what arrives, saving each
 * finished message and the end, and keeping its card's status
 * (`setSubsessionStatus`). It starts from `start`: the document as it stands,
 * with the run opened at its end, or a run already open, handed over by a
 * canvas that stopped showing it. Subscribed before it returns, so a caller
 * that prompts after it misses nothing.
 */
export async function followRun(sid: string, start: string | Mirror, { echoPending, progress }: FollowOptions): Promise<void> {
	let mirror: Mirror = typeof start === "string" ? openMirror(start) : start;
	let echo = echoPending;
	const save = (text: string) => void docsWrite(sid, text).catch(() => {});

	const unlisten = await onPiEvent((eventSid, event) => {
		if (eventSid !== sid) return;
		switch (event["type"]) {
			case "message_start": {
				setSubsessionStatus(sid, "running");
				const message = event["message"] as { role?: string; content?: Parameters<typeof serializeUser>[0] } | undefined;
				if (message?.role !== "user") break;
				if (echo) {
					echo = false;
					break;
				}
				const user = serializeUser(message.content ?? "");
				if (user) mirror = mirrorUser(mirror, user);
				break;
			}
			case "message_update": {
				setSubsessionStatus(sid, "running");
				const partial = (event["message"] ?? (event["assistantMessageEvent"] as { partial?: unknown } | undefined)?.partial) as
					| AssistantMessage
					| undefined;
				if (partial?.role === "assistant") mirror = mirrorPartial(mirror, partial);
				break;
			}
			// A tool's result is written, never its live panel: a panel's bytes are
			// not document content (`live-views.ts` rule 3), and the result carries the output.
			case "message_end": {
				const message = event["message"] as AssistantMessage | ToolResultMessage | undefined;
				if (message?.role === "assistant") mirror = mirrorFinal(mirror, message);
				else if (message?.role === "toolResult") mirror = mirrorToolResult(mirror, message);
				else break;
				save(mirrorText(mirror));
				progress?.(mirror);
				break;
			}
			case "error": {
				setSubsessionStatus(sid, "error");
				mirror = mirrorError(mirror, typeof event["message"] === "string" ? event["message"] : "pi reported an error");
				break;
			}
			case "agent_settled": {
				setSubsessionStatus(sid, subsessionStatus(sid) === "error" ? "error" : "done");
				save(closeMirror(mirror));
				progress?.(null);
				unlisten();
				break;
			}
			default:
				break;
		}
	});
}
