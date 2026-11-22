Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01RGovSFC4hr9AEdQpD9ow6J -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01RGovSFC4hr9AEdQpD9ow6J error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_01XqFPqDEJd4jzWg1MfDi8QE -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ALL CAPS\"), \"all-caps\");\n});\nE\nnode --test",
  "timeout": 30
}
```

<!-- pi:result #toolu_01XqFPqDEJd4jzWg1MfDi8QE -->

```
✔ replaces spaces with hyphens (0.408833ms)
✔ collapses consecutive whitespace into one hyphen (0.06875ms)
✔ trims leading and trailing spaces (0.0545ms)
✔ lowercases capital letters (0.047416ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.595
```

<!-- pi -->

I added `test/slug.test.js`, which uses `node:test`. All 4 tests pass when run with `node --test`, and I left `src/slug.js` unchanged.

The tests cover:
- **Spaces:** a single space becomes a hyphen, and runs of spaces or tabs collapse into one hyphen.
- **Trimming:** leading and trailing spaces are removed.
- **Capital letters:** mixed-case and all-caps input are lowercased.

<!-- you -->

