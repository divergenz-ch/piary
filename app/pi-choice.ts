// Which pi this window's conversation runs on follows the user's choice
// (ADR 0068). A pi is chosen for the app, in the Preferences window; the one
// already running here was started before the choice, so it is stopped once no
// turn runs, and the next send starts the one chosen.

import type { AppContext } from "./context.ts";
import type { ModelPicker } from "./picks.ts";
import { watchPreferences } from "./preferences.ts";

export function followPiChoice({ turn, busy }: Pick<AppContext, "turn" | "busy">, model: Pick<ModelPicker, "forget">): void {
	let chosen: string | null = null;
	let stale = false;
	const restart = async (): Promise<void> => {
		if (!stale || busy()) return;
		stale = false;
		// Another pi may list other models: the chip asks again.
		if (await turn.stopPi()) model.forget();
	};
	// A turn that was running when the choice changed has ended.
	turn.onChanged(() => void restart());
	watchPreferences((kept) => {
		// The first call is what was kept at boot, which no pi here predates.
		if (chosen !== null && chosen !== kept.piPath) stale = true;
		chosen = kept.piPath;
		void restart();
	});
}
