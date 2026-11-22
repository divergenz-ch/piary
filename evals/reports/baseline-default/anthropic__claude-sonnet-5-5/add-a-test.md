Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01FUpVjTy3dGYqghNjTXzvh9 -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01FUpVjTy3dGYqghNjTXzvh9 error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool write #toolu_01GYPXw8dS6y8Ff1d6rGbbGX -->

```json
{
  "path": "src/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"HELLO\"), \"hello\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01BNWSZ7cubPvonVeSz77cgN -->

```json
{
  "command": "node --test src/",
  "timeout": 30
}
```

<!-- pi:result #toolu_01GYPXw8dS6y8Ff1d6rGbbGX -->

```
Successfully wrote to src/slug.test.js
```

<!-- pi:result #toolu_01BNWSZ7cubPvonVeSz77cgN error -->

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
✖ src (56.309291ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62.411709

✖ failing tests:

test at src:1:1
✖ src (56.309291ms)
  'test failed'


Command exited with code 1
```

<!-- pi:tool bash #toolu_01WDX5TZq7bs8rErjHXCtBag -->

```json
{
  "command": "node --test src/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 30
}
```

<!-- pi:result #toolu_01WDX5TZq7bs8rErjHXCtBag -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `src/slug.test.js`, which uses `node:test`. All 4 tests pass when I run `node --test src/slug.test.js`. I left `src/slug.js` unchanged.

The tests check that `slugify`:
- replaces a space with a hyphen
- collapses runs of spaces and tabs into a single hyphen
- trims leading and trailing spaces
- lowercases capital letters, both mixed case ("Hello World") and all caps ("HELLO")

Running `node --test src/` fails because Node treats `src` as a module path here. Pass the file path instead.

<!-- you -->

