// A document image's source in the real editor — run pnpm build first.
//
// The document's attachment url is site-relative (`/attachments/<name>`, the
// format's §Attachments), a path no host has to serve. A host
// that serves it elsewhere hands the canvas a `resolveAsset`; the text never
// changes, only what the `img` loads.
import test from "node:test";
import assert from "node:assert/strict";
import { boot, mount, settle, unmount } from "../helpers/editor.ts";
import type { DocumentChat } from "../../dist/components/DocumentChat.js";

const MD = "<!-- pi:note -->\n\n![shot.png](/attachments/shot-ab12cd34.png)\n\n<!-- you -->\n\n";
const toScheme = (url: string) => url.replace(/^\/attachments\//, "piary-file://localhost/");

const sources = (el: DocumentChat) =>
	[...(el.view?.contentDOM.querySelectorAll("img.doc-md-img") ?? [])].map((img) => img.getAttribute("src"));

test("with no resolver, an image loads the url the document holds", async () => {
	const { el } = await mount(MD);
	try {
		assert.deepEqual(sources(el), ["/attachments/shot-ab12cd34.png"]);
	} finally {
		unmount(el);
	}
});

test("a resolver set before the document is the first paint's source", async () => {
	await boot();
	const el = document.createElement("document-chat") as DocumentChat;
	el.resolveAsset = toScheme;
	document.body.append(el);
	await settle();
	el.setDocument(MD);
	await settle();
	try {
		assert.deepEqual(sources(el), ["piary-file://localhost/shot-ab12cd34.png"]);
		assert.equal(el.view?.state.doc.toString(), MD, "the text keeps the document's url");
	} finally {
		unmount(el);
	}
});

test("a resolver set later redraws the image through it", async () => {
	const { el } = await mount(MD);
	try {
		el.resolveAsset = toScheme;
		await settle();
		assert.deepEqual(sources(el), ["piary-file://localhost/shot-ab12cd34.png"]);
	} finally {
		unmount(el);
	}
});

test("a source the url policy refuses is never handed to the resolver", async () => {
	const seen: string[] = [];
	await boot();
	const el = document.createElement("document-chat") as DocumentChat;
	el.resolveAsset = (url) => {
		seen.push(url);
		return url;
	};
	document.body.append(el);
	await settle();
	el.setDocument("<!-- pi:note -->\n\n![x](javascript:alert(1))\n\n<!-- you -->\n\n");
	await settle();
	try {
		assert.deepEqual(seen, []);
		assert.deepEqual(sources(el), []);
	} finally {
		unmount(el);
	}
});
