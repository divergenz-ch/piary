Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_013wnwqJmzvBs5uMrvxScAFW -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_013wnwqJmzvBs5uMrvxScAFW error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01LTJLZehxa1N6fHCpApPwm5 -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"a   b\\t c\"), \"a-b-c\");\n});\n\ntest(\"trims surrounding whitespace\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test test/",
  "timeout": 20
}
```

<!-- pi:result #toolu_01LTJLZehxa1N6fHCpApPwm5 error -->

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
✖ test (30.71225ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 34.876667

✖ failing tests:

test at test:1:1
✖ test (30.71225ms)
  'test failed'


Command exited with code 1
```

<!-- pi -->

Older invocation style issue; pass the file directly.

<!-- pi:tool bash #toolu_011HW1hFCWWtxUbzg6aK3b4Z -->

```json
{
  "command": "node --test test/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_011HW1hFCWWtxUbzg6aK3b4Z -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `test/slug.test.js`, which uses `node:test` and has four tests for `slugify`. All four pass, and I left `src/slug.js` unchanged.

- **Spaces:** a single space becomes a hyphen, and runs of whitespace (spaces and tabs) collapse into one hyphen.
- **Trimming:** leading and trailing whitespace is removed.
- **Capital letters:** `"Hello World"` and `"ABC"` come out lowercase.

Run it with `node --test test/slug.test.js`. `node --test test/` failed with "Cannot find module" on this Node version (v24), so pass the file path instead.

<!-- you -->

