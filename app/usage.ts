// What a conversation uses: a meter of the context its last step occupied and
// the session's token and cost totals, first in the model chip (`app/model.ts`),
// to the left of the pills. Every number is pi's (`app/usage-pure.ts`).
//
// `get_session_stats` seeds both whenever the chip hears pi answer (`onState`):
// on opening a conversation whose pi runs, when this window starts pi, and when
// the model changes, which changes the window too. No pi is started to paint
// it. Each assistant reply of this conversation then adds its `usage`, and
// `agent_settled` seeds again, so pi's own count corrects any drift.
//
// A seed replaces the totals the replies of a run have been adding to, so none
// is taken while a run is in flight — from its first event to its settling —
// and one asked before a run began is dropped when its answer lands after the
// run's first event. A queued follow-up answers before the settling, so it
// belongs to the same run.
//
// A subsession's totals add to its parent's (`Subsessions.childTotals`); the
// meter is this conversation's alone.

import type { AssistantMessage } from "@earendil-works/pi-ai";
import { onPiEvent, piSend } from "../src/bridge.ts";
import { formatUsage } from "../src/utils/format.ts";
import type { AppContext } from "./context.ts";
import type { ModelPicker } from "./picks.ts";
import type { Subsessions } from "./subsessions.ts";
import { addUsage, contextUsed, EMPTY_TOTALS, METER_TICKS, meterOf, type StatsTotals, statsTotals, sumTotals, totalsTitle } from "./usage-pure.ts";

/** pi's events that only a run in flight sends. */
const RUN_EVENTS = new Set(["agent_start", "turn_start", "message_start", "message_update", "message_end", "tool_execution_start", "tool_execution_update", "tool_execution_end"]);

/** The part of `get_session_stats` the chip reads, beyond the totals: `tokens`
 *  is `null` right after a compaction, until the next reply. */
type Stats = StatsTotals & { contextUsage?: { tokens: number | null; contextWindow?: number } };

/** The part of `get_state`'s model the meter reads. */
type StateModel = { provider?: string; id?: string; contextWindow?: number };

const span = (className: string): HTMLSpanElement => {
	const el = document.createElement("span");
	el.className = className;
	return el;
};

/** Puts the meter and the totals in `picker`'s chip and keeps them pi's. */
export function mountUsage({ sid }: Pick<AppContext, "sid">, picker: ModelPicker, children: Pick<Subsessions, "childTotals" | "onChildUsage">): void {
	const root = span("usage");
	const meter = span("usage-meter");
	const track = span("usage-track");
	const fill = span("usage-fill");
	const label = span("usage-label");
	const totalsEl = span("usage-totals");
	track.append(fill);
	for (const tick of METER_TICKS) {
		const mark = span("usage-tick");
		mark.style.left = `${tick}%`;
		track.append(mark);
	}
	meter.append(track, label);
	root.append(meter, totalsEl);
	picker.chip.prepend(root);

	let totals = EMPTY_TOTALS;
	/** What the last step occupied; `null` when pi does not know. */
	let used: number | null = 0;
	let max = 0;
	/** The window of the model pi last said it runs, for stats that give none. */
	let modelWindow = 0;
	/** The model pi last said it runs, as `provider/id`; `null` before it has. */
	let model: string | null = null;
	let inFlight = false;
	/** Counts run events, so a seed answered after one began is known stale. */
	let runEvents = 0;

	const paint = () => {
		const shown = meterOf(used, max);
		meter.hidden = !shown;
		if (shown) {
			track.hidden = shown.fill === null;
			fill.style.width = `${shown.fill ?? 0}%`;
			fill.className = `usage-fill ${shown.zone}`;
			label.textContent = shown.label;
			meter.title = shown.title;
		}
		const child = children.childTotals();
		const text = formatUsage(child ? sumTotals(totals, child) : totals);
		totalsEl.hidden = !text;
		totalsEl.textContent = text;
		totalsEl.title = totalsTitle(child);
		root.hidden = !shown && !text;
	};

	const seed = async (): Promise<void> => {
		if (inFlight) return;
		const at = runEvents;
		const reply = await piSend(sid, { type: "get_session_stats" }).catch(() => null);
		const stats = reply?.success === true ? (reply.data as Stats | undefined) : undefined;
		if (inFlight || at !== runEvents || !stats?.tokens) return;
		totals = statsTotals(stats);
		used = stats.contextUsage ? stats.contextUsage.tokens : 0;
		max = stats.contextUsage?.contextWindow || modelWindow;
		paint();
	};

	picker.onState((state) => {
		const running = state["model"] as StateModel | undefined;
		const named = running ? `${running.provider}/${running.id}` : "";
		if (named === model) return;
		model = named;
		modelWindow = running?.contextWindow ?? 0;
		if (modelWindow) max = modelWindow;
		paint();
		void seed();
	});

	void onPiEvent((from, event) => {
		if (from !== sid) return;
		const type = event["type"] as string;
		if (RUN_EVENTS.has(type)) {
			inFlight = true;
			runEvents++;
		}
		if (type === "message_end") {
			const message = event["message"] as AssistantMessage | undefined;
			if (message?.role !== "assistant" || !message.usage) return;
			totals = addUsage(totals, message.usage);
			used = contextUsed(message.usage);
			paint();
		} else if (type === "agent_settled" || type === "error") {
			inFlight = false;
			void seed();
		}
	});
	children.onChildUsage(paint);
	paint();
}
