Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01Gh8MTqsEEcLDySBJtvjK7K -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Gh8MTqsEEcLDySBJtvjK7K error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool bash #toolu_0154hXk5VnZ9W56fSEVSqHUP -->

```json
{
  "command": "mkdir -p test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big  world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ALL CAPS\"), \"all-caps\");\n});\nE\nnode --test",
  "timeout": 30
}
```

<!-- pi:result #toolu_0154hXk5VnZ9W56fSEVSqHUP -->

```
✔ replaces spaces with hyphens (0.512625ms)
✔ collapses consecutive whitespace into one hyphen (0.1045ms)
✔ trims leading and trailing spaces (0.065166ms)
✔ lowercases capital letters (0.05525ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.101584
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` tests, and all four pass under `node --test`. I didn't touch `src/slug.js`.

The tests cover:
- **Spaces:** a single space becomes a hyphen, and runs of spaces collapse into one hyphen.
- **Trimming:** leading and trailing spaces are removed.
- **Capital letters:** mixed case and all-caps input are lowercased.

<!-- you -->

