Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_012H939Fm6kY831yiRemDRGi -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_012H939Fm6kY831yiRemDRGi error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool write #toolu_01ASuyMgBPR9MeqHPdcm5FbB -->

```json
{
  "path": "src/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple spaces into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big  world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ALL CAPS\"), \"all-caps\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01BSPMPKiUsAYxBSgqmzd7pb -->

```json
{
  "command": "node --test src/ 2>&1 | tail -12",
  "timeout": 30
}
```

<!-- pi:result #toolu_01ASuyMgBPR9MeqHPdcm5FbB -->

```
Successfully wrote to src/slug.test.js
```

<!-- pi:result #toolu_01BSPMPKiUsAYxBSgqmzd7pb -->

```
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 39.341917

✖ failing tests:

test at src:1:1
✖ src (34.990292ms)
  'test failed'
```

<!-- pi -->

That failure is probably from how I called the runner (a directory argument), so I'll run the file directly.

<!-- pi:tool bash #toolu_013xa2Rx4DeKCDJgWG7s8nEm -->

```json
{
  "command": "node --test src/slug.test.js 2>&1 | tail -10",
  "timeout": 30
}
```

<!-- pi:result #toolu_013xa2Rx4DeKCDJgWG7s8nEm -->

```
✔ trims leading and trailing spaces (0.049167ms)
✔ lowercases capital letters (0.046416ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.304166
```

<!-- pi -->

I added `src/slug.test.js` with four `node:test` tests, and all four pass. I left `src/slug.js` unchanged.

The tests check that `slugify`:
- replaces spaces with hyphens
- collapses runs of spaces into a single hyphen
- trims leading and trailing spaces
- lowercases capital letters, including all-caps input

Run it with `node --test src/slug.test.js`. Passing the `src/` directory instead (`node --test src/`) failed for me with a bare "test failed" on `src`. I didn't look into why.

<!-- you -->

