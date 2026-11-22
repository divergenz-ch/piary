Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01L58dkHobRin21T3eTn3zvR -->

```json
{
  "command": "cat src/slug.js; ls . test* 2>/dev/null; cat package.json",
  "timeout": 10
}
```

<!-- pi:result #toolu_01L58dkHobRin21T3eTn3zvR -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
.:
package.json
src
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool bash #toolu_01VTPq6iAt5xh4FQT96NqTKn -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test",
  "timeout": 30
}
```

<!-- pi:result #toolu_01VTPq6iAt5xh4FQT96NqTKn -->

```
✔ replaces spaces with hyphens (0.831541ms)
✔ collapses consecutive whitespace into one hyphen (0.087959ms)
✔ trims leading and trailing spaces (0.128667ms)
✔ lowercases capital letters (0.125667ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61.386583
```

<!-- pi -->

I added `test/slug.test.js`, which uses `node:test`. All 4 tests pass when I run `node --test`, and I didn't touch `src/slug.js`.

The tests check that `slugify`:
- replaces spaces with hyphens
- collapses runs of whitespace (spaces and tabs) into a single hyphen
- trims leading and trailing spaces
- lowercases capital letters

<!-- you -->

