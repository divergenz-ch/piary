// The camera as a source of face samples: the ONLY importer of
// `@mediapipe/tasks-vision` (lint-enforced, ADR 0058).
//
// It asks for the camera, runs MediaPipe's Face Landmarker on the frames, and
// reports one `FaceSample` per frame read: the model's expression scores, the
// head's transform, how many faces. No frame, image or landmark leaves this
// file, and nothing here is written to disk, sent over IPC or logged. The
// user may ask to see the picture, to sit in frame: it is then this file's
// own video element put where they look, and still nothing reads it but the
// model (ADR 0059).
//
// The wasm and the model are the app's own files (`pnpm face:assets`): nothing
// is fetched from a network.

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { FaceSample } from "../../src/document/face-episodes.ts";
import type { SampleSource, SourceState } from "./detector.ts";
import { pickCamera } from "./state.ts";

const WASM = "/face/wasm";
const MODEL = "/face/face_landmarker.task";
/** What the camera is asked for: small and slow is all a face needs. */
const VIDEO = { width: 320, height: 240, frameRate: 15 };
/** Every second frame is read: 7.5 a second at the frame rate asked for. A
 *  detection on every frame is what the reading costs, and a blink still spans
 *  a sample or two at this rate. */
export const READ_EVERY = 2;

export interface CameraOptions {
	/** Which frames are read: every `every`th. */
	every?: number;
	/** The camera the user chose, by its label, asked at every start; empty for
	 *  none chosen. */
	wanted?: () => string;
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** The camera, read for faces. One instance holds at most one stream. */
export function cameraSource({ every = READ_EVERY, wanted = () => "" }: CameraOptions = {}): SampleSource {
	let heard: (sample: FaceSample) => void = () => {};
	let said: (state: SourceState) => void = () => {};
	let listed: (labels: readonly string[]) => void = () => {};
	/** The cameras last listed, as one string to compare. */
	let listing = "";
	let landmarker: Promise<FaceLandmarker> | null = null;
	/** The run that is current: a start that finishes after a stop finds it changed. */
	let run = 0;
	let active = false;
	let stream: MediaStream | null = null;
	let video: HTMLVideoElement | null = null;
	/** Where the user asked to see the camera's picture, if they did. */
	let shown: HTMLElement | null = null;

	/** Puts `element` where it belongs: in view inside `shown`, mirrored as a
	 *  mirror is, or in the page and never drawn. It is this file's element
	 *  either way, and nothing reads a frame from it but the model here. */
	const place = (element: HTMLVideoElement): void => {
		element.className = shown ? "face-picture" : "";
		element.style.display = shown ? "" : "none";
		(shown ?? document.body).append(element);
		// WebKit pauses a video that is moved in the document.
		if (element.paused && element.srcObject) void element.play().catch(() => {});
	};

	const model = (): Promise<FaceLandmarker> =>
		(landmarker ??= FilesetResolver.forVisionTasks(WASM).then((files) =>
			FaceLandmarker.createFromOptions(files, {
				// The CPU delegate: as fast as the GPU one where it was measured, and
				// without that one's five-second first detection.
				baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
				runningMode: "VIDEO",
				numFaces: 2,
				outputFaceBlendshapes: true,
				outputFacialTransformationMatrixes: true,
			}),
		));

	const stopAll = (taken: MediaStream): void => {
		for (const track of taken.getTracks()) track.stop();
	};

	/** Starts over while `mine` is still the run: the cameras changed under it. */
	function again(mine: number): void {
		if (!active || mine !== run) return;
		release();
		void begin(++run);
	}
	// A camera plugged in may be the one the user chose; one unplugged may be
	// the one being read. The system also says "changed" when it first names
	// the cameras, which changes nothing here.
	navigator.mediaDevices?.addEventListener?.("devicechange", () => {
		const mine = run;
		void cameras().then((known) => {
			if (known.map((device) => device.label).join("\n") !== listing) again(mine);
		});
	});

	function release(): void {
		// Ending the track is what turns the system's camera light off.
		if (stream) stopAll(stream);
		stream = null;
		video?.remove();
		video = null;
	}

	function read(reader: FaceLandmarker, from: HTMLVideoElement, at: number): FaceSample {
		const out = reader.detectForVideo(from, at);
		const scores: Record<string, number> = {};
		for (const category of out.faceBlendshapes?.[0]?.categories ?? []) scores[category.categoryName] = round(category.score, 3);
		const matrix = out.facialTransformationMatrixes?.[0]?.data;
		return { at: round(at, 1), faces: out.faceLandmarks?.length ?? 0, scores, matrix: matrix ? Array.from(matrix, (n) => round(n, 4)) : null };
	}

	/** The cameras there are. Their labels are empty until the user has allowed
	 *  the camera once, and then there is nothing to choose by. */
	async function cameras(): Promise<MediaDeviceInfo[]> {
		const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
		return devices.filter((device) => device.kind === "videoinput" && device.label);
	}

	/** The stream of the camera to read: the one the user chose, else this
	 *  Mac's own, never a phone's because the system offered it first. `null`
	 *  when there is no such camera. */
	async function take(): Promise<MediaStream | null> {
		let known = await cameras();
		let first: MediaStream | null = null;
		if (known.length === 0) {
			// Not allowed yet, so not named yet: asking for any camera is what
			// makes the system ask the user, and the names come with the answer.
			first = await navigator.mediaDevices.getUserMedia({ video: VIDEO });
			known = await cameras();
		}
		const labels = known.map((device) => device.label);
		listing = labels.join("\n");
		listed(labels);
		// Allowed and still unnamed: there is nothing to choose by, so what the
		// system gave is what is read.
		if (first && known.length === 0) return first;
		const label = pickCamera(labels, wanted());
		const chosen = known.find((device) => device.label === label);
		if (chosen && first?.getVideoTracks()[0]?.label === label) return first;
		if (first) stopAll(first);
		if (!chosen) return null;
		return navigator.mediaDevices.getUserMedia({ video: { ...VIDEO, deviceId: { exact: chosen.deviceId } } });
	}

	async function begin(mine: number): Promise<void> {
		said("starting");
		if (!navigator.mediaDevices?.getUserMedia) return said("absent");
		let taken: MediaStream | null;
		try {
			taken = await take();
		} catch (error) {
			const name = (error as { name?: string }).name;
			return said(name === "NotAllowedError" || name === "SecurityError" ? "refused" : name === "NotFoundError" || name === "OverconstrainedError" ? "absent" : { failed: String(error) });
		}
		if (!taken) return said("absent");
		// Stopped while the system was asking: the camera is not kept.
		if (mine !== run) return stopAll(taken);
		stream = taken;
		// Unplugged, or taken away by the system: read whatever camera is left.
		for (const track of taken.getTracks()) track.addEventListener("ended", () => again(mine));
		// In the page whether or not it is shown: WebKit delivers frames only to
		// a video that is part of the document.
		const element = document.createElement("video");
		element.muted = true;
		element.playsInline = true;
		element.srcObject = taken;
		place(element);
		video = element;
		let reader: FaceLandmarker;
		try {
			await element.play();
			reader = await model();
		} catch (error) {
			if (mine === run) {
				release();
				said({ failed: String(error) });
			}
			return;
		}
		if (mine !== run) return;
		said("watching");
		let frames = 0;
		const next = (now: number): void => {
			if (mine !== run || video !== element) return;
			if (frames++ % every === 0) {
				try {
					heard(read(reader, element, now));
				} catch (error) {
					release();
					said({ failed: String(error) });
					return;
				}
			}
			element.requestVideoFrameCallback(next);
		};
		element.requestVideoFrameCallback(next);
	}

	return {
		start() {
			if (active) return;
			active = true;
			void begin(++run);
		},
		stop() {
			if (!active) return;
			active = false;
			run++;
			release();
			said("stopped");
		},
		onSample: (cb) => void (heard = cb),
		onState: (cb) => void (said = cb),
		onCameras: (cb) => void (listed = cb),
		picture(host) {
			shown = host;
			if (video) place(video);
		},
	};
}
