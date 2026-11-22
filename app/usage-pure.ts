// What the chip says a conversation has used, as data (`app/usage.ts` owns the
// DOM and the calls to pi). Every number here is pi's own: a reply's `usage`
// as the provider reported it, or `get_session_stats` (ADR 0002 — the
// transcript is pi's, so its totals are too).

import type { Usage } from "@earendil-works/pi-ai";
import { formatTokenCount } from "../src/utils/format.ts";

/** A session's totals, in pi-ai's `Usage` shape so `formatUsage` reads them as
 *  it reads one reply's. Only `cost.total` is kept: the stats give no split. */
export const EMPTY_TOTALS: Usage = Object.freeze({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }),
});

/** The part of pi-coding-agent's `SessionStats` the totals read. */
export interface StatsTotals {
	tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
	cost: number;
}

/** What a step occupied of the context window, by pi's own rule
 *  (`calculateContextTokens`): the provider's total, else the sum of its parts. */
export function contextUsed(usage: Usage): number {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

/** The meter's zones, from the percent of the window used. */
export type Zone = "ok" | "warn" | "over";

export interface Meter {
	/** The bar's width in percent, or `null` for a count with no bar. */
	fill: number | null;
	zone: Zone;
	label: string;
	title: string;
}

/** The thresholds the meter ticks at, in percent of the window. */
export const METER_TICKS = [50, 70, 85] as const;

/** A token count as the meter reads it: `formatTokenCount`, but a million or
 *  more in millions, so a 1M window is not `1000k`. */
function tokens(count: number): string {
	if (count < 1_000_000) return formatTokenCount(count);
	return `${Number((count / 1_000_000).toFixed(1))}M`;
}

const SHARPNESS = "full sharpness under 50% · complex reasoning dulls past 70% · meaningfully worse past 85%";

/**
 * The context meter for `used` of `max` tokens. `used` is `null` when pi does
 * not know it — right after a compaction, until the next reply — which is an
 * empty bar rather than a claim of 0%. Nothing shows while nothing was used,
 * and with no window size the meter is only a count.
 */
export function meterOf(used: number | null, max: number): Meter | null {
	if (used === 0) return null;
	if (used === null) {
		if (!max) return null;
		const title = `context: unknown of ${tokens(max)} until the next reply — ${SHARPNESS}`;
		return { fill: 0, zone: "ok", label: `? / ${tokens(max)}`, title };
	}
	if (!max) return { fill: null, zone: "ok", label: `${tokens(used)} ctx`, title: `context: ${tokens(used)} — the model's window size is unknown` };
	const percent = (used / max) * 100;
	const zone: Zone = percent >= METER_TICKS[2] ? "over" : percent >= METER_TICKS[1] ? "warn" : "ok";
	const title = `context: ${tokens(used)} of ${tokens(max)} (${Math.round(percent)}%) — ${SHARPNESS}`;
	return { fill: Math.min(100, percent), zone, label: `${tokens(used)} / ${tokens(max)}`, title };
}

const totalsOf = (input: number, output: number, cacheRead: number, cacheWrite: number, totalTokens: number, cost: number): Usage => ({
	input,
	output,
	cacheRead,
	cacheWrite,
	totalTokens,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

/** `totals` with one reply's usage added. A message's cost is `cost.total`. */
export function addUsage(totals: Usage, usage: Usage): Usage {
	return sumTotals(totals, usage);
}

/** The totals `get_session_stats` reports, whose cost is a plain number. */
export function statsTotals(stats: StatsTotals): Usage {
	const { input, output, cacheRead, cacheWrite, total } = stats.tokens;
	return totalsOf(input, output, cacheRead, cacheWrite, total, stats.cost);
}

/** Two totals as one: a parent's with a child's. */
export function sumTotals(a: Usage, b: Usage): Usage {
	return totalsOf(
		a.input + b.input,
		a.output + b.output,
		a.cacheRead + b.cacheRead,
		a.cacheWrite + b.cacheWrite,
		a.totalTokens + b.totalTokens,
		a.cost.total + (b.cost?.total ?? 0),
	);
}
/** The totals' tooltip. A child counts as included once it used a token or
 *  cost something; a child that answered with nothing changes no number. */
export function totalsTitle(child: Usage | null): string {
	const contributed = child && (child.input || child.output || child.cacheRead || child.cacheWrite || child.totalTokens || child.cost.total);
	return contributed ? "session tokens, sub-agents included" : "session tokens";
}
