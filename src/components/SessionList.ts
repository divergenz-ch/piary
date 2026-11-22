// Direct port of zaitgeist scripts/web/pages/chat.tsx SessionList — htmx posts
// replaced by events (`session-new`, `session-select` { sid }), markup and
// classes taken over as-is. Row actions the component owns outright (rename,
// delete) are its own buttons; anything a host may or may not be able to do is
// announced instead — `session-prefetch`, `session-menu`.
import { Ellipsis, PencilLine, Trash2 } from "lucide";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { icon } from "../utils/icons.ts";

export interface ChannelSession {
	sid: string;
	n: number;
	mtime: number;
	label: string;
	channel: "web" | "tg";
}

@customElement("session-list")
export class SessionList extends LitElement {
	@property({ type: Array }) sessions: ChannelSession[] = [];
	@property({ type: Array }) streamingSids: string[] = [];
	@property({ type: Array }) draftSids: string[] = [];
	@property({ type: Array }) offlineSids: string[] = [];
	@property() currentSid = "";
	/** One `⋯` per row in place of its rename and delete buttons: the row's
	 *  actions are the host's menu, announced as `session-menu` (the same event
	 *  a right-click raises). Off by default. */
	@property({ type: Boolean }) actionsMenu = false;
	/** Row in inline-rename mode (native prompt/confirm would break focus mode). */
	@state() private editingSid: string | null = null;
	/** Row with delete armed: first click arms, the second deletes. Inline for
	 *  the same reason as rename — a native confirm() freezes the whole page. */
	@state() private confirmSid: string | null = null;
	/** Sid being dragged, while a reorder is in flight. */
	@state() private dragSid: string | null = null;
	/** Drop target: the row the line is drawn on, and which edge. */
	@state() private dropAt: { sid: string; after: boolean } | null = null;

	protected override createRenderRoot(): HTMLElement | DocumentFragment {
		return this;
	}

	protected override updated(changed: Map<string, unknown>) {
		if (changed.has("editingSid") && this.editingSid) this.querySelector<HTMLInputElement>(".session-rename")?.select();
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.style.display = "block";
	}

	#newSession() {
		this.dispatchEvent(new CustomEvent("session-new", { bubbles: true, composed: true }));
	}

	#select(sid: string) {
		this.dispatchEvent(new CustomEvent("session-select", { detail: { sid }, bubbles: true, composed: true }));
	}

	/**
	 * The pointer is on a row but the click has not happened yet.
	 *
	 * The host uses the gap to fetch that session's document, so the switch has
	 * nothing left to wait for. Announced rather than acted on: this component
	 * does not know what a session costs to open, and hosts that have nothing to
	 * prefetch simply do not listen.
	 */
	#prefetch(sid: string) {
		this.dispatchEvent(new CustomEvent("session-prefetch", { detail: { sid }, bubbles: true, composed: true }));
	}

	/**
	 * Right-click on a row — announced, not acted on.
	 *
	 * The host owns the popover, the same split `document-chat` uses for its
	 * block, segment and cell menus: this component does not know which row
	 * actions a host can offer, and a host that offers none simply does not
	 * listen and no menu opens. That is the whole reason this is an event and
	 * not a menu rendered here.
	 */
	#openMenu(session: ChannelSession, event: MouseEvent) {
		event.preventDefault();
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		// A context menu opened from the keyboard (the Menu key, Shift+F10 — the
		// row's label is a real button, so the browser fires this for those too)
		// reports 0,0. Anchoring to the row keeps the actions reachable without a
		// pointer, which is the only way to reach them at all from here.
		this.dispatchEvent(
			new CustomEvent("session-menu", {
				detail: { sid: session.sid, x: event.clientX || box.left, y: event.clientY || box.bottom },
				bubbles: true,
				composed: true,
			}),
		);
	}

	/** Opens `sid`'s inline rename: what a host's rename action does. */
	startRename(sid: string): void {
		this.editingSid = sid;
	}

	/** The `⋯`: the row's menu, anchored below the button. */
	#openMore(session: ChannelSession, event: MouseEvent) {
		event.stopPropagation();
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		this.dispatchEvent(
			new CustomEvent("session-menu", { detail: { sid: session.sid, x: box.left, y: box.bottom }, bubbles: true, composed: true }),
		);
	}

	#rename(session: ChannelSession, event: Event) {
		event.stopPropagation();
		this.editingSid = session.sid;
	}

	#commitRename(sid: string, value: string) {
		if (this.editingSid !== sid) return; // already committed or cancelled
		this.editingSid = null;
		this.dispatchEvent(
			new CustomEvent("session-rename", { detail: { sid, label: value.trim() }, bubbles: true, composed: true }),
		);
	}

	#deleteSession(session: ChannelSession, event: Event) {
		event.stopPropagation();
		if (this.confirmSid !== session.sid) {
			this.confirmSid = session.sid;
			return;
		}
		this.confirmSid = null;
		this.dispatchEvent(new CustomEvent("session-delete", { detail: { sid: session.sid }, bubbles: true, composed: true }));
	}

	/** Native HTML5 drag reorder: the hovered row's half under the pointer picks
	 * the insert edge, drawn as a line until the drop lands. */
	#dragOver(target: ChannelSession, event: DragEvent) {
		if (!this.dragSid) return;
		event.preventDefault();
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		this.dropAt = { sid: target.sid, after: event.clientY > box.top + box.height / 2 };
	}

	/** Commit the pending drop: splice the dragged row to the marked edge and
	 * tell the host the new order (`session-reorder` { sids }). */
	#dropRow() {
		const from = this.sessions.findIndex((s) => s.sid === this.dragSid);
		const over = this.sessions.findIndex((s) => s.sid === this.dropAt?.sid);
		const drop = this.dropAt;
		this.dragSid = null;
		this.dropAt = null;
		if (from < 0 || over < 0 || !drop) return;
		const next = [...this.sessions];
		const [moved] = next.splice(from, 1);
		if (!moved) return;
		const to = next.indexOf(this.sessions[over]!) + (drop.after ? 1 : 0);
		next.splice(to, 0, moved);
		this.sessions = next;
		this.dispatchEvent(
			new CustomEvent("session-reorder", {
				detail: { sids: next.map((s) => s.sid) },
				bubbles: true,
				composed: true,
			}),
		);
	}

	#statusFor(sid: string): "offline" | "streaming" | "draft" | "" {
		if (this.offlineSids.includes(sid)) return "offline";
		if (this.streamingSids.includes(sid)) return "streaming";
		if (this.draftSids.includes(sid)) return "draft";
		return "";
	}

	override render() {
		return html`
			<nav>
				<button class="new-session" @click=${this.#newSession}>New session</button>
				${this.sessions.map((s) => {
					const status = this.#statusFor(s.sid);
					return html`
						<div
							class="session-row ${s.sid === this.currentSid ? "active" : ""} ${s.sid === this.dragSid ? "dragging" : ""} ${
								this.dropAt?.sid === s.sid && s.sid !== this.dragSid ? (this.dropAt.after ? "drop-after" : "drop-before") : ""
							}"
							draggable=${this.editingSid === s.sid ? "false" : "true"}
							@dragstart=${() => {
								this.dragSid = s.sid;
							}}
							@dragover=${(event: DragEvent) => this.#dragOver(s, event)}
							@drop=${(event: DragEvent) => {
								event.preventDefault();
								this.#dropRow();
							}}
							@dragend=${() => this.#dropRow()}
							@contextmenu=${(event: MouseEvent) => this.#openMenu(s, event)}
							@pointerleave=${() => {
								if (this.confirmSid === s.sid) this.confirmSid = null;
							}}
						>
							${this.editingSid === s.sid
								? html`<input
										class="session-rename"
										.value=${s.label || s.sid}
										@click=${(event: Event) => event.stopPropagation()}
										@keydown=${(event: KeyboardEvent) => {
											if (event.key === "Enter") this.#commitRename(s.sid, (event.target as HTMLInputElement).value);
											else if (event.key === "Escape") this.editingSid = null;
										}}
										@blur=${() => {
											if (this.editingSid === s.sid) this.editingSid = null;
										}}
									/>`
								: html`<button
										class="session-item"
										title=${s.channel === "tg" ? `Telegram: ${s.label}` : s.label}
										@click=${() => this.#select(s.sid)}
										@pointerenter=${() => this.#prefetch(s.sid)}
										@focus=${() => this.#prefetch(s.sid)}
									>
										${status ? html`<span class="session-status ${status}" title=${status}></span>` : null}
										<span class="session-label">${s.channel === "tg" ? "✈ " : ""}${s.label || "untitled"}</span>
									</button>`}
							${this.actionsMenu
								? html`<button
										class="session-action session-more"
										title="Conversation actions"
										aria-label="Conversation actions"
										@click=${(event: MouseEvent) => this.#openMore(s, event)}
									>${icon(Ellipsis, "xs")}</button>`
								: html`<button class="session-action" title="Rename session" aria-label="Rename session" @click=${(event: Event) => this.#rename(s, event)}>${icon(PencilLine, "xs")}</button>
										<button
											class="session-action danger ${this.confirmSid === s.sid ? "confirm" : ""}"
											title=${this.confirmSid === s.sid ? "Click again to delete" : "Delete session"}
											aria-label="Delete session"
											@click=${(event: Event) => this.#deleteSession(s, event)}
										>${this.confirmSid === s.sid ? "delete?" : icon(Trash2, "xs")}</button>`}
						</div>
					`;
				})}
			</nav>
		`;
	}
}
