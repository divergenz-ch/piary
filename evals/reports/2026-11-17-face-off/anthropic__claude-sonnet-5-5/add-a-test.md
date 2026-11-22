Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01PcneritoRZFgahcQEsgV4P -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* src",
  "timeout": 10
}
```

<!-- pi:result #toolu_01PcneritoRZFgahcQEsgV4P error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }
ls: test*: No such file or directory
src:
slug.js


Command exited with code 1
```

<!-- pi:tool bash #toolu_01HBkZDw5CACtWZXVT8y3gg9 -->

```json
{
  "command": "cat > src/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses runs of whitespace\", () => {\n\tassert.equal(slugify(\"a   b \\t c\"), \"a-b-c\");\n});\n\ntest(\"trims surrounding spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test src/",
  "timeout": 30
}
```

<!-- pi:result #toolu_01HBkZDw5CACtWZXVT8y3gg9 error -->

```
node:internal/modules/cjs/loader:1520
  throw err;
  ^

Error: Cannot find module '<scratch>/workspace/src'
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
✖ src (32.083208ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 36.352958

✖ failing tests:

test at src:1:1
✖ src (32.083208ms)
  'test failed'


Command exited with code 1
```

<!-- pi:tool bash #toolu_01SNvMbpUqz5zAqLQC39PMsV -->

```json
{
  "command": "node --test src/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 30
}
```

<!-- pi:result #toolu_01SNvMbpUqz5zAqLQC39PMsV -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `src/slug.test.js`, which has four `node:test` tests for `slugify`, and all four pass. I left `src/slug.js` unchanged.

- **Spaces:** a single space becomes a hyphen, and runs of spaces or tabs collapse into one hyphen.
- **Trimming:** leading and trailing spaces are removed.
- **Capital letters:** mixed-case and all-caps input is lowercased.

Run it with `node --test src/slug.test.js`. Running `node --test src/` fails on this Node version (v24) because it treats `src` as a module path, not a folder.

<!-- you -->

