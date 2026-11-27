// The app's own smoke suite, run in the real window with `?probe=1`.
//
// What needs the real shell and nothing a cheaper layer can assert: the
// document store across the IPC boundary, a real PTY, the capture helper's
// lifetime, the window's overlay primitives, and a real pi on its wire. It
// reports through Rust and exits with the verdict (`report`), so a run needs no
// human reading it. It ships in the app bundle because it must run in the real
// window; it is its own module so the entry stays assembly only (ADR 0024).

import {
	attachmentsStore,
	captureRunning,
	captureSend,
	captureStart,
	captureStop,
	docsList,
	docsRead,
	docsWrite,
	inApp,
	onCapture,
	onDocChanged,
	onMenu,
	onPiEvent,
	onPtyData,
	onPtyExit,
	overlaySupport,
	piRunning,
	piSend,
	piSessions,
	piStart,
	piStop,
	piWhich,
	ptyClose,
	ptyOpen,
	ptyResize,
	ptyWrite,
	rememberWindow,
	report,
	type Report,
	windowGeometry,
} from "../src/bridge.ts";
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import { serializeFile } from "../src/document/format.ts";
import { syncHistory } from "./history.ts";
import type { Turn } from "./turn.ts";

/** What the suite reads from the page it runs in. */
export interface ProbeDeps {
	chat: DocumentChat;
	turn: Turn;
	/** Opens the page's session, as its first send does. */
	start: () => Promise<void>;
	/** The page's query: `?prompt=` adds the one check that costs a model call. */
	params: URLSearchParams;
}

/**
 * Polls until `condition` holds, or gives up.
 *
 * A fixed delay would encode this machine's speed into the result; a condition
 * either becomes true or the timeout is a real failure.
 */
function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<boolean> {
	return new Promise((resolve) => {
		const started = Date.now();
		const tick = () => {
			if (condition()) return resolve(true);
			if (Date.now() - started > timeoutMs) return resolve(false);
			setTimeout(tick, 50);
		};
		tick();
	});
}

/**
 * The shell's own smoke suite, run with `?probe=1`.
 *
 * It reports through Rust and exits with the verdict, which is how a test that
 * needs the real window answers without a human reading it. Deliberately
 * small: what needs the real shell and nothing a cheaper layer can assert.
 */
export async function runProbe({ chat, turn, start, params }: ProbeDeps): Promise<void> {
	const reports: Report[] = [];
	// `null`, not `undefined`: the wire type is generated from Rust's
	// `Option<String>` (src-tauri/src/wire.rs), and serde reads a missing field
	// as null. Writing `undefined` would drop the key and ts-rs is what caught
	// it.
	const check = (name: string, passed: boolean, detail?: string) =>
		reports.push({ name, passed, detail: detail ?? null });

	check("the page is running inside the app", inApp());

	// The canvas rendered the seeded document. CodeMirror draws its own lines,
	// so this is the floor for every later phase.
	//
	// Waited for rather than asserted straight away: the element renders on
	// Lit's update cycle and CodeMirror measures after that, so a check on the
	// same turn as the append sees an empty editor and reports the app broken.
	const rendered = await waitFor(() => chat.querySelectorAll(".cm-line").length > 0);
	const lines = chat.querySelectorAll(".cm-line").length;
	check("the canvas renders the document", rendered, `${lines} lines`);
	check("the document round-trips", chat.getDocument().includes("# Piary"));

	// The document store, through the real IPC boundary. A scratch id, so a
	// probe run never touches a conversation someone cares about.
	const id = `probe-${Date.now()}`;
	check("a document that was never written reads as null", (await docsRead(id)) === null);

	const body = "# Written by the probe\n\nProse.\n";
	await docsWrite(id, body);
	check("a written document reads back byte-for-byte", (await docsRead(id)) === body);
	check("a written document appears in the listing", (await docsList()).includes(id));

	// The watcher's report crosses into the page. That is the half no other
	// layer can see: notify's event has to cross a real thread boundary into a
	// real webview. It is only the event — this listener is the probe's own, so
	// what the PAGE does with a report is not proved here but by the outside-edit
	// rows of e2e/flows.spec.ts, through the page's own subscription.
	const changed = new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => resolve(false), 5_000);
		void onDocChanged((changedId) => {
			if (changedId !== id) return;
			clearTimeout(timer);
			resolve(true);
		});
	});
	// Written through the same door an external editor would use — the page
	// cannot reach the filesystem itself, so this is the closest it gets, and
	// it still proves the event travels.
	await docsWrite(id, `${body}\nAppended.\n`);
	check("the watcher's report reaches the page", await changed);

	// A real terminal, end to end: the PTY is in Rust, the bytes arrive as
	// events, and the shell has to believe it is talking to a human.
	const term = `probe-term-${Date.now()}`;
	let output = "";
	await onPtyData((id, data) => {
		if (id === term) output += data;
	});
	const exited = new Promise<number | null>((resolve) => {
		const timer = setTimeout(() => resolve(null), 8_000);
		void onPtyExit((id, code) => {
			if (id !== term) return;
			clearTimeout(timer);
			resolve(code);
		});
	});

	await ptyOpen({ sid: "probe-session", termId: term, command: "/bin/sh", pi: false, args: [], cwd: "/tmp", cols: 80, rows: 24 });
	// isatty is the assertion that distinguishes a terminal from a pipe, which
	// is the whole reason this is a PTY (ADR 0013).
	await ptyWrite("probe-session", term, "test -t 0 && echo TTY-OK\n");
	check("the shell sees a tty", await waitFor(() => output.includes("TTY-OK"), 8_000));

	await ptyResize("probe-session", term, 100, 30);
	await ptyWrite("probe-session", term, "echo W=$(tput cols)\n");
	check("a resize reaches the program", await waitFor(() => output.includes("W=100"), 8_000));

	// A terminal answers only the session that opened it: an unknown terminal
	// gets the same refusal as someone else's, so the error cannot be used to
	// probe for existence.
	const refusals = await Promise.all([
		ptyWrite("someone-else", term, "x").then(() => null, (error: unknown) => String(error)),
		ptyWrite("someone-else", "no-such-terminal", "x").then(() => null, (error: unknown) => String(error)),
	]);
	check("another session is refused", refusals[0] !== null, refusals[0] ?? undefined);
	check("an unknown terminal is refused identically", refusals[0] === refusals[1]);

	// Closing the panel has to end the shell, not just free the page's half.
	await ptyClose("probe-session", term);
	const code = await exited;
	check("closing a terminal exits its shell", code !== null, `exit code ${code}`);

	// The window's own state, and the overlay primitives the capture overlay
	// will need (ADR 0015). Proved here rather than discovered in phase 9.
	const box = await windowGeometry("probe-window");
	check(
		"a window is told a usable place to open",
		box.width >= 480 && box.height >= 360,
		`${box.width}x${box.height} at ${box.x},${box.y}`,
	);

	await rememberWindow("probe-window", { x: 40, y: 60, width: 900, height: 650 });
	const remembered = await windowGeometry("probe-window");
	check(
		"a window's place is remembered",
		remembered.width === 900 && remembered.height === 650,
		`${remembered.width}x${remembered.height}`,
	);

	const overlay = await overlaySupport();
	check("always-on-top is honoured", overlay.alwaysOnTop);
	check("click-through is honoured", overlay.clickThrough);
	check("all-workspaces is honoured", overlay.allWorkspaces);
	check("an undecorated window is honoured", overlay.undecorated);

	// The menu's subscription is reachable. Deliberately a weak claim: a page
	// cannot click a native menu item, so whether an event ARRIVES belongs to
	// the manual checklist (phase 10), and the menu's own shape is asserted in
	// src-tauri/src/menu.rs. Claiming more here would be claiming coverage that
	// does not exist.
	const unlistenMenu = await onMenu(() => {});
	check("the menu channel is subscribable", typeof unlistenMenu === "function");
	unlistenMenu();

	// Capture, through the sidecar (ADR 0015). What is asserted is the round
	// trip and the lifetime; whether this machine PERMITS a capture depends on
	// a grant that differs per machine, so the status is recorded rather than
	// required.
	const captureEvents: Record<string, unknown>[] = [];
	await onCapture((event) => captureEvents.push(event));
	await captureStart();
	check("the capture helper is running", await captureRunning());
	check(
		"the helper announces itself",
		await waitFor(() => captureEvents.some((event) => event["event"] === "ready"), 8_000),
	);

	await captureSend({ op: "status" });
	const status = await waitFor(
		() => captureEvents.some((event) => event["event"] === "status"),
		8_000,
	);
	check("the helper answers a status request", status);
	const reported = captureEvents.find((event) => event["event"] === "status");
	check(
		"this machine's capture permissions are recorded",
		!!reported,
		reported
			? `screen=${reported["screenRecording"]} camera=${reported["camera"]} displays=${reported["displays"]}`
			: undefined,
	);

	await captureSend({ op: "devices" });
	check(
		"cameras are enumerated",
		await waitFor(() => captureEvents.some((event) => event["event"] === "devices"), 8_000),
	);

	const stopCode = await captureStop();
	check("the helper exits when stopped", stopCode !== null, `exit code ${stopCode}`);
	check("no helper is left running", !(await captureRunning()));

	// pi, through the session relay. This is the one that makes the window an
	// agentic interface rather than an editor: a real `pi --mode rpc`, the real
	// wire, the user's own install (ADR 0004).
	const which = await piWhich().then(
		(found) => found.path,
		(error: unknown) => `unavailable: ${String(error)}`,
	);
	check("the pi that would run is named", !which.startsWith("unavailable"), which);

	if (!which.startsWith("unavailable")) {
		const sid = `probe-session-${Date.now()}`;
		const events: Record<string, unknown>[] = [];
		await onPiEvent((eventSid, event) => {
			if (eventSid === sid) events.push(event);
		});

		await piStart(sid);
		check("a session starts", await piRunning(sid));
		check("the session is listed", (await piSessions()).includes(sid));

		// get_state is the cheapest real round trip: it needs no model call, so
		// what it proves is the framing and the correlation rather than
		// anything about a provider.
		const state = await piSend(sid, { type: "get_state" });
		check(
			"a command round-trips with its reply correlated",
			state?.type === "response" && state?.command === "get_state",
			state ? `success=${state.success}` : "no reply",
		);
		check(
			"the reply carries pi's own payload",
			!!state?.data && typeof state.data === "object",
			state?.data ? `${Object.keys(state.data).slice(0, 4).join(", ")}…` : undefined,
		);

		// Two in flight, answered independently: a crossed correlation would
		// hand one reply to the other request.
		const [a, b] = await Promise.all([
			piSend(sid, { type: "get_state" }),
			piSend(sid, { type: "get_commands" }),
		]);
		check(
			"concurrent commands do not cross",
			a?.command === "get_state" && b?.command === "get_commands",
			`${a?.command}, ${b?.command}`,
		);

		const code = await piStop(sid);
		check("the session stops", !(await piRunning(sid)), `exit code ${code}`);

		// A document's history, rewritten into a real pi's transcript and read
		// back over the wire — through the page's own `syncHistory`, the function
		// a send calls. No model call: nothing is prompted. It leaves one small
		// transcript behind in this workspace's pi sessions, under a `probe-` id.
		const historySid = `probe-history-${Date.now()}`;
		const history = "<!-- you -->\n\nprobe question\n\n<!-- pi -->\n\nPROBE ANSWER\n\n";
		const rebuildStarted = performance.now();
		const first = await syncHistory(historySid, history).catch((error: unknown) => `failed: ${String(error)}`);
		const rebuildMs = Math.round(performance.now() - rebuildStarted);
		check("a changed history is rewritten into pi's transcript", first === "rebuilt", `${first} in ${rebuildMs}ms`);
		const read = await piSend(historySid, { type: "get_entries" });
		const heldText = JSON.stringify(read?.data?.["entries"] ?? []);
		check("pi loads the rewritten history", heldText.includes("PROBE ANSWER"), heldText.slice(0, 160));
		// The round trip document → transcript → document must compare equal, or
		// every send would rewrite the transcript and restart pi.
		const second = await syncHistory(historySid, history).catch((error: unknown) => `failed: ${String(error)}`);
		check("the same history again is left alone", second === "unchanged", second);
		await piStop(historySid);

		// The same, with attachments: an image the rebuild reads into the user
		// message as vision content, and a PDF named in its text. The counts and
		// lines the compare reads must agree across a real round trip, or every
		// send under an attachment would restart pi. It leaves two small files in
		// this workspace's attachment store.
		const attachSid = `probe-attachments-${Date.now()}`;
		const canvas = new OffscreenCanvas(8, 8);
		canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
		const png = await canvas.convertToBlob({ type: "image/png" });
		const stored = await Promise.all([
			attachmentsStore(new File([png], "probe.png")),
			attachmentsStore(new File(["%PDF-1.4\n"], "probe.pdf")),
		]).catch((error: unknown) => `failed: ${String(error)}`);
		check("attachments are stored", typeof stored !== "string", typeof stored === "string" ? stored : stored.map((ref) => ref.url).join(", "));
		if (typeof stored !== "string") {
			const attached = `${stored.map(serializeFile).join("\n\n")}\n\n${history}`;
			const rebuilt = await syncHistory(attachSid, attached).catch((error: unknown) => `failed: ${String(error)}`);
			check("a history with attachments is rewritten", rebuilt === "rebuilt", rebuilt);
			const entries = await piSend(attachSid, { type: "get_entries" });
			const user = ((entries?.data?.["entries"] ?? []) as { message?: { role?: string; content?: { type: string; text?: string }[] } }[])
				.map((entry) => entry.message)
				.find((message) => message?.role === "user");
			const parts = user?.content ?? [];
			check("pi holds the image under its prompt", parts.some((part) => part.type === "image"), parts.map((part) => part.type).join(", "));
			check("pi's prompt names the PDF", parts.some((part) => part.text?.includes("[attached: probe.pdf (application/pdf) at ")));
			const again = await syncHistory(attachSid, attached).catch((error: unknown) => `failed: ${String(error)}`);
			check("the same attachments again are left alone", again === "unchanged", again);
			await piStop(attachSid);
		}
	}

	// The whole point, end to end: a prompt leaves the canvas, pi answers, and
	// the answer is in the document. Run last because it costs a real model
	// call, and skipped when `?prompt=` is absent so the ordinary probe stays
	// cheap and offline.
	if (params.has("prompt")) {
		const before = chat.getDocument();
		chat.setDocument(`${before}\nWhat is 2+2? Answer with only the digit.\n`);
		await start();
		await turn.send("What is 2+2? Answer with only the digit.", chat.getDocument().length);

		const answered = await waitFor(() => !turn.running && chat.getDocument().length > before.length + 60, 90_000);
		const grew = chat.getDocument().length - before.length;
		check("a prompt runs end to end and the answer lands in the document", answered, `${grew} characters added`);
		check(
			"the answer is attributed to pi in the document",
			chat.getDocument().includes("<!-- pi -->"),
			chat.getDocument().slice(-160).replace(/\n/g, "⏎"),
		);
	}

	await report(reports, true);
}
