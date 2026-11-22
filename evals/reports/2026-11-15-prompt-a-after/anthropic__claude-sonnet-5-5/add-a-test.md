Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01K9KCGTCYfCTfVi82wvAfxP -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01K9KCGTCYfCTfVi82wvAfxP error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01XBdZ4hBFEzxa5ekNrTDpFe -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses multiple whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big  world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ALL CAPS\"), \"all-caps\");\n});\nE\nnode --test 2>&1 | tail -8",
  "timeout": 30
}
```

<!-- pi:result #toolu_01XBdZ4hBFEzxa5ekNrTDpFe -->

```
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 45.204208
```

<!-- pi -->

I added `test/slug.test.js`, which uses `node:test` and has four tests. All four pass with `node --test`, and I left `src/slug.js` unchanged.

The tests check that `slugify`:
- replaces a space with a hyphen
- collapses runs of whitespace into a single hyphen
- trims leading and trailing spaces
- lowercases capital letters, including all-caps input

<!-- you -->

