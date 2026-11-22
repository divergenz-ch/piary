// Face-format experiment harness, not a test. The `digest` arm: instead of the app's fixed
// rendering, a small model reads the message and the timeline and writes one line for the agent
// that will answer. One Haiku turn per case through the user's own pi, with no conversation;
// what it wrote, how long it took and what it cost are kept in digests/<case>.json, and
// build.ts writes the arm from there, so a run sends the same line every time.
// Usage: node evals/spikes/face-format/digest.ts        (skips a case that has a digest)
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { RpcClient } from "@earendil-works/pi-coding-agent";
import { target } from "../../place.ts";
import { CODES, INTENSITY, filtered, type Threshold, type Timeline } from "./timeline.ts";

const HERE = import.meta.dirname;
const MODEL = "claude-haiku-5-5";
const TURN_TIMEOUT_MS = 2 * 60_000;
const THRESHOLD: Threshold = JSON.parse(readFileSync(join(HERE, "threshold.json"), "utf8"));

const INSTRUCTION = `
## Your only task

You are a step between a camera and an assistant. You get a user's message and a timeline of what the user's face did while reading the assistant's last answer (\`read\`) and while typing the message (\`type\`), as JSON. A unit is a FACS code and an intensity letter (${Object.entries(INTENSITY).map(([l, w]) => `${l} ${w}`).join(", ")}). Codes: ${Object.entries(CODES).map(([c, v]) => `${c} ${v.words}`).join(", ")}.

Write one line, at most 30 words, for the assistant that will answer the message: what the face did that is worth knowing, and at which words of the message. Say movements, not feelings. If nothing in the timeline is worth knowing, write only: nothing. Use no tools. Reply with the line and nothing else.`;

function pi(): { cli: string; root: string } {
	const root = join(homedir(), ".pi/agent/install");
	const version = readFileSync(join(root, "current-version"), "utf8").trim();
	return { cli: join(root, "releases", version, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"), root };
}

async function digest(message: string, timeline: Timeline, promptFile: string): Promise<{ line: string; ms: number; input: number; output: number }> {
	const { cli, root } = pi();
	const client = new RpcClient({ cliPath: cli, cwd: mkdtempSync(join(tmpdir(), "face-digest-")), env: { PI_MANAGED_INSTALL_ROOT: root }, provider: "anthropic", model: MODEL, args: ["--no-session", "--thinking", "off", "--append-system-prompt", promptFile] });
	let timer: NodeJS.Timeout | undefined;
	try {
		await client.start();
		const done = new Promise<void>((resolve, reject) => {
			timer = setTimeout(() => reject(new Error("no answer in time")), TURN_TIMEOUT_MS);
			client.onEvent((e) => {
				if ((e as { type: string }).type === "agent_settled") resolve();
			});
		});
		const started = Date.now();
		await client.prompt(`Message:\n${message || "(nothing typed)"}\n\nTimeline:\n${JSON.stringify(timeline)}`);
		await done;
		const ms = Date.now() - started;
		const messages = (await client.getMessages()) as { role: string; errorMessage?: string; content?: { type: string; text?: string }[]; usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } }[];
		const refused = messages.find((m) => m.errorMessage)?.errorMessage;
		if (refused) throw new Error(refused);
		const replies = messages.filter((m) => m.role === "assistant");
		const line = (replies.at(-1)?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("").trim();
		return { line, ms, input: replies.reduce((n, m) => n + (m.usage ? m.usage.input + m.usage.cacheRead + m.usage.cacheWrite : 0), 0), output: replies.reduce((n, m) => n + (m.usage?.output ?? 0), 0) };
	} finally {
		clearTimeout(timer);
		await client.stop().catch(() => {});
	}
}

mkdirSync(join(HERE, "digests"), { recursive: true });
const promptFile = join(mkdtempSync(join(tmpdir(), "face-digest-")), "prompt.md");
writeFileSync(promptFile, INSTRUCTION);
for (const slug of readdirSync(join(HERE, "cases")).sort()) {
	const dir = join(HERE, "cases", slug);
	const out = join(HERE, "digests", `${slug}.json`);
	if (!existsSync(join(dir, "timeline.json")) || existsSync(out)) continue;
	const message = target(readFileSync(join(dir, "doc.md"), "utf8")).prompt.trim();
	// The digest reads what the app would pass on: the timeline after the fixed filter.
	const timeline = filtered(JSON.parse(readFileSync(join(dir, "timeline.json"), "utf8")) as Timeline, THRESHOLD);
	const result = await digest(message, timeline, promptFile);
	writeFileSync(out, `${JSON.stringify({ model: MODEL, ...result }, null, 1)}\n`);
	process.stdout.write(`${slug}: ${result.ms} ms, ${result.input}+${result.output} tokens: ${result.line}\n`);
}
