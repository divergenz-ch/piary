Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_019CqEPoL7idjcqsnFZGLztG -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_019CqEPoL7idjcqsnFZGLztG error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01HxLQk6dNBum9XEhimeKWwa -->

```json
{
  "command": "cat > src/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple spaces\", () => {\n\tassert.equal(slugify(\"a   b\"), \"a-b\");\n});\n\ntest(\"trims surrounding whitespace\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test src/",
  "timeout": 20
}
```

<!-- pi:result #toolu_01HxLQk6dNBum9XEhimeKWwa error -->

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
✖ src (31.63325ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 35.4975

✖ failing tests:

test at src:1:1
✖ src (31.63325ms)
  'test failed'


Command exited with code 1
```

<!-- pi:tool bash #toolu_012TDB4NKmQDadfQsiPpjHwh -->

```json
{
  "command": "node --test src/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_012TDB4NKmQDadfQsiPpjHwh -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `src/slug.test.js`, using `node:test`, and left `src/slug.js` unchanged. All 4 tests pass when run with `node --test src/slug.test.js`.

The tests check that `slugify`:
- replaces a space with a hyphen,
- collapses runs of spaces into a single hyphen,
- trims whitespace at the start and end,
- lowercases capital letters.

Running `node --test src/` with the directory as the argument fails in this setup, so pass the file path.

<!-- you -->

