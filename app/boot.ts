// Which document a window shows, decided in one place, before the canvas
// mounts.
//
// The main window shows `welcome`, and on a first run that is the tour. A document's own window is told its id by
// `?id=` (`windows::url_for` in Rust): one window per document. `?doc=` is the
// test and harness seam — literal content, under the `scratch` session.

import { docsRead } from "../src/bridge.ts";
import { emptyDocument, rebindDocument } from "../src/document/format.ts";
import { transcriptDocument } from "./history.ts";
import { TOUR } from "./tour.ts";

// `alert` and `confirm` as this webview has always answered them: nothing
// shown, and a `confirm` that says no. The dialog plugin (ADR 0049) replaces
// both at document start with calls to commands the page is not granted, which
// makes `confirm` a rejected promise — truthy, so a cell asking "are you sure?"
// would read a yes nobody gave.
window.alert = () => {};
window.confirm = () => false;

/** How this window's tour begins: behind the splash (a first run), walked at
 *  once (a fresh copy from Help → Welcome), or not at all. */
export type TourStart = "splash" | "walk" | null;

/** The document this window shows: its session, what the store held, and what
 *  the canvas opens on. */
export async function resolveDocument(params: URLSearchParams): Promise<{ sid: string; stored: string | null; initial: string; tour: TourStart }> {
	// The session this window's document belongs to. One per document, so
	// reopening one resumes rather than starting fresh (ADR 0002: a document is
	// rebuilt into a session).
	const seeded = params.get("doc");
	const id = params.get("id");
	const sid = seeded !== null ? "scratch" : (id ?? "welcome");

	// `?doc=` is left alone — a spec that seeds a document means that document,
	// not whatever this window saved last. It is applied before the first paint,
	// so a spec asserting the initial render does not have to go through a
	// mutation.
	if (seeded !== null) return { sid, stored: null, initial: seeded, tour: null };

	// The stored document is the base, never a candidate (ADR 0018 §2): it is
	// read BEFORE the canvas is mounted, so there is no editor to type into until
	// the conversation that exists is in it. Mounting a welcome first and
	// swapping the stored text in later would race the reader's hands: typing in
	// the first frames would leave seed-plus-typing in the buffer, and the next
	// save would write it over the stored conversation. `docs_read` is one local
	// file read over IPC, so the window waits on it for less than the page took
	// to load. A store that cannot be read is not a reason to show nothing.
	const stored = (await docsRead(sid).catch(() => null)) ?? null;
	// A tour Help → Welcome wrote and nobody has touched yet is walked (ADR 0038).
	if (stored !== null) return { sid, stored, initial: stored, tour: id !== null && stored === rebindDocument(TOUR, sid) ? "walk" : null };
	// The main window with nothing stored: a first run, which opens on the tour
	// behind its splash (ADR 0038).
	if (id === null) return { sid, stored, initial: TOUR, tour: "splash" };

	// A document's window with no file behind it: a session pi knows (one an
	// earlier Piary started) renders from its transcript; one pi does not know
	// opens empty.
	const derived = await transcriptDocument(sid).catch(() => null);
	return { sid, stored, initial: derived ?? emptyDocument(sid), tour: null };
}
