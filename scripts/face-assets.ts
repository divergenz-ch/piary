#!/usr/bin/env node
// Puts what the face detector loads beside the app's page (ADR 0058): MediaPipe's
// wasm, copied from the installed package, and the Face Landmarker model, fetched
// once and held to a checksum. Both land in `app/public/face/`, which Vite serves
// and copies into the build, so the app reads a face with no network and at the
// version that was tested. Neither is committed: 18 MB of binaries that are
// already pinned, one by the lockfile and one here.
//
// Run: pnpm face:assets    (`pnpm app:build` runs it; a build that cannot get
// them fails here, by name, rather than shipping a switch that does nothing)
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "app", "public", "face");
const WASM = join(ROOT, "node_modules", "@mediapipe", "tasks-vision", "wasm");
/** The loader and the binary `FilesetResolver.forVisionTasks` asks for. */
const WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"];

const MODEL = "face_landmarker.task";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fail(message: string): never {
	process.stderr.write(`face:assets: ${message}\n`);
	process.exit(1);
}

mkdirSync(join(OUT, "wasm"), { recursive: true });
for (const file of WASM_FILES) {
	const from = join(WASM, file);
	if (!existsSync(from)) fail(`${from} is missing: run \`pnpm install\``);
	copyFileSync(from, join(OUT, "wasm", file));
}

const model = join(OUT, MODEL);
if (!existsSync(model) || sha256(readFileSync(model)) !== MODEL_SHA256) {
	const response = await fetch(MODEL_URL).catch((error: unknown) => fail(`could not fetch the model from ${MODEL_URL}: ${String(error)}`));
	if (!response.ok) fail(`could not fetch the model from ${MODEL_URL}: HTTP ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const got = sha256(bytes);
	if (got !== MODEL_SHA256) fail(`the model at ${MODEL_URL} is not the one that was tested: sha256 ${got}, expected ${MODEL_SHA256}`);
	// Written beside and moved into place, so a build never reads half a model.
	writeFileSync(`${model}.part`, bytes);
	renameSync(`${model}.part`, model);
}
process.stdout.write(`face:assets: ${WASM_FILES.length} wasm files and ${MODEL} are in app/public/face/\n`);
