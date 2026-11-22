// What the model and effort pills name and offer, as data (`app/model.ts` owns
// the DOM and the calls to pi). Every list here is pi's own answer —
// `get_available_models`, `get_available_thinking_levels` — so the choices are
// the ones the user's own pi can run (ADR 0004).

import type { MenuItem } from "./menu.ts";

/** A model as pi names it: the part of pi-ai's `Model` the pills read. */
export interface ModelInfo {
	provider: string;
	id: string;
	name?: string;
}

/** What a conversation runs: a model, by pi's provider and id, and an effort. */
export interface ModelPick {
	provider: string;
	modelId: string;
	/** The model's own name, else its id: what the pill shows. */
	name: string;
	thinking: string;
}

/** The pick a `get_state` answer names, or `null` when pi runs no model. */
export function pickOf(state: Record<string, unknown> | undefined): ModelPick | null {
	const model = state?.["model"] as Partial<ModelInfo> | undefined;
	if (typeof model?.provider !== "string" || typeof model.id !== "string") return null;
	const thinking = state?.["thinkingLevel"];
	return { provider: model.provider, modelId: model.id, name: model.name || model.id, thinking: typeof thinking === "string" ? thinking : "" };
}

/** A pick kept as text, read back whole or not at all: a partial one would
 *  point pi at a model nobody chose. */
export function stagedPick(text: string | null): ModelPick | null {
	if (!text) return null;
	try {
		const value = JSON.parse(text) as Partial<ModelPick>;
		const whole = ["provider", "modelId", "name", "thinking"].every((field) => typeof value[field as keyof ModelPick] === "string");
		return whole ? (value as ModelPick) : null;
	} catch {
		return null;
	}
}

/** The model menu: pi's models under their providers, in the order pi lists
 *  them, the one running marked and not choosable, the way Open… marks this
 *  window's own document. pi lists only the models it can authenticate, so an
 *  empty list is no provider at all, and the one row is `signIn`. */
export function modelRows(models: readonly ModelInfo[], current: ModelPick | null, choose: (model: ModelInfo) => void, signIn: () => void): MenuItem[] {
	if (!models.length) return [{ label: "Sign in…", title: "pi has no provider to answer with: sign in to one", run: signIn }];
	const providers = [...new Set(models.map((model) => model.provider))];
	return providers.flatMap((provider): MenuItem[] => [
		{ section: provider },
		...models
			.filter((model) => model.provider === provider)
			.map((model): MenuItem => {
				const running = current?.provider === provider && current.modelId === model.id;
				return {
					label: `${model.name || model.id}${running ? " ·" : ""}`,
					title: `${provider}/${model.id}`,
					disabled: running,
					run: () => choose(model),
				};
			}),
	]);
}

/** The effort menu: the levels pi says the running model takes. */
export function effortRows(levels: readonly string[], current: string, choose: (level: string) => void): MenuItem[] {
	return levels.map((level) => ({ label: `${level}${level === current ? " ·" : ""}`, disabled: level === current, run: () => choose(level) }));
}

/** What the page's other modules ask of the chip (`app/model.ts`). */
export interface ModelPicker {
	/** Before a send: brings the chip up to date, and gives a conversation pi
	 *  has no messages for the pick staged for it. */
	prepare(): Promise<void>;
	/** Starts `child` on this window's pick, before its first prompt. */
	carryTo(child: string): Promise<void>;
	/** Stages this window's pick for the conversation `id`, about to be made. */
	stageFor(id: string): void;
	/** Model… and Effort… in the menu: the pills' own menus, opened. */
	chooseModel(): Promise<void>;
	chooseEffort(): Promise<void>;
	/** Looks up the newest version now and says what was found: Help → Check
	 *  for Updates… (`app/update.ts`). */
	checkUpdates(): void;
	/** The chip itself, for what else it shows beside the pills (`app/usage.ts`). */
	chip: HTMLElement;
	/** Hears each `get_state` pi answers this conversation's chip with: pi is up,
	 *  and runs the model it names. */
	onState(listener: (state: Record<string, unknown>) => void): void;
	/** Adds a row to the end of the model menu. */
	addRow(row: MenuItem & { needsProvider?: boolean }): void;
	/** pi was stopped: the chip names nothing until it is asked again. */
	forget(): void;
	/** pi was restarted under the chip: asks it again what it runs. */
	reread(): Promise<void>;
}
