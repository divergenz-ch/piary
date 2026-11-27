#!/usr/bin/env node
// A release in three commands, each stopping where a person decides.
//
//   make pre-release   reads the commits since the last release, suggests the
//                      version they call for and writes the notes. Changes
//                      nothing tracked and takes seconds.
//   make release       holds the tree to what `pre-release` saw, writes the
//                      version, builds the signed and notarized disk image
//                      (`scripts/release-build.ts`) and uploads it with the
//                      notes as a draft release: a page only the repository's
//                      own people see, which is the preview.
//   make publish       pushes the commit and its tag and makes the draft
//                      public. It builds nothing: what is published is the
//                      file that was looked at.
//
// What is decided by rule is decided by rule (`scripts/release-plan.ts`): the
// version, the checks, the order. The notes' wording is the one part with no
// rule, so `pre-release` hands the commits to `claude -p` when there is one and
// keeps the commits' own summaries when there is not, or when what came back
// carries something a public page must not. The notes are a file, read again
// by `release`: what a person changes in it is what is published.
//
// Nothing outside this machine changes before `publish` but the draft, and
// `release` ends by saying how to take both back.
//
// Run: node scripts/release.ts prepare [--version 0.2.0] [--plain]
//      node scripts/release.ts build [--dry-run]
//      node scripts/release.ts publish [--dry-run] [--prerelease]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { parseVersion, versionText } from "../app/update-check.ts";
import { chosen, commitsAsText, draftNotes, leaks, LOG_FORMAT, parseLog, suggest, VERSION_FILES, withVersion, type Commit, type Plan } from "./release-plan.ts";

const ROOT = new URL("..", import.meta.url).pathname;
/** Git-ignored: a release being prepared is nobody's but the machine's making it. */
const WORK = join(ROOT, "release");
const PLAN = join(WORK, "plan.json");
const NOTES = join(WORK, "notes.md");
const REPOSITORY = "divergenz-ch/piary";
const PRODUCT = "Piary";
const IMAGES = join(ROOT, "src-tauri", "target", "universal-apple-darwin", "release", "bundle", "dmg");
/** How long the notes' writer may take before the commits' own summaries stand. */
const WRITER_TIMEOUT_MS = 180_000;

const say = (text: string): void => void process.stdout.write(`${text}\n`);

function fail(message: string): never {
	process.stderr.write(`release: ${message}\n`);
	process.exit(1);
}

interface Ran {
	readonly ok: boolean;
	readonly out: string;
	readonly err: string;
}

/** A command's output, read and not shown. */
function read(command: string, args: string[], env: Record<string, string> = {}): Ran {
	const run = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
	return { ok: run.status === 0, out: (run.stdout ?? "").trim(), err: (run.stderr ?? "").trim() };
}

const git = (...args: string[]): Ran => read("git", args);

/** A git answer the script cannot go on without. */
function must(...args: string[]): string {
	const ran = git(...args);
	if (!ran.ok) fail(`\`git ${args.join(" ")}\` failed: ${ran.err}`);
	return ran.out;
}

/** A step that changes something: shown and run, or under `--dry-run` only shown. */
function act(dry: boolean, command: string, args: string[], env: Record<string, string> = {}): void {
	const shown = [...Object.entries(env).map(([name, value]) => `${name}=${value}`), command, ...args.map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg))].join(" ");
	say(`${dry ? "would run" : "$"} ${shown}`);
	if (dry) return;
	const run = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
	if (run.status !== 0) fail(`\`${shown}\` failed`);
}

function readPlan(): Plan {
	if (!existsSync(PLAN)) fail("no release is prepared: run `make pre-release` first");
	return JSON.parse(readFileSync(PLAN, "utf8")) as Plan;
}

const writePlan = (plan: Plan): void => writeFileSync(PLAN, `${JSON.stringify(plan, null, "\t")}\n`);

/** The notes as they stand in their file, or a refusal: empty, or carrying
 *  what a public page must not. */
function readNotes(): string {
	const notes = existsSync(NOTES) ? readFileSync(NOTES, "utf8").trim() : "";
	if (!notes) fail(`${NOTES} is empty: run \`make pre-release\` again, or write the notes`);
	const found = leaks(notes, REPOSITORY);
	if (found.length) fail(`the notes carry what a public page must not: ${found.join(", ")}\n  edit ${NOTES}`);
	return notes;
}

/** Everything that would make the step wrong, found before anything is
 *  changed and said together. A dry run lists them and goes on. */
function refuseIf(dry: boolean, refusals: string[]): void {
	if (!refusals.length) return;
	for (const refusal of refusals) process.stderr.write(`release: ${refusal}\n`);
	if (!dry) process.exit(1);
	say("(a dry run goes on; the real one would have stopped here)");
}

/** What is wrong with the checkout for a step that must stand on `commit`. */
function treeRefusals(commit: string, saw: string): string[] {
	const refusals: string[] = [];
	const branch = must("rev-parse", "--abbrev-ref", "HEAD");
	if (branch !== "main") refusals.push(`a release is cut from main, and this is ${branch}`);
	if (must("status", "--porcelain")) refusals.push("the tree has uncommitted changes");
	const head = must("rev-parse", "HEAD");
	if (head !== commit) refusals.push(`HEAD is ${head.slice(0, 9)}, and ${saw} ${commit.slice(0, 9)}: run \`make pre-release\` again`);
	return refusals;
}

/** What is wrong between this checkout and origin for releasing `tag`. */
function remoteRefusals(tag: string): string[] {
	const refusals: string[] = [];
	if (!git("fetch", "--quiet", "origin", "main").ok) return ["origin cannot be reached"];
	if (!git("merge-base", "--is-ancestor", "origin/main", "HEAD").ok) refusals.push("origin's main has commits this checkout lacks");
	if (git("ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`).ok) refusals.push(`origin already has the tag ${tag}`);
	if (git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`).ok) refusals.push(`the tag ${tag} already exists here`);
	if (!read("gh", ["auth", "status"]).ok) refusals.push("`gh` is not signed in to GitHub: `gh auth login`");
	return refusals;
}

/** The release GitHub holds for `tag`, or null. */
function releaseOf(tag: string): { isDraft: boolean; assets: { name: string }[]; url: string } | null {
	const ran = read("gh", ["release", "view", tag, "--repo", REPOSITORY, "--json", "isDraft,assets,url"]);
	return ran.ok ? (JSON.parse(ran.out) as { isDraft: boolean; assets: { name: string }[]; url: string }) : null;
}

// ── pre-release ─────────────────────────────────────────────────────────────

const WRITER_PROMPT = `You write the release notes of ${PRODUCT}, a macOS desktop app: a document that a person and an AI agent both write into.

You are given every commit since the last release. Write what changed for a person who uses the app.

- Markdown. One or two plain sentences on what this release is about, then the sections "## New" and "## Fixed", leaving out an empty one.
- One line per change, in the user's words: what they can now do, or what no longer goes wrong. Merge commits that are one change. Put what matters most first.
- Leave out what a user cannot see: tests, documentation, refactoring, build and release tooling.
- A change that breaks something a user relied on is said as such, first.
- No commit hashes, no ids, no links, no names of people, no file paths, no code identifiers.
- Answer with the notes alone: no preamble, no closing remark, no code fence.`;

/** The notes as a writer words them, or why there are none. It runs away from
 *  the checkout, with no tool, no settings of the user's and no session kept:
 *  what it is told is the prompt above and the commits, and nothing else. */
function writtenNotes(commits: readonly Commit[]): { notes: string } | { why: string } {
	if (!read("claude", ["--version"]).ok) return { why: "no `claude` on PATH" };
	const scratch = mkdtempSync(join(tmpdir(), "piary-release-"));
	try {
		const prompt = join(scratch, "prompt.txt");
		writeFileSync(prompt, WRITER_PROMPT);
		const args = ["-p", "--system-prompt-file", prompt, "--tools", "", "--strict-mcp-config", "--setting-sources", "project", "--permission-mode", "dontAsk", "--no-session-persistence"];
		const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("APPLE_")));
		const run = spawnSync("claude", args, { cwd: scratch, input: commitsAsText(commits), encoding: "utf8", env, timeout: WRITER_TIMEOUT_MS });
		if (run.error) return { why: `\`claude\` did not answer: ${run.error.message}` };
		if (run.status !== 0) return { why: `\`claude\` failed: ${(run.stderr || run.stdout).trim().split("\n").at(-1) ?? ""}` };
		const notes = run.stdout.trim();
		if (!notes) return { why: "`claude` answered nothing" };
		const found = leaks(notes, REPOSITORY);
		if (found.length) return { why: `what \`claude\` wrote carries ${found.join(", ")}` };
		return { notes: `${notes}\n` };
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

function prepare(argv: string[]): void {
	const { values } = parseArgs({ args: argv, options: { version: { type: "string" }, plain: { type: "boolean", default: false } } });

	const described = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "HEAD");
	const previous = described.ok ? described.out : null;
	const from = previous ? parseVersion(previous) : ([0, 0, 0] as const);
	if (!from) fail(`the last tag, ${previous}, is not a version`);
	const log = must("log", "-z", `--format=${LOG_FORMAT}`, previous ? `${previous}..HEAD` : "HEAD");
	const commits = parseLog(log);
	if (!commits.length) fail(`nothing was committed since ${previous}`);

	const suggestion = suggest(from, commits);
	const asked = values.version ? chosen(values.version, from) : suggestion.version;
	if (typeof asked === "string") fail(asked);
	const version = versionText(asked);
	const tag = `v${version}`;
	const head = must("rev-parse", "HEAD");

	const written = values.plain ? { why: "asked for with --plain" } : writtenNotes(commits);
	const notes = "notes" in written ? written.notes : draftNotes(commits);
	mkdirSync(WORK, { recursive: true });
	writeFileSync(NOTES, notes);
	writePlan({ version, tag, previous, head });

	const branch = must("rev-parse", "--abbrev-ref", "HEAD");
	say(`${PRODUCT} ${version}   (tag ${tag})`);
	say(`  since ${previous ?? "the first commit"}: ${commits.length} commits, at ${head.slice(0, 9)} on ${branch}`);
	say(`  suggested: ${versionText(suggestion.version)}, ${suggestion.reason}`);
	if (values.version) say(`  chosen:    ${version}, as asked`);
	say(`  notes:     ${"notes" in written ? "written by `claude` from the commits" : `the commits' own summaries (${written.why})`}`);
	say("");
	say(`── ${NOTES} ──`);
	say(notes.trimEnd());
	say("──");
	say("");
	if (branch !== "main") say("This is not main: `make release` will refuse it.");
	say("Edit the notes file as you like: it is read again when the release is built.");
	say("Another version: make pre-release VERSION=x.y.z");
	say("Next: make release   (DRY=1 to see what it would do)");
}

// ── release ─────────────────────────────────────────────────────────────────

/** The variables a signed and notarized build is made with (docs/packaging.md §4). */
function signingRefusals(): string[] {
	const has = (...names: string[]): boolean => names.every((name) => Boolean(process.env[name]));
	const refusals: string[] = [];
	if (!has("APPLE_SIGNING_IDENTITY")) refusals.push("APPLE_SIGNING_IDENTITY is not set: a release is signed (docs/packaging.md §4)");
	if (!has("APPLE_ID", "APPLE_PASSWORD", "APPLE_TEAM_ID") && !has("APPLE_API_KEY", "APPLE_API_ISSUER")) refusals.push("no notarization credentials are set: a release is notarized (docs/packaging.md §4)");
	return refusals;
}

function build(argv: string[]): void {
	const { values } = parseArgs({ args: argv, options: { "dry-run": { type: "boolean", default: false } } });
	const dry = values["dry-run"];
	const plan = readPlan();
	const version = parseVersion(plan.version);
	if (!version) fail(`the plan's version, ${plan.version}, is not one`);
	if (plan.built) fail(`${plan.tag} is already built: \`make publish\`, or \`make pre-release\` to start over`);
	readNotes();

	const refusals = [...treeRefusals(plan.head, "the release was prepared at"), ...remoteRefusals(plan.tag), ...signingRefusals()];
	if (releaseOf(plan.tag)) refusals.push(`GitHub already holds a release for ${plan.tag}`);
	refuseIf(dry, refusals);

	const files = Object.keys(VERSION_FILES) as (keyof typeof VERSION_FILES)[];
	for (const file of files) {
		const text = withVersion(file, readFileSync(join(ROOT, file), "utf8"), version);
		say(`${dry ? "would write" : "writing"} ${plan.version} into ${file}`);
		if (!dry) writeFileSync(join(ROOT, file), text);
	}
	act(dry, "node", ["--test", "tests/contract/version.test.ts"]);
	act(dry, "git", ["add", ...files]);
	// No zone of the machine's in the commit or, at `publish`, the tag.
	act(dry, "git", ["commit", "--quiet", "-m", `chore(release): ${PRODUCT} ${plan.version}`], { TZ: "UTC" });
	act(dry, "node", ["scripts/release-build.ts", "--dmg", "--notarized"]);

	const name = `${PRODUCT}_${plan.version}_universal.dmg`;
	const image = join(IMAGES, name);
	act(dry, "gh", ["release", "create", plan.tag, image, "--repo", REPOSITORY, "--draft", "--title", `${PRODUCT} ${plan.version}`, "--notes-file", NOTES]);
	if (dry) return say("\nA dry run: nothing was changed.");

	const built = must("rev-parse", "HEAD");
	writePlan({ ...plan, built, image: { name, sha256: createHash("sha256").update(readFileSync(image)).digest("hex") } });
	say("");
	say(`${PRODUCT} ${plan.version} is built and waits as a draft: ${releaseOf(plan.tag)?.url ?? `https://github.com/${REPOSITORY}/releases`}`);
	say(`  the disk image: ${image}`);
	say("  Open the draft's page to read it as it will be published, and the disk image to try the app.");
	say("  Nothing is public, and the version's commit is on this machine only.");
	say("");
	say("Next: make publish   (DRY=1 to see what it would do)");
	say(`To take it back: gh release delete ${plan.tag} --repo ${REPOSITORY} --yes && git reset --hard ${plan.head.slice(0, 9)} && rm -r release`);
}

// ── publish ─────────────────────────────────────────────────────────────────

function publish(argv: string[]): void {
	const { values } = parseArgs({ args: argv, options: { "dry-run": { type: "boolean", default: false }, prerelease: { type: "boolean", default: false } } });
	const dry = values["dry-run"];
	const plan = readPlan();
	if (!plan.built || !plan.image) fail(`${plan.tag} is not built: run \`make release\` first`);

	const refusals = [...treeRefusals(plan.built, "the release was built at"), ...remoteRefusals(plan.tag)];
	const draft = releaseOf(plan.tag);
	if (!draft) refusals.push(`GitHub holds no draft for ${plan.tag}: run \`make release\``);
	else if (!draft.isDraft) refusals.push(`${plan.tag} is already published`);
	else if (!draft.assets.some((asset) => asset.name === plan.image?.name)) refusals.push(`the draft does not hold ${plan.image.name}`);
	const local = join(IMAGES, plan.image.name);
	if (existsSync(local) && createHash("sha256").update(readFileSync(local)).digest("hex") !== plan.image.sha256) {
		refusals.push(`${plan.image.name} was rebuilt since the draft was uploaded: what was looked at here is not what the draft holds`);
	}
	refuseIf(dry, refusals);

	// The tag before the release: a release published with no tag gets one
	// from GitHub, unannotated and wherever main stands then.
	act(dry, "git", ["push", "origin", "main"]);
	act(dry, "git", ["tag", "-a", plan.tag, "-m", `${PRODUCT} ${plan.version}`, plan.built], { TZ: "UTC" });
	act(dry, "git", ["push", "origin", plan.tag]);
	if (!dry) {
		const remote = git("ls-remote", "origin", `refs/tags/${plan.tag}^{}`).out.split(/\s/)[0];
		if (remote !== plan.built) fail(`origin's ${plan.tag} is ${remote || "missing"}, and the build is ${plan.built}: nothing was published`);
	}
	act(dry, "gh", ["release", "edit", plan.tag, "--repo", REPOSITORY, "--draft=false", ...(values.prerelease ? ["--prerelease"] : ["--latest"])]);
	if (dry) return say("\nA dry run: nothing was changed.");

	rmSync(WORK, { recursive: true, force: true });
	say("");
	say(`${PRODUCT} ${plan.version} is published: https://github.com/${REPOSITORY}/releases/tag/${plan.tag}`);
	if (values.prerelease) say("  As a pre-release: the app announces it to nobody.");
}

const [command, ...rest] = process.argv.slice(2);
if (command === "prepare") prepare(rest);
else if (command === "build") build(rest);
else if (command === "publish") publish(rest);
else fail("which step? prepare, build or publish (see the Makefile)");
