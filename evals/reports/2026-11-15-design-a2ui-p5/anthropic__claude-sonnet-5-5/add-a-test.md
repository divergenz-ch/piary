Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01CRJ2u9QUvd3pGVh8SHE2p2 -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* src",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CRJ2u9QUvd3pGVh8SHE2p2 error -->

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

<!-- pi:tool bash #toolu_01Cp87aFCt18AVEFZpXfRuDW -->

```json
{
  "command": "mkdir test && cat > test/slug.test.js <<'E'\nimport { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace\", () => {\n\tassert.equal(slugify(\"a   b\\t c\"), \"a-b-c\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello  \"), \"hello\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ABC\"), \"abc\");\n});\nE\nnode --test",
  "timeout": 30
}
```

<!-- pi:result #toolu_01Cp87aFCt18AVEFZpXfRuDW -->

```
✔ replaces spaces with hyphens (0.429041ms)
✔ collapses consecutive whitespace (0.064167ms)
✔ trims leading and trailing spaces (0.059333ms)
✔ lowercases capital letters (0.070291ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 51.967416
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` tests for `slugify`. All four pass when run with `node --test`, and I left `src/slug.js` unchanged.

- **Spaces:** a single space becomes a hyphen, and runs of spaces or tabs collapse into one hyphen.
- **Trimming:** leading and trailing spaces are removed.
- **Capitals:** mixed-case and all-caps input is lowercased.

<!-- you -->

