Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01Ku21CJsUYm2Mn6u1JV7awH -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Ku21CJsUYm2Mn6u1JV7awH error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01YBVyp38j6KkSk4fNrNBueC -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"a   b\\t c\"), \"a-b-c\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test test/",
  "timeout": 20
}
```

<!-- pi:result #toolu_01YBVyp38j6KkSk4fNrNBueC error -->

```
node:internal/modules/cjs/loader:1520
  throw err;
  ^

Error: Cannot find module '<scratch>/workspace/test'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1071:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1095:10)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1122:12)
    at Module._load (node:internal/modules/cjs/loader:1294:5)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v24.18.0
✖ test (31.818833ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36.113292

✖ failing tests:

test at test:1:1
✖ test (31.818833ms)
  'test failed'


Command exited with code 1
```

<!-- pi -->

Node 24 treats the directory as a file path, so I'll pass the file directly.

<!-- pi:tool bash #toolu_01JTLgjzupRECBmpqos2R4cE -->

```json
{
  "command": "node --test test/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01JTLgjzupRECBmpqos2R4cE -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` cases for `slugify`, and all four pass. I left `src/slug.js` unchanged.

- **Spaces:** a single space becomes a hyphen, runs of whitespace collapse to one hyphen, and leading and trailing spaces are trimmed.
- **Capitals:** mixed-case and all-caps input is lowercased.

Run it with `node --test test/slug.test.js`. `node --test test/` fails on Node 24 because it treats `test` as a file path, not a directory.

<!-- you -->

