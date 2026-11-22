import type { Usage } from "@earendil-works/pi-ai";

/** Shortcut labels for the send bindings (CodeMirror Mod = ⌘ on Mac, Ctrl elsewhere).
 *  IS_MAC also gates a chord and not just its label: on macOS Ctrl is a live
 *  text-motion modifier inside the editor, so ⇧⌘F must be ⌘-only there. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);
export const MOD_ENTER = IS_MAC ? "⌘⏎" : "Ctrl+Enter";
export const SHIFT_MOD_ENTER = IS_MAC ? "⇧⌘⏎" : "Shift+Ctrl+Enter";

export function formatCost(cost: number): string {
	return `$${cost.toFixed(4)}`;
}

export function formatUsage(usage: Usage) {
	if (!usage) return "";

	const parts = [];
	if (usage.input) parts.push(`↑${formatTokenCount(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokenCount(usage.output)}`);
	if (usage.cacheRead) parts.push(`R${formatTokenCount(usage.cacheRead)}`);
	if (usage.cacheWrite) parts.push(`W${formatTokenCount(usage.cacheWrite)}`);
	if (usage.cost?.total) parts.push(formatCost(usage.cost.total));

	return parts.join(" ");
}

export function formatTokenCount(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	return `${Math.round(count / 1000)}k`;
}
