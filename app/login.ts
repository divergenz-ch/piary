// Signing in and out from a panel in the document, over pi's own login code
// (ADR 0034). pi's RPC mode has no login command, so Piary's extension carries
// one: the page sends `/piary-login` (or `/piary-logout`) to this window's pi,
// and every question pi's login asks arrives as a dialog this module draws —
// a provider list, a key field, a link to the provider's sign-in page, a device
// code, a field for a pasted code. pi writes and removes its own credentials;
// a typed key passes through here once and is kept nowhere.
//
// Five ways in: the `/login` row of the creation menu, the model menu's
// `Sign in…` row when pi lists no models and its `Sign out…` row when it lists
// some (`app/model.ts`), and, when a prompt was refused for want of any
// provider (`app/turn.ts`), an ask in the document and a red Sign in button
// beside the model chip, which blinks the chip with it until pi has a provider
// (ADR 0037). When a flow changes what pi is
// signed in with, this window's pi is stopped, so the next send starts one
// that reads it. The same goes for which pi runs at all, once the user
// chooses another (`app/pi-choice.ts`).

import { focusWindow, onPiEvent, openUrl, piSend, piStart } from "../src/bridge.ts";
import { cancelQuestion } from "./ask.ts";
import type { AppContext } from "./context.ts";
import { doneText, type LoginEvent, type LoginOffer, type LoginQuestion, loginNews, loginQuestion, offerNote, orderOffers } from "./login-flow.ts";
import { followPiChoice } from "./pi-choice.ts";
import type { ModelPicker } from "./picks.ts";

/** The commands Piary's extension registers (`pi-extension/login.ts`). */
const LOGIN_COMMAND = "piary-login";
const LOGOUT_COMMAND = "piary-logout";

/** Said when the user's own `pi-ui-views` predates the login commands
 *  (ADR 0034 §6): sending the command anyway would hand the model a prompt. */
const NO_COMMAND = "This pi's Piary extension cannot sign in from the app. Update the pi-ui-views package your pi settings install, or remove it so the app's own copy runs.";

/** What the page's other modules ask of sign-in. */
export interface Login {
	/** Opens the sign-in panel. */
	open(): void;
	/** Asks, in the document, whether to sign in, and raises the Sign in
	 *  button beside the model chip. */
	offer(): void;
	/** pi took a prompt, so it has a provider: the button goes. */
	found(): void;
	/** Opens the sign-out panel. */
	signOut(): void;
}

/** Builds an element with a class and, optionally, text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function button(text: string, className = ""): HTMLButtonElement {
	const node = el("button", className, text);
	node.type = "button";
	return node;
}

/** Once per window. `model.forget` repaints the chip after pi is stopped. */
export function mountLogin(host: Pick<AppContext, "chat" | "sid" | "turn" | "notify" | "busy">, model: Pick<ModelPicker, "forget" | "addRow" | "chip">): Login {
	const { chat, sid, turn, notify } = host;
	followPiChoice(host, model);

	/** Raised by a refusal pi gave for want of a provider; nothing stores it,
	 *  so a reload loses it and the next refused send raises it again. */
	const signInAlert = button("Sign in", "sign-in-alert");
	signInAlert.setAttribute("aria-label", "Sign in: pi has no provider");
	signInAlert.hidden = true;
	model.chip.prepend(signInAlert);
	const needs = (needed: boolean) => {
		signInAlert.hidden = !needed;
		model.chip.classList.toggle("model-chip--needs-sign-in", needed);
	};

	/** The panel while a flow runs, and the dialog it is waiting to answer. */
	let panel: HTMLElement | null = null;
	let waiting: string | null = null;
	/** The provider's own instructions — a link, a device code — kept on
	 *  screen while the flow asks for anything else. */
	let instruction: HTMLElement | null = null;
	let body: HTMLElement | null = null;
	/** The panel says something the flow's end must not take away: there was
	 *  nothing to sign out of. Closed by its own cancel. */
	let lingering = false;
	/** The flow sent the user to the browser: its end brings them back. */
	let inBrowser = false;

	const close = () => {
		chat.setAsk(null);
		// The canvas parks an ask's element rather than dropping it (app/ask.ts).
		panel?.remove();
		panel = body = instruction = null;
		lingering = false;
	};

	const answer = (requestId: string, value: Record<string, unknown> | null) => {
		if (waiting === requestId) waiting = null;
		const response = value === null ? { type: "extension_ui_response", id: requestId, cancelled: true } : { type: "extension_ui_response", id: requestId, value: JSON.stringify(value) };
		void piSend(sid, response).catch(() => {});
	};

	/** Cancel: a question pi is waiting on is answered as cancelled, which ends
	 *  the flow; one waiting on the browser ends when the browser does. */
	const cancel = () => {
		if (waiting) answer(waiting, null);
		close();
	};

	/** The panel, made the first time a flow has something to show. */
	const show = (title: string): HTMLElement => {
		if (!panel) {
			cancelQuestion();
			panel = el("div", "doc-ui-request doc-login");
			panel.addEventListener("keydown", (event) => {
				if (event.key === "Escape") cancel();
			});
			chat.setAsk(panel);
		}
		panel.replaceChildren(el("div", "doc-ui-request-title", title));
		if (instruction) panel.append(instruction);
		body = el("div", "doc-login-body");
		const leave = button("cancel", "doc-ui-request-cancel");
		leave.addEventListener("click", cancel);
		const row = el("div", "doc-ui-request-row");
		row.append(leave);
		panel.append(body, row);
		return body;
	};

	/** One row per way in, filtered by the search field. */
	const choose = (requestId: string, offers: LoginOffer[]) => {
		const into = show("Sign in");
		const search = el("input", "doc-ui-request-input doc-login-search");
		search.type = "search";
		search.placeholder = "Search providers";
		const list = el("div", "doc-login-list");
		const fill = () => {
			list.replaceChildren(
				...orderOffers(offers, search.value).map((offer) => {
					const row = button("", "doc-login-offer");
					row.append(el("span", "doc-login-name", offer.name), el("span", "doc-login-method", offer.label));
					if (offer.signedIn) row.append(el("span", "doc-login-status", "signed in"));
					const note = offerNote(offer);
					if (note) row.append(el("span", "doc-login-note", note));
					row.addEventListener("click", () => {
						answer(requestId, { providerId: offer.providerId, type: offer.type });
						show(`Signing in to ${offer.name}…`);
					});
					return row;
				}),
			);
		};
		search.addEventListener("input", fill);
		fill();
		into.append(search, list);
		requestAnimationFrame(() => search.focus());
	};

	/** What a provider's sign-in asks: a key, a pasted code, a pick. */
	const prompt = (requestId: string, question: Extract<LoginQuestion, { step: "prompt" }>) => {
		const into = show(`Sign in to ${question.provider}`);
		const asked = question.prompt;
		into.append(el("div", "doc-ui-request-message", asked.message));
		if (asked.type === "select") {
			const row = el("div", "doc-ui-request-row");
			for (const option of asked.options) {
				const pick = button(option.label);
				if (option.description) pick.title = option.description;
				pick.addEventListener("click", () => answer(requestId, { value: option.id }));
				row.append(pick);
			}
			into.append(row);
			return;
		}
		const field = el("input", "doc-ui-request-input");
		field.type = asked.type === "secret" ? "password" : "text";
		field.placeholder = asked.placeholder ?? "";
		field.autocomplete = "off";
		const send = button("continue");
		const submit = () => {
			if (!field.value) return;
			answer(requestId, { value: field.value });
			field.value = "";
			show(`Signing in to ${question.provider}…`);
		};
		send.addEventListener("click", submit);
		field.addEventListener("keydown", (event) => {
			if (event.key === "Enter") submit();
		});
		const row = el("div", "doc-ui-request-row");
		row.append(field, send);
		into.append(row);
		requestAnimationFrame(() => field.focus());
	};

	/** What pi has stored, to remove one. */
	const stored = (requestId: string, question: Extract<LoginQuestion, { step: "stored" }>) => {
		const into = show("Sign out");
		if (question.stored.length === 0) {
			into.append(el("div", "doc-ui-request-message", "pi has no sign-in stored. A key set in the environment is not pi's to remove: unset it where it is set."));
			answer(requestId, null);
			lingering = true;
			return;
		}
		const list = el("div", "doc-login-list");
		for (const login of question.stored) {
			const row = button("", "doc-login-offer");
			row.append(el("span", "doc-login-name", login.name), el("span", "doc-login-method", login.type === "oauth" ? "account" : "API key"));
			row.addEventListener("click", () => {
				answer(requestId, { providerId: login.providerId });
				show(`Signing out of ${login.name}…`);
			});
			list.append(row);
		}
		into.append(list);
	};

	/** A provider's instructions: its sign-in page, a device code, a note. */
	const event = (news: LoginEvent) => {
		if (news.type === "progress" || (news.type === "info" && !news.links?.length)) {
			if (body) body.replaceChildren(el("div", "doc-ui-request-message", news.message));
			return;
		}
		if (news.type === "auth_url" || news.type === "device_code") inBrowser = true;
		const box = el("div", "doc-login-instruction");
		if (news.type === "auth_url") {
			if (news.instructions) box.append(el("div", "doc-ui-request-message", news.instructions));
			const row = el("div", "doc-ui-request-row");
			const go = button("Open sign-in page");
			go.addEventListener("click", () => void openUrl(news.url).catch((error: unknown) => notify(`Could not open the browser: ${String(error)}`)));
			const copy = button("copy link");
			copy.addEventListener("click", () => void navigator.clipboard?.writeText(news.url).catch(() => {}));
			row.append(go, copy);
			box.append(row);
		} else if (news.type === "device_code") {
			box.append(el("div", "doc-ui-request-message", `Enter this code at ${news.verificationUri}`), el("div", "doc-login-code", news.userCode));
			const row = el("div", "doc-ui-request-row");
			const go = button("Open the page");
			go.addEventListener("click", () => void openUrl(news.verificationUri).catch(() => {}));
			row.append(go);
			box.append(row);
		} else {
			box.append(el("div", "doc-ui-request-message", news.message));
			for (const link of news.links ?? []) {
				const go = button(link.label ?? link.url);
				go.addEventListener("click", () => void openUrl(link.url).catch(() => {}));
				box.append(go);
			}
		}
		instruction = box;
		if (panel && body) body.before(box);
	};

	void onPiEvent((from, raw) => {
		if (from !== sid) return;
		const asked = loginQuestion(raw);
		if (asked) {
			waiting = asked.requestId;
			const { question } = asked;
			if (question.step === "choose") choose(asked.requestId, question.offers);
			else if (question.step === "prompt") prompt(asked.requestId, question);
			else stored(asked.requestId, question);
			return;
		}
		const news = loginNews(raw);
		if (!news) return;
		if (news.step === "event") {
			event(news.event);
			return;
		}
		waiting = null;
		if (!(lingering && news.cancelled)) close();
		// The browser has the user's attention: an ending they should see — signed
		// in, or why not — hands it back to the window that asked.
		if (inBrowser && !news.cancelled) void focusWindow().catch(() => {});
		inBrowser = false;
		const said = doneText(news);
		if (said) notify(said);
		if (news.ok) needs(false);
		if (news.ok)
			void turn.stopPi().then((stopped) => {
				if (stopped) model.forget();
			});
	});

	/** Starts a flow in this window's pi, after checking its extension has the
	 *  command: pi would hand an unknown one to the model as a prompt. */
	const run = async (command: string) => {
		if (turn.running) {
			notify("Wait for the answer to finish, then sign in.");
			return;
		}
		inBrowser = false;
		try {
			await piStart(sid);
			const listed = await piSend(sid, { type: "get_commands" });
			const commands = ((listed as { data?: { commands?: { name?: string }[] } } | undefined)?.data?.commands ?? []).map((c) => c.name);
			if (!commands.includes(command)) {
				notify(NO_COMMAND);
				return;
			}
			const sent = (await piSend(sid, { type: "prompt", message: `/${command}` })) as { success?: boolean; error?: string } | undefined;
			if (sent?.success === false) notify(`pi could not start the sign-in: ${sent.error ?? "no reason given"}`);
		} catch (error) {
			notify(`pi could not start the sign-in: ${error instanceof Error ? error.message : String(error)}`);
		}
	};

	const open = () => void run(LOGIN_COMMAND);
	const signOut = () => void run(LOGOUT_COMMAND);
	signInAlert.addEventListener("click", open);
	// pi answers with every provider it is signed in to, so a second one adds
	// models rather than replacing the first.
	model.addRow({ label: "Sign in to another provider…", title: "Adds a provider; the ones you are signed in to stay", needsProvider: true, run: open });
	model.addRow({ label: "Sign out…", title: "Signs out of a provider pi has stored a sign-in for", needsProvider: true, run: signOut });

	const offer = () => {
		needs(true);
		cancelQuestion();
		const ask = el("div", "doc-ui-request");
		const title = el("div", "doc-ui-request-title", "pi has no provider to answer with");
		const message = el("div", "doc-ui-request-message", "Sign in with an API key or an account, then send again.");
		const signIn = button("Sign in");
		const dismiss = button("cancel", "doc-ui-request-cancel");
		const row = el("div", "doc-ui-request-row");
		row.append(signIn, dismiss);
		ask.append(title, message, row);
		const done = () => {
			chat.setAsk(null);
			ask.remove();
		};
		signIn.addEventListener("click", () => {
			done();
			open();
		});
		dismiss.addEventListener("click", done);
		ask.addEventListener("keydown", (key) => {
			if (key.key === "Escape") done();
		});
		chat.setAsk(ask);
	};

	return { open, offer, found: () => needs(false), signOut };
}
