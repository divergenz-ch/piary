// The fixture recorder: not part of the app, and built into it only when
// `PIARY_FACE_RECORD=1` (`app/vite.config.ts`, docs/TEST_ARCHITECTURE.md §6).
//
// It asks a person for one movement at a time, at their own pace, and writes
// what the detector reported meanwhile to the document `face-recording`:
// numbers only, the same samples `src/document/face-episodes.ts` reads, at the
// camera's full frame rate so a fixture can be thinned to any rate. No frame
// leaves `mediapipe.ts`, here as anywhere.

import "../../src/forward-console.ts";
import { docsWrite } from "../../src/bridge.ts";
import type { FaceSample } from "../../src/document/face-episodes.ts";
import type { SourceState } from "./detector.ts";
import { cameraSource, READ_EVERY } from "./mediapipe.ts";

/** One thing asked for: a name for the fixture, what to do in plain words, any
 *  more to say about it, and how long to keep doing it. */
interface Ask {
	name: string;
	say: string;
	how?: string;
	seconds: number;
	/** Shows the box to type in. */
	type?: true;
}

const HOLD = "Do it when the screen says NOW, and keep it until it says RELAX.";
const READ = "Wikipedia began in January 2001 as a side project of an encyclopedia written by experts. Anyone could edit it, which most people expected to fail. Within a year it had twenty thousand articles, and its older sibling had about twenty-five. The experts' encyclopedia closed in 2003.";
const ASKS: readonly Ask[] = [
	{ name: "rest", say: "Look at the screen. Do nothing.", how: "Just sit as you do when reading.", seconds: 10 },
	{ name: "brows-down", say: "Pull your eyebrows down and together.", how: `As when something looks wrong.\n${HOLD}`, seconds: 6 },
	{ name: "brows-up", say: "Raise your eyebrows.", how: HOLD, seconds: 6 },
	{ name: "eyes-wide", say: "Open your eyes wide.", how: HOLD, seconds: 6 },
	{ name: "eyes-narrow", say: "Narrow your eyes.", how: `As when reading very small text.\n${HOLD}`, seconds: 6 },
	{ name: "nose", say: "Wrinkle your nose.", how: `As at a bad smell.\n${HOLD}`, seconds: 6 },
	{ name: "smile-small", say: "Smile a little, mouth closed.", how: HOLD, seconds: 6 },
	{ name: "smile-wide", say: "Smile wide.", how: HOLD, seconds: 6 },
	{ name: "mouth-corners-down", say: "Pull the corners of your mouth down.", how: `As when you are not convinced.\n${HOLD}`, seconds: 6 },
	{ name: "lips-pressed", say: "Press your lips together, hard.", how: HOLD, seconds: 6 },
	{ name: "lips-in", say: "Pull both lips into your mouth.", how: `So that the red of the lips disappears.\n${HOLD}`, seconds: 6 },
	{ name: "lip-bite", say: "Bite your lower lip.", how: HOLD, seconds: 6 },
	{ name: "mouth-open", say: "Let your mouth fall open.", how: HOLD, seconds: 6 },
	{ name: "eyes-closed", say: "Close your eyes.", how: "Close them at NOW and count slowly to four in your head, then open them.", seconds: 7 },
	{ name: "blinks", say: "Blink three times, normally.", how: "One blink, a short wait, another, a short wait, a third.", seconds: 6 },
	{ name: "head-left", say: "Turn your head a little to YOUR left.", how: `Keep your eyes on the screen.\n${HOLD}`, seconds: 6 },
	{ name: "head-right", say: "Turn your head a little to YOUR right.", how: `Keep your eyes on the screen.\n${HOLD}`, seconds: 6 },
	{ name: "head-up", say: "Lift your chin: tip your head back a little.", how: HOLD, seconds: 6 },
	{ name: "head-down", say: "Lower your chin: tip your head forward a little.", how: HOLD, seconds: 6 },
	{ name: "tilt-left", say: "Tip your head toward YOUR left shoulder.", how: HOLD, seconds: 6 },
	{ name: "tilt-right", say: "Tip your head toward YOUR right shoulder.", how: HOLD, seconds: 6 },
	{ name: "lean-in", say: "Lean in toward the screen.", how: HOLD, seconds: 6 },
	{ name: "lean-back", say: "Lean back, away from the screen.", how: HOLD, seconds: 6 },
	{ name: "head-up-and-down", say: "Move your head up and down, four or five times.", how: "Chin down, chin up, again and again, at an easy speed.", seconds: 7 },
	{ name: "head-side-to-side", say: "Move your head from side to side, four or five times.", how: "Face left, face right, again and again, at an easy speed.", seconds: 7 },
	{ name: "look-away", say: "Look at something beside the screen.", how: "Turn your head to it, as you would to a second screen or a person, and keep looking until RELAX.", seconds: 7 },
	{ name: "talking", say: "Count aloud from one to fifteen.", how: "At a normal speaking speed.", seconds: 10 },
	{ name: "reading", say: "Read this to yourself.", how: READ, seconds: 20 },
	{ name: "typing", say: "Type in the box, as you normally type.", how: "Write a few sentences about what you did yesterday. Do not think about your face.", seconds: 40, type: true },
];

const COUNTDOWN_S = 3;
const RELAX_S = 2;
/** How long the camera is read at the app's own rate, with nothing drawn, for a
 *  look at what the reading costs from outside. */
const QUIET_S = 40;

const $ = (id: string) => document.getElementById(id)!;
const show = (say: string, how = "", now = "", tone = "") => {
	$("say").textContent = say;
	$("how").textContent = how;
	$("now").textContent = now;
	$("now").dataset["tone"] = tone;
};
const wait = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));
/** The next press of `keys`, case ignored. */
const pressed = (...keys: string[]) =>
	new Promise<string>((resolve) => {
		const heard = (event: KeyboardEvent) => {
			const key = event.key.toLowerCase();
			if (!keys.includes(key)) return;
			event.preventDefault();
			removeEventListener("keydown", heard);
			resolve(key);
		};
		addEventListener("keydown", heard);
	});

const recording: {
	recordedAt: string;
	userAgent: string;
	readEvery: number;
	states: { at: number; state: SourceState }[];
	/** Each ask, with the page's clock at the key press, at NOW and at RELAX. */
	asks: { name: string; say: string; readyAt: number; goAt: number; endAt: number }[];
	samples: FaceSample[];
	quiet?: { readEvery: number; fromWall: string; toWall: string; samples: number };
	lightOffAfterStop?: boolean;
} = { recordedAt: new Date().toISOString(), userAgent: navigator.userAgent, readEvery: 1, states: [], asks: [], samples: [] };

let saving = Promise.resolve();
function save(): void {
	const text = `# Face recording\n\n\`\`\`json\n${JSON.stringify(recording)}\n\`\`\`\n`;
	saving = saving.then(() => docsWrite("face-recording", text)).catch((error: unknown) => void ($("state").textContent = `could not save: ${String(error)}`));
}

async function main(): Promise<void> {
	const camera = cameraSource({ every: 1 });
	let seen = 0;
	camera.onSample((sample) => {
		recording.samples.push(sample);
		seen++;
	});
	const watching = new Promise<void>((resolve) => {
		camera.onState((state) => {
			recording.states.push({ at: performance.now(), state });
			$("state").textContent = `camera: ${typeof state === "string" ? state : state.failed}`;
			if (state === "watching") resolve();
			else if (state !== "starting" && state !== "stopped") {
				show("The camera could not be read.", typeof state === "string" ? state : state.failed);
				save();
			}
		});
	});
	camera.start();
	await watching;

	show("This records how your face moves, as numbers. No picture is kept.", `There are ${ASKS.length} short steps, about eight minutes. Each one waits for you: read it, then press Space when you are ready.\nSit as you normally do at this screen.`, "Press Space to begin");
	await pressed(" ");
	for (const [i, ask] of ASKS.entries()) {
		$("count").textContent = `${i + 1} of ${ASKS.length}`;
		($("type") as HTMLTextAreaElement).style.display = "none";
		show(ask.say, ask.how, "Press Space when ready", "wait");
		await pressed(" ");
		const readyAt = performance.now();
		for (let n = COUNTDOWN_S; n > 0; n--) {
			show(ask.say, ask.how, `${n}`, "wait");
			await wait(1);
		}
		const goAt = performance.now();
		if (ask.type) {
			const box = $("type") as HTMLTextAreaElement;
			box.value = "";
			box.style.display = "block";
			box.focus();
		}
		for (let left = ask.seconds; left > 0; left--) {
			show(ask.say, ask.how, `NOW  ${left}`, "go");
			await wait(1);
		}
		const endAt = performance.now();
		($("type") as HTMLTextAreaElement).blur();
		show(ask.say, "", "RELAX", "wait");
		await wait(RELAX_S);
		recording.asks.push({ name: ask.name, say: ask.say, readyAt, goAt, endAt });
		save();
	}
	($("type") as HTMLTextAreaElement).style.display = "none";
	$("count").textContent = "";

	// The app's own rate, and nothing drawn: what the reading costs is looked at
	// from outside, against these two wall-clock times.
	camera.stop();
	const quiet = cameraSource({ every: READ_EVERY });
	let quietly = 0;
	quiet.onSample(() => void quietly++);
	show("Almost done. Sit as you normally would for 40 seconds.", "Nothing will change on the screen until it is over.");
	quiet.start();
	await wait(3);
	const fromWall = new Date().toISOString();
	quietly = 0;
	await wait(QUIET_S);
	recording.quiet = { readEvery: READ_EVERY, fromWall, toWall: new Date().toISOString(), samples: quietly };
	quiet.stop();
	save();

	show("Last question: is the camera's green light off now?", "Look at the light beside the camera.", "Press Y for off, N for still on");
	recording.lightOffAfterStop = (await pressed("y", "n")) === "y";
	save();
	await saving;
	show("Done. Thank you.", `${seen} samples were saved. You can close this window.`);
}
void main();
