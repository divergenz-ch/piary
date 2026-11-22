// The face preference, where only the real app joins its halves (ADR 0055):
// Rust reads the preference when it starts a pi and adds the guidance for the
// `[face]` block to that pi's flags, and a driven build hands the page the
// script its face follows in place of a camera (`PIARY_FACE_SCRIPT`,
// `docs/TEST_ARCHITECTURE.md` §6). What a sent message then carries is the
// page's own work, held by the page layer (`e2e/flows.spec.ts`).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@wdio/globals";
import { FAKE_PI, Instance, rmScratch, scratch, until } from "./helpers/instance.ts";

/** How long a started pi has to show in `ps`: a spawn is immediate, but `ps`
 *  sees a fork before its exec. */
const CHILD_START_MS = 5_000;

const SCRIPT = JSON.stringify([{ from: 0, to: 2000, units: [[4, "C"]] }]);

describe("the face preference", () => {
	let docDir = "";
	let app: Instance | undefined;

	afterEach(async () => {
		await app?.dispose();
		app = undefined;
		rmScratch(docDir);
	});

	it("tells a pi started while it is on about the block, and one started while it is off nothing", async () => {
		docDir = scratch("face");
		writeFileSync(join(docDir, "welcome.md"), "# A face\n");
		// The app's own preferences file for this run (`Instance.launch`).
		writeFileSync(join(docDir, "preferences.json"), JSON.stringify({ face: true, faceExplained: true }));
		const script = join(docDir, "face-script.json");
		writeFileSync(script, SCRIPT);
		const launched = await Instance.launch({ docDir, env: { PI_CLI: FAKE_PI, PIARY_FACE_SCRIPT: script } });
		app = launched.app;
		const { driver } = launched;

		expect(await driver.invoke("face_source")).toEqual({ kind: "script", script: SCRIPT });

		/** The command line of the pi started for `sid`: `tools` lingers under its own arguments. */
		const started = async (sid: string) => {
			await driver.invoke("pi_start", { sid, args: ["--fake", "tools"] });
			return until(() => launched.app.record().find((proc) => proc.command.includes(`--session-id ${sid}`))?.command, CHILD_START_MS, `no pi was started for ${sid}`);
		};

		const on = await started("face-on");
		expect(on).toContain("pi-extension/system-prompt.md");
		expect(on).toContain("--append-system-prompt");
		expect(on).toContain("pi-extension/face-guidance.md");

		await driver.invoke("preferences_write", { preferences: { cellWorkPulse: true, face: false, faceExplained: true, faceCamera: "" } });
		const off = await started("face-off");
		expect(off).toContain("pi-extension/system-prompt.md");
		expect(off).not.toContain("face-guidance.md");
	});

	it("is handed no camera: a driven run with no script has nothing to read a face with", async () => {
		docDir = scratch("face-none");
		writeFileSync(join(docDir, "welcome.md"), "# No face\n");
		writeFileSync(join(docDir, "preferences.json"), JSON.stringify({ face: true, faceExplained: true }));
		const launched = await Instance.launch({ docDir, env: { PI_CLI: FAKE_PI } });
		app = launched.app;
		expect(await launched.driver.invoke("face_source")).toEqual({ kind: "none" });
	});
});
