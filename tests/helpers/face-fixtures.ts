// The recorded faces (tests/fixtures/face/, written by scripts/face-fixtures.ts): one person
// making one movement on request, as the samples a detector reported.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FaceSample } from "../../dist/document/face-episodes.js";

const DIR = join(import.meta.dirname, "..", "fixtures", "face");

export interface Recorded {
	name: string;
	/** What the person was asked to do. */
	say: string;
	/** On the fixture's clock: the key press, the moment the screen said NOW, and RELAX. */
	readyAt: number;
	goAt: number;
	endAt: number;
	samples: FaceSample[];
}

export function recorded(name: string): Recorded {
	const { names, rows, ...rest } = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as Omit<Recorded, "samples"> & { names: string[]; rows: number[][] };
	const samples = rows.map((row): FaceSample => {
		const matrix = row.slice(2 + names.length);
		return { at: row[0]!, faces: row[1]!, scores: Object.fromEntries(names.map((score, i) => [score, row[2 + i]!])), matrix: matrix.length === 16 ? matrix : null };
	});
	return { ...rest, samples };
}

export const recordedNames = (): string[] => readdirSync(DIR).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).sort();
