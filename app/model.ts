// The model and the thinking effort this conversation's pi runs: two pills in a
// chip at the window's bottom-right, each opening the page's popover with the
// choices pi offers (`app/picks.ts`).
//
// What a pill names is always pi's answer to `get_state`, asked again after
// every change, never the click: pi refuses a model it holds no key for, and
// clamps the effort to what a model takes, so a switch of model can change the
// effort too. A refusal is said on the status line (ADR 0011). pi records each
// change in its transcript, which its resume reads, so a pick outlives a reopen
// without a store of its own here; across the restart a rewritten history
// causes, the send puts pi back on what it ran (`app/history.ts`).
//
// The effort the user picked is the exception, because pi does not keep it: a
// switched model starts on pi's settings default, not on the pick, and an
// effort a model does not take is clamped up to the next one it does
// (`clampThinkingLevel`). So the pick is kept here, per conversation, and
// handed to pi after every model change. A model without medium runs high,
// and the next one with medium runs medium again rather than inheriting high.
//
// No pi is started to paint the chip; a click starts one, as a send would.
//
// A conversation made from this window — New Document, the list's new and
// duplicate — starts on this window's pick: it is staged under the new id, and
// the new conversation's window takes it before its first send, while pi has
// no messages. A subsession's child is started by this window, so it is set
// directly. Staged picks are presentation state, kept beside the folds
// (`app/folds.ts`); ADR 0018's objection is to a second copy of the document.

import type { MenuItem } from "./menu.ts";
import { onPiEvent, piRunning, piSend, piStart, type PiReply } from "../src/bridge.ts";
import type { AppContext } from "./context.ts";
import { openMenu } from "./menu.ts";
import "./model.css";
import { mountUpdate } from "./update.ts";
import { effortRows, type ModelInfo, type ModelPick, type ModelPicker, modelRows, pickOf, stagedPick } from "./picks.ts";

const stageKey = (id: string) => `piary-pick:${id}`;
const effortKey = (id: string) => `piary-effort:${id}`;

/** The answer to a command pi could not be reached for, in pi's own shape. */
const unreached = (error: unknown): PiReply => ({ success: false, error: error instanceof Error ? error.message : String(error) });

/** Mounts the chip for the conversation `sid` and keeps it naming what pi runs.
 *  `signIn` is the model menu's one row when pi lists no models. */
export function mountModelPicker({ sid, notify, signIn }: Pick<AppContext, "sid" | "notify"> & { signIn: () => void }): ModelPicker {
	const chip = document.createElement("div");
	chip.className = "model-chip";
	const pill = (pick: string, title: string) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "model-pill";
		button.dataset["pick"] = pick;
		button.title = title;
		button.setAttribute("aria-haspopup", "menu");
		return button;
	};
	const modelPill = pill("model", "Model");
	const effortPill = pill("effort", "Thinking effort");
	chip.append(modelPill, effortPill);
	document.body.append(chip);
	// The notice of a newer version, left of the model (ADR 0064).
	const update = mountUpdate(chip, notify);

	/** What pi runs, as it last said; `null` until it has been asked. */
	let current: ModelPick | null = null;
	/** A pick staged for this conversation and not yet given to pi. */
	let staged = readStaged(sid);
	/** The effort the user picked, which the running model may not take; until
	 *  they pick one, the effort pi first said it runs. */
	let wanted = stored(effortKey(sid));

	const want = (level: string) => {
		wanted = level;
		try {
			localStorage.setItem(effortKey(sid), level);
		} catch {} // a storage that refuses costs the pick across a reload, nothing more
	};

	const paint = () => {
		const shown = current ?? staged;
		modelPill.textContent = shown?.name ?? "model";
		effortPill.textContent = shown?.thinking || "effort";
		modelPill.setAttribute("aria-label", `Model: ${modelPill.textContent}`);
		effortPill.setAttribute("aria-label", `Thinking effort: ${effortPill.textContent}`);
		if (shown) modelPill.title = `${shown.provider}/${shown.modelId}`;
		effortPill.title =
			current && wanted && wanted !== current.thinking
				? `Thinking effort: you picked ${wanted}, which ${current.name} does not take, so pi runs ${current.thinking}`
				: "Thinking effort";
	};

	/** Rows other features add to the end of the model menu (`ModelPicker.addRow`). */
	const extraRows: Array<MenuItem & { needsProvider?: boolean }> = [];
	/** Whoever hears pi's answers to `get_state` (`ModelPicker.onState`). */
	const listeners: ((state: Record<string, unknown>) => void)[] = [];

	const send = (target: string, command: Record<string, unknown>) => piSend(target, command).catch(unreached);

	/** Asks pi what it runs, and paints that. */
	const refresh = async (): Promise<Record<string, unknown> | undefined> => {
		const reply = await send(sid, { type: "get_state" });
		if (reply?.success === true) current = pickOf(reply.data);
		if (!wanted && current?.thinking) wanted = current.thinking;
		paint();
		if (reply?.success === true && reply.data) for (const listener of listeners) listener(reply.data);
		return reply?.success === true ? reply.data : undefined;
	};

	/** Says a refused change, and answers whether it went through. */
	const said = (reply: PiReply, what: string): boolean => {
		if (reply?.success !== false) return true;
		notify(`Could not switch to ${what}: ${reply.error ?? "pi refused it"}`);
		return false;
	};

	/** Hands `target`'s pi the effort the user picked, after a model change has
	 *  put it on pi's default; pi clamps it up to what the model takes. */
	const keepEffort = async (target: string, level = wanted): Promise<void> => {
		if (level) said(await send(target, { type: "set_thinking_level", level }), `${level} effort`);
	};

	/** Points `target` at `pick`: the model, then the effort. */
	const apply = async (target: string, pick: ModelPick): Promise<void> => {
		if (!said(await send(target, { type: "set_model", provider: pick.provider, modelId: pick.modelId }), pick.name)) return;
		await keepEffort(target, pick.thinking);
	};

	/** This window's pick, its effort the one the user picked. */
	const ownPick = (): ModelPick | null => {
		const pick = current ?? staged;
		return pick && { ...pick, thinking: wanted ?? pick.thinking };
	};

	/** A staged pick goes to pi once, and only to a conversation with no
	 *  messages: it never re-points one that has answers. */
	const takeStaged = async (state: Record<string, unknown> | undefined): Promise<void> => {
		if (!staged) return;
		const pick = staged;
		staged = null;
		try {
			localStorage.removeItem(stageKey(sid));
		} catch {}
		if (state?.["messageCount"] !== 0) return;
		if (pick.thinking) want(pick.thinking);
		await apply(sid, pick);
	};

	/** pi started and current, the staged pick given: what a pill click and a
	 *  send both need first. */
	const ready = async (): Promise<boolean> => {
		try {
			await piStart(sid);
		} catch (error) {
			notify(String(error));
			return false;
		}
		const state = await refresh();
		if (staged) {
			await takeStaged(state);
			await refresh();
		}
		return true;
	};

	/** A pill's menu, opened above it with what `rows` builds once pi has
	 *  answered: what a click on the pill and the menu bar's item both do. */
	const opener = (anchor: HTMLElement, rows: () => Promise<Parameters<typeof openMenu>[2]>) => {
		const open = async (): Promise<void> => {
			if (!(await ready())) return;
			const box = anchor.getBoundingClientRect();
			openMenu(box.left, box.top, await rows(), { above: true });
		};
		anchor.addEventListener("click", () => void open());
		return open;
	};

	const chooseModel = opener(modelPill, async () => {
		const reply = await send(sid, { type: "get_available_models" });
		const models = (reply?.success === true ? reply.data?.["models"] : undefined) as ModelInfo[] | undefined;
		if (!models) {
			notify(`pi did not list its models: ${reply?.error ?? "no answer"}`);
			return null;
		}
		return [...modelRows(
			models,
			current,
			(model) => {
				void (async () => {
					if (said(await send(sid, { type: "set_model", provider: model.provider, modelId: model.id }), model.name || model.id)) await keepEffort(sid);
					await refresh();
				})();
			},
			signIn,
		), ...(extraRows.length ? [{ section: "this conversation" }, ...extraRows.filter((row) => models.length > 0 || !row.needsProvider)] : [])];
	});

	const chooseEffort = opener(effortPill, async () => {
		const reply = await send(sid, { type: "get_available_thinking_levels" });
		const levels = (reply?.success === true ? reply.data?.["levels"] : undefined) as string[] | undefined;
		if (!levels) {
			notify(`pi did not list its effort levels: ${reply?.error ?? "no answer"}`);
			return null;
		}
		return effortRows(levels, current?.thinking ?? "", (level) => {
			void (async () => {
				want(level);
				await keepEffort(sid);
				await refresh();
			})();
		});
	});

	// A change pi makes itself (a model switch clamping the effort, an
	// extension) reaches the chip as well as the ones made here.
	void onPiEvent((from, event) => {
		if (from === sid && event["type"] === "thinking_level_changed") void refresh();
	});
	paint();
	void piRunning(sid).then((running) => {
		if (running) void refresh();
	}, () => {});

	return {
		prepare: async () => {
			if (current && !staged) return;
			await ready();
		},
		carryTo: async (child) => {
			// The parent is asked what it runs, which a parent pi not started yet
			// cannot answer: started, as the send it is about to make would.
			if (!current) await ready();
			const pick = ownPick();
			if (pick) await apply(child, pick);
		},
		stageFor: (id) => {
			const pick = ownPick();
			if (!pick) return;
			try {
				localStorage.setItem(stageKey(id), JSON.stringify(pick));
			} catch {} // a storage that refuses costs the new conversation its pick, nothing more
		},
		chooseModel,
		chooseEffort,
		checkUpdates: update.ask,
		chip,
		onState: (listener) => void listeners.push(listener),
		addRow: (row) => void extraRows.push(row),
		forget: () => {
			current = null;
			paint();
		},
		reread: async () => void (await refresh()),
	};
}

/** What `localStorage` holds under `key`; `null` when nothing, or it cannot be read. */
function stored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** The pick staged for `id`, if one is waiting and readable. */
function readStaged(id: string): ModelPick | null {
	return stagedPick(stored(stageKey(id)));
}
