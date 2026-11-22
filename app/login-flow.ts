// What Piary's login command says to the page, and how the page reads it
// (ADR 0034). `pi-extension/login.ts` runs pi's own login code and puts each
// question it asks into an `input` dialog titled `LOGIN_REQUEST`, each piece
// of news into a notice prefixed `LOGIN_NOTE`; this turns those into steps the
// sign-in panel draws, and orders the provider list it shows.
//
// Pure — no DOM, no IPC — so the suite runs it from source.

/** The dialog title the login command asks under (`pi-extension/login.ts`
 *  holds the same string). */
export const LOGIN_REQUEST = "piary:login";

/** The prefix of a notice that is the login command's news (same file). */
export const LOGIN_NOTE = "piary:login ";

/** One way in pi offers: a provider and a method. */
export interface LoginOffer {
	providerId: string;
	name: string;
	type: "oauth" | "api_key";
	/** pi's own words for the method, e.g. "Sign in with ChatGPT". */
	label: string;
	subscription: boolean;
	/** How pi is configured for this provider now, if it is. */
	signedIn: "oauth" | "api_key" | null;
}

/** A credential pi has stored, which sign-out can remove. */
export interface StoredLogin {
	providerId: string;
	name: string;
	type: string;
}

/** pi-ai's `AuthPrompt`, as the command passes it on. */
export type LoginPrompt =
	| { type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
	| { type: "select"; message: string; options: readonly { id: string; label: string; description?: string }[] };

/** pi-ai's `AuthEvent`. */
export type LoginEvent =
	| { type: "info"; message: string; links?: readonly { url: string; label?: string }[] }
	| { type: "auth_url"; url: string; instructions?: string }
	| { type: "device_code"; userCode: string; verificationUri: string }
	| { type: "progress"; message: string };

/** A question the command is waiting on. */
export type LoginQuestion =
	| { step: "choose"; offers: LoginOffer[] }
	| { step: "prompt"; provider: string; prompt: LoginPrompt }
	| { step: "stored"; stored: StoredLogin[] };

/** News from the command; `done` is the last. */
export type LoginNews =
	| { step: "event"; event: LoginEvent }
	| { step: "done"; ok: boolean; cancelled?: boolean; provider?: string; error?: string; signedOut?: boolean };

const parse = (raw: unknown): Record<string, unknown> | null => {
	try {
		const value = JSON.parse(String(raw ?? "")) as unknown;
		return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
	} catch {
		return null;
	}
};

/** The question an event asks, or null for an event that is not one. */
export function loginQuestion(event: Record<string, unknown>): { requestId: string; question: LoginQuestion } | null {
	if (event["type"] !== "extension_ui_request" || event["method"] !== "input" || event["title"] !== LOGIN_REQUEST) return null;
	const requestId = event["id"];
	const step = parse(event["placeholder"]);
	if (typeof requestId !== "string" || !step) return null;
	if (step["step"] === "choose" && Array.isArray(step["offers"])) return { requestId, question: { step: "choose", offers: step["offers"] as LoginOffer[] } };
	if (step["step"] === "stored" && Array.isArray(step["stored"])) return { requestId, question: { step: "stored", stored: step["stored"] as StoredLogin[] } };
	if (step["step"] === "prompt" && step["prompt"] && typeof step["prompt"] === "object")
		return { requestId, question: { step: "prompt", provider: String(step["provider"] ?? ""), prompt: step["prompt"] as LoginPrompt } };
	return null;
}

/** The news an event carries, or null for an event that is not the command's. */
export function loginNews(event: Record<string, unknown>): LoginNews | null {
	if (event["type"] !== "extension_ui_request" || event["method"] !== "notify") return null;
	const message = event["message"];
	if (typeof message !== "string" || !message.startsWith(LOGIN_NOTE)) return null;
	const step = parse(message.slice(LOGIN_NOTE.length));
	if (step?.["step"] === "event" && step["event"] && typeof step["event"] === "object") return { step: "event", event: step["event"] as LoginEvent };
	if (step?.["step"] === "done") return step as LoginNews;
	return null;
}

/** Providers most people sign in with, in the order the panel lists them
 *  before the rest; pi offers dozens, and these are what a first look needs. */
const COMMON = ["anthropic", "openai", "openai-codex", "google", "github-copilot", "openrouter"];

/**
 * The panel's rows: what is signed in first, then the common providers, then
 * the rest by name — each provider's account sign-in before its API key — and
 * only rows whose provider or method name holds `filter`.
 */
export function orderOffers(offers: readonly LoginOffer[], filter = ""): LoginOffer[] {
	const needle = filter.trim().toLowerCase();
	const rank = (o: LoginOffer) => {
		const common = COMMON.indexOf(o.providerId);
		return o.signedIn ? 0 : common >= 0 ? 1 + common : 1 + COMMON.length;
	};
	return offers
		.filter((o) => !needle || `${o.name} ${o.providerId} ${o.label}`.toLowerCase().includes(needle))
		.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || (a.type === "oauth" ? -1 : 1) - (b.type === "oauth" ? -1 : 1));
}

/**
 * What a provider's row says before the user picks it, or null. Anthropic
 * bills a Claude subscription used from a third-party app — Piary is one — to
 * extra usage rather than the plan's limits, and refuses every request without
 * it; the user learns that here, not from a refused prompt after signing in.
 */
export function offerNote(offer: LoginOffer): string | null {
	if (offer.providerId === "anthropic" && offer.type === "oauth")
		return "Piary is a third-party app: Anthropic bills a Claude plan used here to extra usage, not your plan's limits. Turn it on at claude.ai/settings/usage, or use an API key.";
	return null;
}

/** What a finished flow says to the user. */
export function doneText(done: Extract<LoginNews, { step: "done" }>): string {
	if (done.cancelled) return "";
	const provider = done.provider ?? "the provider";
	if (!done.ok) return `Could not ${done.signedOut === undefined ? "sign in to" : "sign out of"} ${provider}: ${done.error ?? "pi did not say why"}`;
	return done.signedOut ? `Signed out of ${provider}.` : `Signed in to ${provider}. Send again to use it.`;
}
