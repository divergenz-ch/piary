// The arithmetic behind Piary's `calc` and `series` A2UI functions. The basic
// catalog's functions format and check values but compute none, so a surface
// that derives a figure from its data model — a balance from a slider's rate —
// names a formula over its variables, and the renderer evaluates it. A formula
// is parsed into a tree and walked, never run as code: numbers, named
// variables, + - * / % ^, comparisons, and the functions below.
//
// `pi-extension/a2ui-expr.ts` keeps a copy, because the `view` tool refuses a
// payload whose formula would fail while the agent can still fix it;
// tests/contract/a2ui-copies.test.ts holds the two to one behaviour.

type Node =
	| { kind: "num"; value: number }
	| { kind: "name"; name: string }
	| { kind: "neg"; arg: Node }
	| { kind: "bin"; op: string; left: Node; right: Node }
	| { kind: "call"; fn: string; args: Node[] };

/** The functions a formula may call, with how many arguments each takes. */
const FUNCTIONS: Record<string, { min: number; max: number; run: (...a: number[]) => number }> = {
	abs: { min: 1, max: 1, run: Math.abs },
	ceil: { min: 1, max: 1, run: Math.ceil },
	floor: { min: 1, max: 1, run: Math.floor },
	round: {
		min: 1,
		max: 2,
		run: (x, digits = 0) => {
			const f = 10 ** digits;
			return Math.round((x + Number.EPSILON) * f) / f;
		},
	},
	min: { min: 1, max: Infinity, run: Math.min },
	max: { min: 1, max: Infinity, run: Math.max },
	pow: { min: 2, max: 2, run: Math.pow },
	sqrt: { min: 1, max: 1, run: Math.sqrt },
	exp: { min: 1, max: 1, run: Math.exp },
	log: { min: 1, max: 1, run: Math.log },
	log10: { min: 1, max: 1, run: Math.log10 },
	if: { min: 3, max: 3, run: (c, a, b) => (c ? a : b) },
};

const BINARY: Record<string, (a: number, b: number) => number> = {
	"+": (a, b) => a + b,
	"-": (a, b) => a - b,
	"*": (a, b) => a * b,
	"/": (a, b) => a / b,
	"%": (a, b) => a % b,
	"^": (a, b) => a ** b,
	"<": (a, b) => +(a < b),
	"<=": (a, b) => +(a <= b),
	">": (a, b) => +(a > b),
	">=": (a, b) => +(a >= b),
	"==": (a, b) => +(a === b),
	"!=": (a, b) => +(a !== b),
};

/** The most rows a series makes, so a range bound to a slider cannot run away. */
const MAX_ROWS = 1000;

const TOKEN = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|[-+*/%^(),<>]))/y;

class ParseError extends Error {}

/** A formula as a tree, or what is wrong with it — phrased to follow the formula, quoted. */
export function parseExpression(source: string): { ast: Node } | { problem: string } {
	const tokens: string[] = [];
	TOKEN.lastIndex = 0;
	let at = 0;
	while (at < source.length) {
		if (!source.slice(at).trim()) break;
		TOKEN.lastIndex = at;
		const m = TOKEN.exec(source);
		if (!m) return { problem: `has "${source.slice(at).trim()[0]}" where a number, a name or an operator should be` };
		tokens.push(m[1] ?? m[2] ?? m[3]!);
		at = TOKEN.lastIndex;
	}
	let i = 0;
	const peek = () => tokens[i];
	const next = () => tokens[i++];
	const expect = (token: string, problem: string) => {
		if (peek() !== token) throw new ParseError(problem);
		i++;
	};
	const comparison = (): Node => {
		let left = additive();
		while (["<", "<=", ">", ">=", "==", "!="].includes(peek() ?? "")) left = { kind: "bin", op: next()!, left, right: additive() };
		return left;
	};
	const additive = (): Node => {
		let left = multiplicative();
		while (peek() === "+" || peek() === "-") left = { kind: "bin", op: next()!, left, right: multiplicative() };
		return left;
	};
	const multiplicative = (): Node => {
		let left = unary();
		while (peek() === "*" || peek() === "/" || peek() === "%") left = { kind: "bin", op: next()!, left, right: unary() };
		return left;
	};
	const unary = (): Node => {
		if (peek() === "-") {
			next();
			return { kind: "neg", arg: unary() };
		}
		if (peek() === "+") {
			next();
			return unary();
		}
		return power();
	};
	const power = (): Node => {
		const base = primary();
		if (peek() !== "^") return base;
		next();
		return { kind: "bin", op: "^", left: base, right: unary() };
	};
	const primary = (): Node => {
		const token = next();
		if (token === undefined) throw new ParseError("stops at the end of the formula, where a value should be");
		if (/^[\d.]/.test(token)) return { kind: "num", value: Number(token) };
		if (token === "(") {
			const inner = comparison();
			expect(")", "is missing a closing parenthesis");
			return inner;
		}
		if (/^[A-Za-z_]/.test(token)) {
			if (peek() !== "(") return { kind: "name", name: token };
			const fn = FUNCTIONS[token];
			if (!fn) throw new ParseError(`calls ${token}, which is not a function a formula has (${Object.keys(FUNCTIONS).join(", ")})`);
			next();
			const args: Node[] = [];
			if (peek() !== ")") {
				args.push(comparison());
				while (peek() === ",") {
					next();
					args.push(comparison());
				}
			}
			expect(")", "is missing a closing parenthesis");
			if (args.length < fn.min || args.length > fn.max) {
				const takes = fn.max === Infinity ? `at least ${fn.min}` : fn.min === fn.max ? `${fn.min}` : `${fn.min} to ${fn.max}`;
				throw new ParseError(`calls ${token} with ${args.length} arguments; it takes ${takes}`);
			}
			return { kind: "call", fn: token, args };
		}
		throw new ParseError(`has "${token}" where a value should be`);
	};
	try {
		if (!tokens.length) return { problem: "is empty" };
		const ast = comparison();
		if (i < tokens.length) throw new ParseError(`has "${tokens[i]}" where an operator or the end should be`);
		return { ast };
	} catch (error) {
		if (error instanceof ParseError) return { problem: error.message };
		throw error;
	}
}

/** The variable names a formula reads. */
function namesIn(node: Node, into = new Set<string>()): Set<string> {
	if (node.kind === "name") into.add(node.name);
	else if (node.kind === "neg") namesIn(node.arg, into);
	else if (node.kind === "bin") namesIn(node.right, namesIn(node.left, into));
	else if (node.kind === "call") for (const arg of node.args) namesIn(arg, into);
	return into;
}

const toNumber = (value: unknown): number =>
	typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "boolean" ? +value : NaN;

function evaluate(node: Node, vars: Readonly<Record<string, number>>): number {
	switch (node.kind) {
		case "num":
			return node.value;
		case "name":
			return vars[node.name] ?? NaN;
		case "neg":
			return -evaluate(node.arg, vars);
		case "bin":
			return BINARY[node.op]!(evaluate(node.left, vars), evaluate(node.right, vars));
		case "call":
			return FUNCTIONS[node.fn]!.run(...node.args.map((arg) => evaluate(arg, vars)));
	}
}

const numbers = (vars: Readonly<Record<string, unknown>> = {}) =>
	Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, toNumber(v)]));

/** A formula's value over `vars`; NaN when it does not parse or a value is not a number. */
export function calc(expr: string, vars?: Readonly<Record<string, unknown>>): number {
	const parsed = parseExpression(expr);
	return "ast" in parsed ? evaluate(parsed.ast, numbers(vars)) : NaN;
}

export interface SeriesArgs {
	from: unknown;
	to: unknown;
	step?: unknown;
	/** The name each row's step is read by, and the column it is written to. */
	index: string;
	/** Column name → formula, in order: a column may read the ones before it, and `prev_<column>` the previous row's. */
	columns: Readonly<Record<string, string>>;
	/** The first row's values of the columns named, which `prev_<column>` reads on the second. */
	start?: Readonly<Record<string, unknown>>;
	vars?: Readonly<Record<string, unknown>>;
}

/** The name a formula reads a column's value in the previous row by. */
const PREV = "prev_";

/**
 * One row per step from `from` to `to`, each column a formula over the row so
 * far, the previous row (`prev_cash`) and the variables. A column named in
 * `start` takes that value on the first row instead of its formula — a running
 * balance, which reads last month's, starts somewhere.
 */
export function series(args: SeriesArgs): Record<string, number>[] {
	const from = toNumber(args.from);
	const to = toNumber(args.to);
	const step = args.step === undefined ? 1 : toNumber(args.step);
	if (![from, to, step].every(Number.isFinite) || step <= 0) return [];
	const columns = Object.entries(args.columns).map(([name, expr]) => {
		const parsed = parseExpression(expr);
		return [name, "ast" in parsed ? parsed.ast : null] as const;
	});
	const vars = numbers(args.vars);
	const start = numbers(args.start);
	const rows: Record<string, number>[] = [];
	let prev: Record<string, number> = Object.fromEntries(Object.entries(start).map(([k, v]) => [PREV + k, v]));
	// Counted in steps, not summed, so 0.1 steps do not drift past `to`.
	for (let n = 0; rows.length < MAX_ROWS; n++) {
		const at = from + n * step;
		if (at > to + step * 1e-9) break;
		const row: Record<string, number> = { [args.index]: Math.round(at * 1e9) / 1e9 };
		for (const [name, ast] of columns)
			row[name] = n === 0 && name in start ? start[name]! : ast ? evaluate(ast, { ...vars, ...prev, ...row }) : NaN;
		rows.push(row);
		prev = Object.fromEntries(Object.entries(row).map(([k, v]) => [PREV + k, v]));
	}
	return rows;
}

export interface ExpressionProblem {
	code: "EXPRESSION_INVALID";
	/** A JSON pointer into the payload, as the processor's refusals carry. */
	path: string;
	message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const pointer = (parts: readonly (string | number)[]) =>
	parts.map((p) => `/${String(p).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");

/**
 * Every `calc` and `series` formula in a payload that would not evaluate:
 * one that does not parse, or names a variable the call does not give it.
 * The processor checks a call's arguments against their schema, but a formula
 * is a string to it, so without this a broken one renders as a blank figure.
 */
export function expressionProblems(payload: unknown): ExpressionProblem[] {
	const found: ExpressionProblem[] = [];
	const check = (fn: string, expr: unknown, known: readonly string[], path: (string | number)[], what: string) => {
		if (typeof expr !== "string") return;
		const parsed = parseExpression(expr);
		let reason: string | undefined;
		if ("problem" in parsed) reason = parsed.problem;
		else {
			const unknown = [...namesIn(parsed.ast)].filter((name) => !known.includes(name));
			if (unknown.length)
				reason = `names ${unknown.join(", ")}, which ${unknown.length > 1 ? "are" : "is"} not ${what} (${known.join(", ") || "none given"})`;
		}
		if (reason) found.push({ code: "EXPRESSION_INVALID", path: pointer(path), message: `${fn}: "${expr}" ${reason}.` });
	};
	const walk = (value: unknown, path: (string | number)[]) => {
		if (Array.isArray(value)) return value.forEach((item, index) => walk(item, [...path, index]));
		if (!isRecord(value)) return;
		const fn = value["@call"] ?? value.call;
		const args = value.args;
		if ((fn === "calc" || fn === "series") && isRecord(args)) {
			const vars = isRecord(args.vars) ? Object.keys(args.vars) : [];
			if (fn === "calc") check(fn, args.expr, vars, [...path, "args", "expr"], "one of its vars");
			else if (isRecord(args.columns)) {
				const index = typeof args.index === "string" ? [args.index] : [];
				const started = isRecord(args.start) ? Object.keys(args.start) : [];
				const previous = [...index, ...Object.keys(args.columns)].map((name) => PREV + name);
				const known = [...vars, ...index, ...previous];
				for (const [name, expr] of Object.entries(args.columns)) {
					const at = [...path, "args", "columns", name];
					check(fn, expr, known, at, "its index, an earlier column, prev_ of a column or one of its vars");
					known.push(name);
					// The first row has no previous one: a column computed there may
					// read prev_ only of what `start` gives.
					const parsed = typeof expr === "string" && !started.includes(name) ? parseExpression(expr) : undefined;
					const early = parsed && "ast" in parsed ? [...namesIn(parsed.ast)].filter((n) => previous.includes(n) && !started.includes(n.slice(PREV.length))) : [];
					if (early.length)
						found.push({
							code: "EXPRESSION_INVALID",
							path: pointer(at),
							message: `${fn}: "${expr}" reads ${early.join(", ")} on the first row, where there is no previous row: give ${early.map((n) => n.slice(PREV.length)).join(", ")} a value in start.`,
						});
				}
			}
		}
		for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
	};
	walk(payload, []);
	return found;
}
