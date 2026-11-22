// Signing in and out from the Piary app's own panel (ADR 0034). pi's RPC mode
// has no login command, so this extension carries one: `/piary-login` runs
// pi's own login code (`ModelRuntime.login`, what pi's `/login` runs) and puts
// every question it asks through pi's extension UI channel, where the page
// draws it as a sign-in panel. pi writes its own credential file; the page sees
// a typed key once, on its way here, and keeps nothing. `/piary-logout` lists
// what pi has stored and removes the one picked.
//
// The handler starts the flow and returns: pi answers the `prompt` that ran the
// command only once its handler is done, and a sign-in in a browser takes
// longer than the app waits for an answer. The flow then runs on, its
// questions arriving as `input` dialogs titled `LOGIN_REQUEST` and its news as
// notices prefixed `LOGIN_NOTE`; the last one is `done`.
//
// The registration below is not unit-tested: it needs pi's runtime. The page's
// half is `app/login-flow.ts`, and the two titles are held equal by
// tests/contract/extension-copies.test.ts.
import { type ExtensionAPI, type ExtensionCommandContext, getAgentDir, ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { promptOutcome } from "./login-answer.ts";

/** The question the page answers (`app/login-flow.ts` holds the same string). */
const LOGIN_REQUEST = "piary:login";

/** The prefix of a notice the page reads as the flow's news (same file). */
const LOGIN_NOTE = "piary:login ";

type Ui = ExtensionCommandContext["ui"];

/** Asks the page one step and reads its JSON answer; `undefined` is a cancel.
 *  No timeout: a person is reading, and a sign-in in a browser takes minutes. */
async function ask(ui: Ui, step: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown> | undefined> {
	const raw = await ui.input(LOGIN_REQUEST, JSON.stringify(step), signal ? { signal } : undefined);
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

const note = (ui: Ui, step: Record<string, unknown>) => ui.notify(`${LOGIN_NOTE}${JSON.stringify(step)}`, "info");

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every way in pi offers, one row per provider and method, with what is
 *  already configured — the list pi's own `/login` shows. */
function offers(runtime: ModelRuntime) {
	return runtime.getProviders().flatMap((provider) => {
		const status = runtime.getProviderAuthStatus(provider.id);
		const signedIn = status.configured ? (runtime.isUsingOAuth(provider.id) ? "oauth" : "api_key") : null;
		const rows = [];
		if (provider.auth.oauth)
			rows.push({
				providerId: provider.id,
				name: provider.name,
				type: "oauth",
				label: provider.auth.oauth.loginLabel ?? "Sign in with an account",
				subscription: provider.auth.oauth.isSubscription === true,
				signedIn,
			});
		if (provider.auth.apiKey?.login)
			rows.push({ providerId: provider.id, name: provider.name, type: "api_key", label: "API key", subscription: false, signedIn });
		return rows;
	});
}

async function signIn(ctx: ExtensionCommandContext): Promise<void> {
	const runtime = await ModelRuntime.create();
	const picked = await ask(ctx.ui, { step: "choose", offers: offers(runtime) });
	if (!picked || typeof picked["providerId"] !== "string" || (picked["type"] !== "oauth" && picked["type"] !== "api_key")) {
		note(ctx.ui, { step: "done", ok: false, cancelled: true });
		return;
	}
	const providerId = picked["providerId"];
	const name = runtime.getProvider(providerId)?.name ?? providerId;
	const abort = new AbortController();
	const settings = SettingsManager.create(ctx.cwd, getAgentDir());
	try {
		await runtime.login(
			providerId,
			picked["type"],
			{
				signal: abort.signal,
				prompt: async (prompt) => {
					// A provider may stop asking on its own — a browser sign-in that
					// lands while a pasted code is still asked for — and withdraws the
					// question through `signal`.
					const { signal, ...shown } = prompt;
					const answer = await ask(ctx.ui, { step: "prompt", provider: name, prompt: shown }, signal);
					const outcome = promptOutcome(answer, signal?.aborted === true);
					if ("value" in outcome) return outcome.value;
					// Withdrawn: pi has its answer another way and reads no more of this one.
					if ("withdrawn" in outcome) throw new Error("withdrawn");
					abort.abort();
					throw new Error("Login cancelled");
				},
				notify: (event) => note(ctx.ui, { step: "event", event }),
			},
			{ getDeviceId: () => settings.getOrCreateDeviceId() },
		);
		note(ctx.ui, { step: "done", ok: true, provider: name });
	} catch (error) {
		const said = message(error);
		note(ctx.ui, { step: "done", ok: false, cancelled: said === "Login cancelled", provider: name, error: said });
	}
}

async function signOut(ctx: ExtensionCommandContext): Promise<void> {
	const runtime = await ModelRuntime.create();
	const stored = (await runtime.listCredentials()).map(({ providerId, type }) => ({
		providerId,
		type,
		name: runtime.getProvider(providerId)?.name ?? providerId,
	}));
	const picked = await ask(ctx.ui, { step: "stored", stored });
	if (!picked || typeof picked["providerId"] !== "string") {
		note(ctx.ui, { step: "done", ok: false, cancelled: true });
		return;
	}
	const name = runtime.getProvider(picked["providerId"])?.name ?? picked["providerId"];
	try {
		await runtime.logout(picked["providerId"]);
		note(ctx.ui, { step: "done", ok: true, provider: name, signedOut: true });
	} catch (error) {
		note(ctx.ui, { step: "done", ok: false, provider: name, error: message(error), signedOut: false });
	}
}

/** Runs `flow` past the handler's return, and reports a failure it did not. */
function detached(ctx: ExtensionCommandContext, flow: (ctx: ExtensionCommandContext) => Promise<void>): void {
	void flow(ctx).catch((error: unknown) => note(ctx.ui, { step: "done", ok: false, error: message(error) }));
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("piary-login", {
		description: "Sign in to a provider from the Piary app's panel",
		handler: async (_args, ctx) => detached(ctx, signIn),
	});
	pi.registerCommand("piary-logout", {
		description: "Sign out of a provider from the Piary app's panel",
		handler: async (_args, ctx) => detached(ctx, signOut),
	});
}
