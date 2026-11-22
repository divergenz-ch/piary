// The notice that a newer Piary exists: a pill in the model chip, left of the
// model, and the check behind it (ADR 0064).
//
// Rust gives one window at a time the turn to ask (`update_claim`), so the
// app makes one request an hour however many windows it has, and none with
// the preference off. The window with the turn asks GitHub for the newest
// release and hands Rust the tag it read; every window then hears it
// (`update-latest`) and draws the same pill. What is announced, and where the
// button goes, are rules (`update-check.ts`).
//
// A check that could not be made, or was refused, is written to the log and
// shown nowhere: it is no failure of anything the user asked for. Help →
// Check for Updates… is the user asking: that check is made at once, whatever
// the hour and the preference say, and its outcome is said on the status line
// either way.

import { logLine, onUpdateLatest, openUrl, preferencesWrite, updateClaim, updateFound, updateState } from "../src/bridge.ts";
import { sender } from "../src/console-line.ts";
import { openMenu } from "./menu.ts";
import { preferences, watchPreferences } from "./preferences.ts";
import "./update.css";
import { announced, LATEST_RELEASE, latestTag, releasePage } from "./update-check.ts";

/** How often a window asks Rust for the turn. Rust grants one an hour for
 *  the whole app (`update::CHECK_EVERY`); asking it more often than that is a
 *  local call, and keeps the check on the hour whichever windows are open. */
const ASK_EVERY_MS = 5 * 60_000;

/** How long GitHub has to answer before the check is given up until the
 *  next turn. */
const ANSWER_BOUND_MS = 15_000;

/** Never fails its caller: a log that cannot be written costs only the log. */
const log = sender(logLine);

/** GitHub's answer to "what is the newest release", as text. */
async function askGithub(): Promise<string> {
	const response = await fetch(LATEST_RELEASE, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(ANSWER_BOUND_MS) });
	if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
	return response.text();
}

/** Puts the pill in `chip`, before what it holds, and keeps it true. `notify`
 *  says what the pill's own menu could not do, and what a check the user asked
 *  for found. `ask` is that check. */
export function mountUpdate(chip: HTMLElement, notify: (message: string) => void): { ask(): void } {
	const pill = document.createElement("button");
	pill.type = "button";
	pill.className = "update-pill";
	pill.setAttribute("aria-haspopup", "menu");
	pill.hidden = true;
	chip.prepend(pill);

	/** This app's version; empty until Rust has said it, and nothing is
	 *  announced against a version not known. */
	let current = "";
	let latest: string | null = null;

	/** Whether what the user keeps has been read: until then a version they
	 *  dismissed, or a check they switched off, is not known to be either. */
	let kept = false;

	/** The version a check the user asked for found: announced in this window
	 *  with the check off or the version dismissed, until it is dismissed here. */
	let askedFor: string | null = null;

	const shown = () => {
		if (!kept) return null;
		const facts = { current, latest, check: preferences().updateCheck, dismissed: preferences().updateDismissed };
		return announced(facts) ?? (askedFor !== null && askedFor === announced({ ...facts, check: true, dismissed: "" }) ? askedFor : null);
	};

	const paint = () => {
		const version = shown();
		pill.hidden = version === null;
		if (version === null) return;
		pill.textContent = `Update ${version}`;
		pill.title = `Piary ${version} is available`;
		pill.setAttribute("aria-label", pill.title);
	};

	pill.addEventListener("click", () => {
		const version = shown();
		const page = version && releasePage(version);
		if (!version || !page) return;
		const box = pill.getBoundingClientRect();
		openMenu(
			box.left,
			box.top,
			[
				{ note: `Piary ${version} is available. This is ${current}.` },
				{ label: "Open the download page", run: () => void openUrl(page).catch((error: unknown) => notify(`The download page could not be opened: ${String(error)}`)) },
				{
					label: "Dismiss this version",
					title: "This version is not announced again; the next one is",
					run: () =>
						void preferencesWrite({ ...preferences(), updateDismissed: version }).then(() => {
							askedFor = null;
							paint();
						}).catch((error: unknown) => notify(`The notice could not be dismissed: ${String(error)}`)),
				},
			],
			{ above: true },
		);
	});

	/** Asks for the turn, and with it asks for the newest release. `asked` is
	 *  the user's own check: answers the tag read, or throws why none was. */
	const lookUp = async (asked: boolean): Promise<string | null> => {
		const source = await updateClaim(asked).catch(() => null);
		if (!source || source.kind === "none") return null;
		const answer = source.kind === "script" ? source.answer : await askGithub();
		const tag = latestTag(answer);
		if (tag === null) throw new Error("the answer names no released version");
		await updateFound(tag);
		return tag;
	};

	const check = async (): Promise<void> => {
		// A first run's splash, or the tour walking the window
		// (`app/onboarding.ts`): nothing it did not ask for is started under it.
		if (document.querySelector(".splash") || document.body.classList.contains("coaching")) return;
		await lookUp(false).catch((error: unknown) => log("update", [`no newer version was looked up: ${error instanceof Error ? error.message : String(error)}`]));
	};

	const ask = async (): Promise<void> => {
		try {
			const tag = await lookUp(true);
			if (tag === null) throw new Error("this run has nowhere to ask");
			latest = tag;
			askedFor = announced({ current, latest, check: true, dismissed: "" });
			paint();
			notify(askedFor === null ? `Piary ${current} is the newest version.` : `Piary ${askedFor} is available. This is ${current}.`);
		} catch (error) {
			notify(`Could not check for a newer version: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	void onUpdateLatest((tag) => {
		latest = tag;
		paint();
	}).catch(() => {});
	void updateState().then((state) => {
		if (!state) return;
		current = state.current;
		// A tag heard while this was asked is the newer of the two.
		latest ??= state.latest;
		paint();
	}, () => {});
	// Its first call is this window's check at launch; each one after is a
	// preference changed, the check switched on among them.
	watchPreferences(() => {
		kept = true;
		paint();
		void check();
	});
	setInterval(() => void check(), ASK_EVERY_MS);
	return { ask: () => void ask() };
}
