// The browser-harness entry: the REAL <document-chat> in a real browser engine,
// with nothing behind it. It is what `pnpm test:e2e` drives (docs/TEST_ARCHITECTURE.md
// L2.5) and the layer that can see what jsdom cannot — layout, focus, and the
// engine's own behaviour, because `tests/helpers/editor.ts` stubs every client
// rect to zeros.
//
// Dev-only: the product is the app (`app/`), so none of this ships. Nothing is
// behind the page on purpose — a send goes nowhere, which keeps a spec's result
// a fact about the view rather than about a session.
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import "../src/components/DocumentChat.ts";
// Registers the `terminal` live view. The page under test is the real one, so what
// the specs drive has to be registered the same way the app registers it.
import "../src/components/TerminalView.ts";

/** The seam a spec drives the page through. Assertions still go through roles
 *  and visible text; this exists for the few things with no visible surface —
 *  seeding a document, and reading back what the component holds. */
export interface HarnessWindow {
	setDocument(md: string): void;
	getDocument(): string;
	chat: DocumentChat;
}

const chat = document.createElement("document-chat") as DocumentChat;
document.getElementById("app")!.append(chat);

// `?doc=` seeds the buffer before the first paint, so a spec that cares about
// the initial render does not have to assert through a mutation.
const seeded = new URL(location.href).searchParams.get("doc");
chat.setDocument(seeded ?? "");

(globalThis as unknown as { __harness: HarnessWindow }).__harness = {
	setDocument: (md: string) => chat.setDocument(md),
	getDocument: () => chat.getDocument(),
	chat,
};
