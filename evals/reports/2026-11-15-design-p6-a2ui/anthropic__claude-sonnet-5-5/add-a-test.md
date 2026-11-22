Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01Mf4vLJpsxC5AULsxx1X63a -->

```json
{
  "command": "cat src/slug.js; ls . test* 2>/dev/null; cat package.json",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Mf4vLJpsxC5AULsxx1X63a -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
.:
package.json
src
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool bash #toolu_01S7qXyLEyZxTFNX4NXpHNqW -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses runs of whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"a   b\\t c\"), \"a-b-c\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test 2>&1 | tail -8",
  "timeout": 30
}
```

<!-- pi:result #toolu_01S7qXyLEyZxTFNX4NXpHNqW -->

```
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.172708
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` tests, and all four pass when run with `node --test`. I left `src/slug.js` unchanged.

- **Spaces:** a single space becomes a hyphen, and runs of whitespace (including tabs) collapse to one hyphen.
- **Trimming:** leading and trailing spaces are removed.
- **Capital letters:** `"Hello World"` and `"ABC"` come out lowercase.

<!-- you -->

