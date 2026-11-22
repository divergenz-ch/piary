// Attachments: a file dropped on the document or pasted into it is stored
// beside the conversation (`src-tauri/src/attachments.rs`), and its `pi:file`
// segment lands in front of the prompt it was put on (the format's
// §Attachments).
//
// What pi hears of an attachment is decided here too, once, for a send and a
// rebuild alike, so the two cannot disagree: an image becomes vision content
// (`imagesFor`), anything else a line naming its path (`notesFor`).

import type { ImageContent } from "@earendil-works/pi-ai";
import type { DocumentChat } from "../src/components/DocumentChat.ts";
import { attachmentsPath, attachmentsRead, attachmentsStore, piSend, piStart } from "../src/bridge.ts";
import { attachmentNote, type FileRef } from "../src/document/format.ts";
import type { HostFragment } from "./canvas-events.ts";
import type { AppContext } from "./context.ts";

/** The largest file taken: the store's own cap (`attachments::MAX_BYTES`),
 *  checked here too so a file that cannot be stored is never read into the
 *  page to find out. */
const ATTACH_MAX = 10 * 1024 * 1024;

/** The scheme Rust answers with a stored attachment's bytes. */
const SCHEME = "piary-file://localhost/";

/** The scheme Rust answers with a workspace file, read-only: the root a cell's
 *  `FileAttachment` resolves against (`notebook-cells.md` §Files). */
const WORKSPACE = "piary-workspace://localhost/";

/** Stores each file and puts its segment where it was dropped, or at the caret
 *  for a paste. A file that is refused is said, and the document is left
 *  alone. An image going to a model that cannot see it is said before the
 *  send, not by the picture being quietly ignored. */
export async function attachFiles(
	{ chat, sid, notify }: Pick<AppContext, "chat" | "sid" | "notify">,
	files: readonly File[],
	pos: number | undefined,
): Promise<void> {
	for (const file of files) {
		if (file.size > ATTACH_MAX) {
			notify(`${file.name} is larger than ${Math.round(ATTACH_MAX / 1024 / 1024)} MB.`);
			continue;
		}
		let stored: FileRef;
		try {
			stored = await attachmentsStore(file);
		} catch (error) {
			notify(`Could not attach ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		chat.insertAttachment(stored, pos);
		if (!stored.mime.startsWith("image/")) continue;
		// The model is pi's to know, so pi is asked; a pi that cannot be asked
		// is no reason to warn.
		const profile = await piStart(sid).then(() => imageProfile(sid), () => null);
		if (profile && !profile.sees) notify(`${profile.model} has no vision — the image will be ignored.`);
	}
}

/** Points the canvas at the schemes its files load from: attachments the
 *  document names, and the workspace files its cells read. */
export function serveFiles(chat: Pick<DocumentChat, "resolveAsset" | "fileBase">): void {
	chat.resolveAsset = assetUrl;
	chat.fileBase = WORKSPACE;
}

/** The url the webview loads for an image the document names: its own scheme
 *  for an attachment, anything else as it is. */
export function assetUrl(url: string): string {
	return url.startsWith("/attachments/") ? SCHEME + url.slice("/attachments/".length) : url;
}

export function attachmentHandlers(ctx: Pick<AppContext, "chat" | "sid" | "notify">): HostFragment<"doc-files"> {
	return {
		"doc-files": ({ files, pos }) => void attachFiles(ctx, files, pos),
	};
}

/** The bounds an image is brought within before pi is handed it. */
export type ImageLimits = { maxWidth: number; maxHeight: number; maxBytes: number; jpegQuality: number };

/** pi's own (`utils/image-resize-core.js`, `DEFAULT_OPTIONS`): an edge of 2000
 *  pixels, 4.5 MB of base64 (headroom below the provider's 5 MB), JPEG at 80.
 *  A model may declare its own, which pi then applies instead. */
const PI_LIMITS: ImageLimits = { maxWidth: 2000, maxHeight: 2000, maxBytes: 4.5 * 1024 * 1024, jpegQuality: 80 };

/** The JPEG qualities pi falls back through after the model's own, in its order. */
const JPEG_FALLBACK = [85, 70, 55, 40];

/** How much each fallback step shrinks both edges, pi's. */
const SHRINK = 0.75;

/** What the model pi is running takes of an image. */
export type ImageProfile = { model: string; sees: boolean; limits: ImageLimits };

/**
 * Asks pi which model it runs: whether it takes images, and the resize limits
 * it declares, which pi applies to a prompt's images in place of its own. An
 * image brought within the same limits is one pi passes through unchanged, so
 * what the page sends is byte for byte what the transcript then holds — which
 * is what lets the history compare read images at all. A pi that cannot answer
 * gets pi's own limits and no warning.
 */
export async function imageProfile(sid: string): Promise<ImageProfile> {
	const reply = await piSend(sid, { type: "get_state" }).catch(() => null);
	const model = (reply?.success ? reply.data?.["model"] : undefined) as
		| { name?: string; id?: string; input?: string[]; inputLimits?: { images?: { resize?: Partial<ImageLimits> } } }
		| undefined;
	const declared = Object.entries(model?.inputLimits?.images?.resize ?? {}).filter(([, value]) => typeof value === "number");
	return {
		model: model?.name ?? model?.id ?? "This model",
		sees: model?.input ? model.input.includes("image") : true,
		limits: { ...PI_LIMITS, ...Object.fromEntries(declared) },
	};
}

/** The image types pi inlines as they are; anything else is converted to PNG
 *  first, as pi's `processImage` does. */
const INLINE_IMAGE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** A blob's bytes as base64, without building a string the size of the file
 *  one character at a time. */
function base64Of(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * One image brought within `limits`, as pi's `processImage` would: a type pi
 * does not inline becomes PNG; within the edges and under the base64 cap it is
 * unchanged; otherwise it is scaled to fit and re-encoded, PNG first, then
 * JPEG down the quality ladder, then smaller still, until a candidate fits.
 * `null` when nothing does, or the bytes are not an image the webview can
 * decode.
 *
 * Needed because a rebuilt transcript is loaded as written: pi normalizes a
 * prompt's images, never a history's. The bytes differ from pi's photon; the
 * limits are the same.
 */
export async function normalizeImage(
	bytes: ArrayBuffer,
	mime: string,
	limits: ImageLimits = PI_LIMITS,
): Promise<{ data: string; mimeType: string } | null> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
	} catch {
		return null;
	}
	try {
		const { width, height } = bitmap;
		const draw = (w: number, h: number, type: string, quality?: number): Promise<Blob> => {
			const canvas = new OffscreenCanvas(w, h);
			canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
			return canvas.convertToBlob(quality === undefined ? { type } : { type, quality: quality / 100 });
		};
		let source = new Blob([bytes], { type: mime });
		let type = mime;
		if (!INLINE_IMAGE.has(mime)) {
			source = await draw(width, height, "image/png");
			type = "image/png";
		}
		if (width <= limits.maxWidth && height <= limits.maxHeight && Math.ceil(source.size / 3) * 4 < limits.maxBytes)
			return { data: await base64Of(source), mimeType: type };

		let w = width;
		let h = height;
		if (w > limits.maxWidth) [w, h] = [limits.maxWidth, Math.round((h * limits.maxWidth) / w)];
		if (h > limits.maxHeight) [w, h] = [Math.round((w * limits.maxHeight) / h), limits.maxHeight];
		const qualities = [...new Set([limits.jpegQuality, ...JPEG_FALLBACK])];
		for (;;) {
			for (const [encoding, quality] of [["image/png", undefined], ...qualities.map((q) => ["image/jpeg", q] as const)] as const) {
				const data = await base64Of(await draw(w, h, encoding, quality));
				if (data.length < limits.maxBytes) return { data, mimeType: encoding };
			}
			const next = [w === 1 ? 1 : Math.max(1, Math.floor(w * SHRINK)), h === 1 ? 1 : Math.max(1, Math.floor(h * SHRINK))];
			if (next[0] === w && next[1] === h) return null;
			[w, h] = next as [number, number];
		}
	} finally {
		bitmap.close();
	}
}

/** The stored name an attachment's url names, or `null` for a url that is not
 *  in the store. */
function storedName(ref: FileRef): string | null {
	return ref.url.startsWith("/attachments/") ? ref.url.slice("/attachments/".length) : null;
}

/** How much normalized base64 the page keeps between sends. Enough for a long
 *  conversation's screenshots; past it, the least recently used goes first. */
const KEPT_IMAGE_CHARS = 64 * 1024 * 1024;

/**
 * Images already read and normalized, by stored name and limits. A stored
 * name always names the same bytes — the store never writes one twice — so the
 * history compare can read every image above a prompt on each send without
 * reading the disk or redrawing a canvas for one it has seen. A failure is not
 * kept: a file that comes back is read again.
 */
const kept = new Map<string, ImageContent>();
let keptChars = 0;

function keep(key: string, image: ImageContent): void {
	kept.set(key, image);
	keptChars += image.data.length;
	for (const [oldest, { data }] of kept) {
		if (keptChars <= KEPT_IMAGE_CHARS || oldest === key) break;
		kept.delete(oldest);
		keptChars -= data.length;
	}
}

/** The images among `refs`, each read from the store and brought within
 *  `limits`. A non-image is not one; a file that cannot be read or decoded is
 *  skipped — a deleted attachment never stops a send. */
export async function imagesFor(refs: readonly FileRef[], limits: ImageLimits = PI_LIMITS): Promise<ImageContent[]> {
	const images: ImageContent[] = [];
	for (const ref of refs) {
		const name = ref.mime.startsWith("image/") ? storedName(ref) : null;
		if (!name) continue;
		const key = `${name} ${limits.maxWidth}x${limits.maxHeight} ${limits.maxBytes} q${limits.jpegQuality}`;
		let image = kept.get(key);
		if (image) {
			// Re-inserted, so the order the map evicts in is least recently used.
			kept.delete(key);
			kept.set(key, image);
		} else {
			const found = await attachmentsRead(name)
				.then((bytes) => normalizeImage(bytes, ref.mime, limits))
				.catch(() => null);
			if (!found) continue;
			image = { type: "image", ...found };
			keep(key, image);
		}
		images.push(image);
	}
	return images;
}

/** One `[attached: …]` line for each non-image among `refs` (the format's
 *  §Attachments), naming where the store keeps it. A ref whose path the store
 *  refuses is left out. */
export async function notesFor(refs: readonly FileRef[]): Promise<string[]> {
	const notes: string[] = [];
	for (const ref of refs) {
		const name = ref.mime.startsWith("image/") ? null : storedName(ref);
		if (!name) continue;
		const path = await attachmentsPath(name).catch(() => null);
		if (path) notes.push(attachmentNote(ref.name, ref.mime, path));
	}
	return notes;
}

/** A prompt's message with its attachments' lines after its own text. */
export function withNotes(text: string, notes: readonly string[]): string {
	return [text, ...notes].join("\n");
}

/** The limits to bring `refs`' images within: the model's, asked of pi only
 *  when there is an image to bring. pi is running when this is called. */
export async function limitsFor(sid: string, refs: readonly FileRef[]): Promise<ImageLimits> {
	return refs.some((ref) => ref.mime.startsWith("image/")) ? (await imageProfile(sid)).limits : PI_LIMITS;
}

/** A command pi takes a message on — `prompt`, `steer`, `follow_up` — carrying
 *  `refs`: the non-image lines after its text, and the images, when there are
 *  any, as pi's `images`. pi is running when this is called. */
export async function carrying<C extends { type: string; message: string }>(
	sid: string,
	command: C,
	refs: readonly FileRef[],
): Promise<C & { images?: ImageContent[] }> {
	if (!refs.length) return command;
	const [images, notes] = await Promise.all([imagesFor(refs, await limitsFor(sid, refs)), notesFor(refs)]);
	return { ...command, message: withNotes(command.message, notes), ...(images.length ? { images } : {}) };
}
