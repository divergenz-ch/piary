Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01L7p6sHGM1ZmGTNi1y9oC89 -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01L7p6sHGM1ZmGTNi1y9oC89 error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01BwW5SsJbmqSBWfBr4zw16M -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses runs of whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test test/",
  "timeout": 30
}
```

<!-- pi:result #toolu_01BwW5SsJbmqSBWfBr4zw16M error -->

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
✖ test (30.002375ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 34.190208

✖ failing tests:

test at test:1:1
✖ test (30.002375ms)
  'test failed'


Command exited with code 1
```

<!-- pi -->

That failure came from how I called the runner, not from the tests. I'll run the file directly.

<!-- pi:tool bash #toolu_01R6jYaW9UCFMCH4j5aEQrhK -->

```json
{
  "command": "node --test test/slug.test.js 2>&1 | tail -12",
  "timeout": 30
}
```

<!-- pi:result #toolu_01R6jYaW9UCFMCH4j5aEQrhK -->

```
✔ replaces spaces with hyphens (0.39ms)
✔ collapses runs of whitespace into one hyphen (0.063958ms)
✔ trims leading and trailing spaces (0.050583ms)
✔ lowercases capital letters (0.046583ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 42.969417
```

<!-- pi -->

I added `test/slug.test.js`, which uses `node:test`. All 4 tests pass when run with `node --test test/slug.test.js`. I left `src/slug.js` unchanged.

The tests cover:
- spaces becoming hyphens
- runs of whitespace collapsing into one hyphen
- leading and trailing spaces being trimmed
- capital letters being lowercased

Running `node --test test/` failed because this Node version treated `test/` as a module path. Pass the file path instead.

<!-- you -->

