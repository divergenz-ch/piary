// Whether a newer Piary exists, as rules: reading GitHub's answer, comparing
// two versions, what a window announces and where its button goes (ADR 0064).
// Pure: the request and the pill are `app/update.ts`'s.

/** The repository whose releases are Piary's (ADR 0062). */
const REPOSITORY = "divergenz-ch/piary";

/** Where the newest release is asked for. GitHub answers with the newest
 *  release that is neither a draft nor a pre-release, and 404 when there is
 *  none. */
export const LATEST_RELEASE = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

/** A version as its three numbers. */
export type Version = readonly [number, number, number];

/** Reads `0.2.0` or `v0.2.0`. Anything else is no version: a pre-release
 *  (`0.2.0-rc.1`) is one nobody is told to move to, and a tag that is not a
 *  version is not compared as one. */
export function parseVersion(text: string): Version | null {
	const parts = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim());
	return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : null;
}

/** A version as it is written and kept: `0.2.0`. */
export const versionText = (version: Version): string => version.join(".");

/** Whether `a` is a later version than `b`. */
export function newer(a: Version, b: Version): boolean {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
	return false;
}

/** The tag of the release GitHub's answer names, or `null` when the text is
 *  not such an answer. */
export function latestTag(answer: string): string | null {
	let read: unknown;
	try {
		read = JSON.parse(answer);
	} catch {
		return null;
	}
	const tag = read && typeof read === "object" ? (read as { tag_name?: unknown }).tag_name : undefined;
	return typeof tag === "string" && parseVersion(tag) ? tag : null;
}

/** What a window knows when it decides whether to say anything. */
export interface UpdateFacts {
	/** The version this app is. */
	current: string;
	/** The newest release tag a check read, if one has. */
	latest: string | null;
	/** The `updateCheck` preference. */
	check: boolean;
	/** The `updateDismissed` preference: a version, or empty. */
	dismissed: string;
}

/** The version to announce, as `0.2.0`, or `null` for nothing: the check is
 *  off, nothing was read, what was read is not later than this app, or the
 *  user dismissed that version. */
export function announced({ current, latest, check, dismissed }: UpdateFacts): string | null {
	if (!check || latest === null) return null;
	const [mine, theirs] = [parseVersion(current), parseVersion(latest)];
	if (!mine || !theirs || !newer(theirs, mine)) return null;
	const text = versionText(theirs);
	return text === dismissed ? null : text;
}

/** The page a version is downloaded from. Built here from the version's
 *  numbers, never taken from an answer: what the button opens is a page of
 *  Piary's own releases whatever was read. */
export function releasePage(version: string): string | null {
	const parsed = parseVersion(version);
	return parsed && `https://github.com/${REPOSITORY}/releases/tag/v${versionText(parsed)}`;
}
