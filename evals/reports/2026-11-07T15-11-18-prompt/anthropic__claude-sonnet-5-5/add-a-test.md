Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01Cj3C2jTWiZB1woryMdwivP -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Cj3C2jTWiZB1woryMdwivP error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool write #toolu_01JGMguu2QdAELcJfpj2DmHy -->

```json
{
  "path": "test/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple spaces into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big  world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01FVJzDv6g1HkS9Xpj6ZiHxs -->

```json
{
  "command": "node --test test/",
  "timeout": 30
}
```

<!-- pi:result #toolu_01JGMguu2QdAELcJfpj2DmHy -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:result #toolu_01FVJzDv6g1HkS9Xpj6ZiHxs error -->

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
✖ test (58.73325ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 67.108

✖ failing tests:

test at test:1:1
✖ test (58.73325ms)
  'test failed'


Command exited with code 1
```

<!-- pi:tool bash #toolu_015SBrL3A7nXXLCAEVoRsHfC -->

```json
{
  "command": "node --test test/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 30
}
```

<!-- pi:result #toolu_015SBrL3A7nXXLCAEVoRsHfC -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` cases for `slugify`. All four pass when I run `node --test test/slug.test.js`. I left `src/slug.js` unchanged.

The cases cover:
- spaces becoming hyphens
- runs of spaces collapsing into a single hyphen
- leading and trailing spaces being trimmed
- capital letters being lowercased

Running `node --test test/` with the directory path failed, because Node tried to load `test` as a module. Pass the file path, as above.

<!-- you -->

