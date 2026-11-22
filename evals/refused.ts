// What a run says of the turns a provider refused. A refused turn fails its
// case like a bad answer does, so a run on a credential the provider will not
// take would read as a prompt that fails everything; this is what keeps the two
// apart. Pure: the runner prints it and writes it into the report.

/** What this needs of a case's outcome. */
export interface RefusedOutcome {
	model: string;
	slug: string;
	/** The provider's reason, when it refused the turn. */
	refused?: string;
}

/** One line per model with a refused turn: how many of its turns, which cases, and why. */
export function refusedLines(outcomes: readonly RefusedOutcome[]): string[] {
	return [...new Set(outcomes.map((o) => o.model))].flatMap((model) => {
		const mine = outcomes.filter((o) => o.model === model);
		const refused = mine.filter((o) => o.refused !== undefined);
		if (refused.length === 0) return [];
		const reasons = [...new Set(refused.map((o) => o.refused))].join(" · ");
		return [`**${model}:** ${refused.length} of ${mine.length} turns (${refused.map((o) => o.slug).join(", ")}): ${reasons}`];
	});
}

/** The report's section on refused turns, ahead of its scores; nothing when none was. */
export function refusedSection(outcomes: readonly RefusedOutcome[]): string[] {
	const lines = refusedLines(outcomes);
	if (lines.length === 0) return [];
	return ["## Refused by the provider", "", "These turns were never answered, so their failed checks say nothing about the prompt.", "", ...lines.map((l) => `- ${l}`), ""];
}
