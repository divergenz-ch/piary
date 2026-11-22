Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01C1gsAACiyM8do7DgpC3iDm -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* src",
  "timeout": 10
}
```

<!-- pi:result #toolu_01C1gsAACiyM8do7DgpC3iDm error -->

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

<!-- pi:tool write #toolu_01B3guE7R3nh8B5kqrqiRUZK -->

```json
{
  "path": "src/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01TtJ8kj93TmmVthnmj3Jf2y -->

```json
{
  "command": "node --test src/",
  "timeout": 20
}
```

<!-- pi:result #toolu_01B3guE7R3nh8B5kqrqiRUZK -->

```
Successfully wrote to src/slug.test.js
```

<!-- pi:result #toolu_01TtJ8kj93TmmVthnmj3Jf2y error -->

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
✖ src (34.171666ms)
ℹ tests 1
ℹ suites 0
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 37.964917

✖ failing tests:

test at src:1:1
✖ src (34.171666ms)
  'test failed'


Command exited with code 1
```

<!-- pi:tool bash #toolu_01NrtXu7ceAhgxyf6phCiyM9 -->

```json
{
  "command": "node --test src/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 20
}
```

<!-- pi:result #toolu_01NrtXu7ceAhgxyf6phCiyM9 -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `src/slug.test.js`, which uses `node:test`. All 4 tests pass when I run `node --test src/slug.test.js`. I left `src/slug.js` as it was.

The tests check that `slugify`:
- replaces a space with a hyphen,
- collapses runs of spaces or tabs into a single hyphen,
- trims leading and trailing spaces,
- lowercases capital letters.

Run it with the file path. `node --test src/` fails here because Node treats `src` as a module path rather than a folder to search.

<!-- you -->

