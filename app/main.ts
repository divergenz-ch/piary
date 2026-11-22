// The app's entry: the canvas in a native window, over the Rust document store
// and one resident pi per session (`src-tauri/src/session.rs`).
//
// It mounts the stored document, saves every edit back to the store, takes an
// outside edit in place, and hands the caret's prompt to pi through `Turn`, so
// the answer lands in the document. Terminals open from the page; capture is
// reached only by the `?probe=1` smoke suite (app/probe.ts); app/model.ts picks the model.

// First, so an import-time throw in any module below is already reaching
// stdout. WKWebView's console does not (src/forward-console.ts).
import "../src/forward-console.ts";

// Imported rather than linked from `index.html`: a `<link>` to a file above
// Vite's root resolves in a build but not on the dev server, which answers it
// with the page itself — so `pnpm app` and the page-layer specs ran unstyled.
import "../src/styles/styles.css";

import { exitFlushed, onExitFlush } from "../src/bridge.ts";
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import "../src/components/DocumentChat.ts";
// Registers the `terminal` live view (ADR 0013).
import "../src/components/TerminalView.ts";
import { attachmentHandlers, serveFiles } from "./attachments.ts";
import { resolveDocument } from "./boot.ts";
import { answerCanvas, composeHost, notCarried } from "./canvas-events.ts";
import { cellFailureHandlers } from "./cell-reports.ts";
import { createCellState } from "./cell-state.ts";
import { cellHandlers } from "./cells.ts";
import type { AppContext } from "./context.ts";
import { mountConversations } from "./conversations.ts";
import { DocumentSync } from "./document-sync.ts";
import { createFace } from "./face/index.ts";
import { mountFocus } from "./focus.ts";
import { keepFolds } from "./folds.ts";
import { setupCommands } from "./commands.ts";
import { mountLogin } from "./login.ts";
import { menuHandlers } from "./menus.ts";
import { mountModelPicker } from "./model.ts";
import { mountOnboarding } from "./onboarding.ts";
import { runProbe } from "./probe.ts";
import { mountRail } from "./rail.ts";
import { createSend } from "./send.ts";
import { createStatus } from "./status.ts";
import { createSubsessions } from "./subsessions.ts";
import { setupSwitching } from "./switching.ts";
import { setupTerminals, terminalHandlers } from "./terminals.ts";
import { Turn } from "./turn.ts";
import { mountUsage } from "./usage.ts";

const chat = document.createElement("document-chat") as DocumentChat;
const params = new URL(location.href).searchParams;
// Which document this window shows, read before the canvas mounts (ADR 0018 §2).
const { sid, stored, initial, tour } = await resolveDocument(params);
serveFiles(chat); // before the document, so its first paint draws attachments
chat.setDocument(initial);
// Right after `setDocument`, which resets the canvas's wait for kept cell state.
const cellState = createCellState({ chat, sid });
void cellState.restore();
document.getElementById("app")!.append(chat);

// The one place a notice reaches the user (ADR 0011).
const status = createStatus(document.getElementById("status")!, document.getElementById("status-dismiss")!);
const { notify } = status;
const model = mountModelPicker({ sid, notify, signIn: () => login.open() });
const face = createFace(chat, sid);
const turn = new Turn(sid, { chat, notify, face, cellState: cellState.latest, prepare: model.prepare, restarted: model.reread, offerSignIn: () => login.offer(), promptTaken: () => login.found() });

// The document and the store, kept in step both ways (ADR 0018).
const sync = new DocumentSync({ sid, chat, turn, status, stored, initial });
sync.watch();

const subsessions = createSubsessions({ chat, carry: model.carryTo });
const send = createSend({ turn, notify, divert: subsessions.divert });

// What the feature modules are handed, each taking only what it uses.
const ctx: AppContext = { chat, sid, turn, notify, busy: () => turn.running || chat.streaming, sendPrompt: send.sendPrompt };
const login = mountLogin(ctx, model);
const rail = mountRail(ctx, { sync, turn });
mountUsage(ctx, model, subsessions);

// Every event the canvas raises, answered or owed (app/canvas-events.ts). The
// compiler refuses a table that forgets one, and `composeHost` one that answers
// an event twice (ADR 0024).
answerCanvas(
	chat,
	composeHost(notCarried, send.handlers(), sync.handlers(), cellHandlers(ctx), menuHandlers(ctx, face.rows), keepFolds(ctx, { sync }), rail.handlers(), cellState.handlers(), attachmentHandlers(ctx), cellFailureHandlers(ctx), terminalHandlers(ctx), subsessions.handlers(), face.mount(ctx, model)),
);
void setupTerminals(ctx, model);
void subsessions.refreshChildren(initial);
void setupSwitching(ctx, sync);
mountConversations(ctx, model);
// The tour last, over everything mounted above it (ADR 0038).
setupCommands(ctx, sync, model, mountFocus(), mountOnboarding(ctx, { tour, chip: model.chip, keep: (md) => sync.save(md) }).held, login, face);

// The host is closing this window or quitting (ADR 0019 §2, steps 2–3). The
// turn ends first, because it writes into the same buffer: a flush taken while
// pi still answers is half an answer, and whatever the abort finalizes would
// land in a buffer nothing saves. The answer goes back whatever the write did —
// the host is bounded either way, and a failed write is already on the status
// line.
void onExitFlush((request) => {
	void turn
		.end(request.turnBoundMs)
		.then(() => sync.save(chat.getDocument()))
		.finally(() => void exitFlushed());
});

if (params.has("probe")) {
	void runProbe({ chat, turn, start: send.start, params });
}
