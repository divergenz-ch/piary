// The notice of a newer version, where only the real app joins its halves
// (ADR 0063): Rust says which version the app is, gives one window the turn
// to ask, reads the preference that switches the check off, and tells every
// window what was read. A driven build is handed its answer in place of
// GitHub's (`PIARY_UPDATE_SCRIPT`, `docs/TEST_ARCHITECTURE.md` §6). What the
// page does with a refusal, a dismissal and a current build is the page
// layer's (`e2e/app-page.spec.ts`).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { FAKE_PI, Instance, REPO, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long the page has to boot, take its turn and draw what it read. */
const NOTICE_MS = 10_000;

/** A release no build will ever be as new as. */
const ANSWER = JSON.stringify({ tag_name: "v9999.0.0" });

describe("the notice of a newer version", () => {
	let docDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	const launch = async (name: string, preferences: Record<string, unknown>, script: boolean) => {
		docDir = scratch(name);
		writeFileSync(join(docDir, "welcome.md"), "# A version\n");
		writeFileSync(join(docDir, "preferences.json"), JSON.stringify(preferences));
		const file = join(docDir, "update-answer.json");
		writeFileSync(file, ANSWER);
		const launched = await Instance.launch({ docDir, env: { PI_CLI: FAKE_PI, ...(script ? { PIARY_UPDATE_SCRIPT: file } : {}) } });
		app = launched.app;
		return launched.driver;
	};

	const pill = (driver: Awaited<ReturnType<typeof launch>>) =>
		driver.execute(() => {
			const button = document.querySelector<HTMLElement>(".update-pill");
			return button && !button.hidden ? button.textContent : null;
		});

	it("is shown by a build older than the answer it was handed, after one check", async () => {
		const driver = await launch("update", {}, true);
		await until(async () => (await pill(driver)) === "Update 9999.0.0", NOTICE_MS, "the window never announced the version it was handed");
		// The version is the one written in package.json, and nowhere else.
		const { version } = JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as { version: string };
		expect(await driver.invoke("update_state")).toEqual({ current: version, latest: "v9999.0.0" });
		// The page took the turn at launch: within the hour there is no other.
		expect(await driver.invoke("update_claim")).toEqual({ kind: "none" });
	});

	it("is not looked up with the preference off, and is once it is switched on", async () => {
		const driver = await launch("update-off", { updateCheck: false }, true);
		expect(await driver.invoke("update_claim")).toEqual({ kind: "none" });
		expect(await driver.invoke("update_state")).toMatchObject({ latest: null });
		// Switched on, as the Preferences window does: the page hears it and asks.
		await driver.invoke("preferences_write", { preferences: { updateCheck: true } });
		await until(async () => (await pill(driver)) === "Update 9999.0.0", NOTICE_MS, "switching the check on never looked a version up");
	});

	it("asks nothing in a driven run that was handed no answer", async () => {
		const driver = await launch("update-none", {}, false);
		expect(await driver.invoke("update_claim")).toEqual({ kind: "none" });
		expect(await pill(driver)).toBe(null);
	});
});
