// What a release is decided from, with no effect of its own: the commits since
// the last one, the version they call for, the notes they amount to, and the
// three files that carry the version. `scripts/release.ts` does the acting;
// everything here is a function of its arguments, so the suite drives it
// (`tests/unit/release-plan.test.ts`).
import { newer, parseVersion, versionText, type Version } from "../app/update-check.ts";

/** One commit, as far as its Conventional Commits subject says what it is. */
export interface Commit {
	readonly hash: string;
	/** `feat`, `fix`, …, or `null` for a subject that follows no such form. */
	readonly type: string | null;
	readonly scope: string | null;
	/** The subject after `type(scope): `, or the whole subject. */
	readonly summary: string;
	readonly body: string;
	readonly breaking: boolean;
}

/** `git log -z --format=%H%n%s%n%b`: a record per commit, NUL between them. */
export const LOG_FORMAT = "%H%n%s%n%b";

const SUBJECT = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

/** The commits in `git log -z --format=LOG_FORMAT` output, in its order. */
export function parseLog(log: string): Commit[] {
	return log
		.split("\0")
		.map((record) => record.replace(/^\n+/, ""))
		.filter((record) => record !== "")
		.map((record) => {
			const [hash = "", subject = "", ...rest] = record.split("\n");
			const body = rest.join("\n").trim();
			const parts = SUBJECT.exec(subject);
			return {
				hash,
				type: parts?.[1] ?? null,
				scope: parts?.[2] ?? null,
				summary: parts?.[4] ?? subject,
				body,
				breaking: Boolean(parts?.[3]) || BREAKING_FOOTER.test(body),
			};
		});
}

/** Scopes whose changes nobody running the app sees. */
const UNSEEN_SCOPES = new Set(["test", "release", "evals", "build", "deps", "adr"]);

/** Whether a commit of `type` is one a user of the app could notice. */
const seen = (commit: Commit, type: string): boolean => commit.type === type && !UNSEEN_SCOPES.has(commit.scope ?? "");

export interface Suggestion {
	readonly version: Version;
	/** Which number goes up. */
	readonly part: "major" | "minor" | "patch";
	/** Why, in a sentence a person reads before agreeing. */
	readonly reason: string;
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The version the commits since `from` call for (semver.org). Before 1.0.0
 *  nothing is promised to stay, so a breaking change moves the middle number
 *  as a feature does; from 1.0.0 it moves the first. A release of fixes
 *  alone moves the last. */
export function suggest(from: Version, commits: readonly Commit[]): Suggestion {
	const breaking = commits.filter((commit) => commit.breaking).length;
	const features = commits.filter((commit) => seen(commit, "feat")).length;
	const fixes = commits.filter((commit) => seen(commit, "fix")).length;
	const [major, minor, patch] = from;
	const found = [breaking ? count(breaking, "breaking change") : "", features ? count(features, "feature") : "", fixes ? count(fixes, "fix", "fixes") : ""].filter(Boolean);
	const what = found.length ? found.join(", ") : "nothing a user would see";
	if (breaking && major > 0) return { version: [major + 1, 0, 0], part: "major", reason: `${what}: a breaking change moves the first number` };
	if (breaking) return { version: [major, minor + 1, 0], part: "minor", reason: `${what}: before 1.0.0 a breaking change moves the middle number` };
	if (features) return { version: [major, minor + 1, 0], part: "minor", reason: `${what}: a new feature moves the middle number` };
	return { version: [major, minor, patch + 1], part: "patch", reason: `${what}: with no new feature the last number moves` };
}

/** `asked` as the version to release after `from`, or why it cannot be. */
export function chosen(asked: string, from: Version): Version | string {
	const version = parseVersion(asked);
	if (!version) return `"${asked}" is not a version (0.2.0)`;
	if (!newer(version, from)) return `${versionText(version)} is not later than ${versionText(from)}, the last release`;
	return version;
}

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The notes the commits amount to with no writer: what is new and what is
 *  fixed, each commit's own summary as a line. */
export function draftNotes(commits: readonly Commit[]): string {
	const section = (title: string, type: string): string => {
		const lines = commits.filter((commit) => seen(commit, type)).map((commit) => `- ${sentence(commit.summary)}${commit.breaking ? " (breaking)" : ""}`);
		return lines.length ? `## ${title}\n\n${lines.join("\n")}\n` : "";
	};
	const sections = [section("New", "feat"), section("Fixed", "fix")].filter(Boolean);
	return sections.length ? sections.join("\n") : "Nothing a user of the app would notice changed.\n";
}

/** What a writer of the notes is handed: every commit, whole. */
export function commitsAsText(commits: readonly Commit[]): string {
	return commits.map((commit) => `${commit.type ?? "?"}${commit.scope ? `(${commit.scope})` : ""}${commit.breaking ? "!" : ""}: ${commit.summary}${commit.body ? `\n\n${commit.body}` : ""}`).join("\n\n---\n\n");
}

/** Things that look like ids and are none: `UTF-8` is not a ticket. */
const NOT_IDS = /^(UTF|SHA|ISO|RFC|ES|HTTP|TLS|MD|X|IPV)-/;

/** What notes must not carry to a public page, as the offending texts: a link
 *  that leaves the repository, an absolute path of some machine, an id of
 *  something outside the repository (`ABC-123`), a commit hash. Empty when the
 *  notes are clean. */
export function leaks(notes: string, repository: string): string[] {
	const found: string[] = [];
	for (const [link] of notes.matchAll(/https?:\/\/[^\s)>\]]+/g)) {
		if (!link.startsWith(`https://github.com/${repository}`)) found.push(link);
	}
	for (const [path] of notes.matchAll(/(?<![\w.:/])\/(?:Users|home|private|tmp|var|Volumes)\/[^\s`)]*/g)) found.push(path);
	for (const [id] of notes.matchAll(/\b[A-Z][A-Z0-9]{1,6}-\d{1,6}\b/g)) {
		if (!NOT_IDS.test(id)) found.push(id);
	}
	for (const [hash] of notes.matchAll(/\b[0-9a-f]{7,40}\b/g)) {
		if (/[a-f]/.test(hash) && /\d/.test(hash)) found.push(hash);
	}
	return found;
}

/** The files that carry the app's version, and how each is rewritten. */
export const VERSION_FILES = {
	"package.json": /^(\t"version": ")[^"]+(")/m,
	"src-tauri/Cargo.toml": /^(\[package\]\n(?:.*\n)*?version = ")[^"]+(")/m,
	"src-tauri/Cargo.lock": /(\[\[package\]\]\nname = "piary"\nversion = ")[^"]+(")/,
} as const;

/** `text`, the content of `file`, saying `version`. Throws when the file does
 *  not carry a version where it is looked for: a release with one file left
 *  behind announces itself as older than it is. */
export function withVersion(file: keyof typeof VERSION_FILES, text: string, version: Version): string {
	const place = VERSION_FILES[file];
	if (!place.test(text)) throw new Error(`${file} names no version where one is expected`);
	return text.replace(place, `$1${versionText(version)}$2`);
}

/** What `pre-release` decided and `release` and `publish` hold to. */
export interface Plan {
	readonly version: string;
	readonly tag: string;
	/** The last release's tag, or `null` for the first. */
	readonly previous: string | null;
	/** The commit the notes and the version were decided from. */
	readonly head: string;
	/** The commit that was built, once `release` has run: `head` plus the version. */
	readonly built?: string;
	/** The disk image's file name and SHA-256, once built. */
	readonly image?: { readonly name: string; readonly sha256: string };
}
