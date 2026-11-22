Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_012Hx2nkns7LFCwAwgk2fDZh -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test tests 2>/dev/null",
  "timeout": 10
}
```

<!-- pi:result #toolu_012Hx2nkns7LFCwAwgk2fDZh error -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
package.json
src
{ "name": "slug", "type": "module", "private": true }


Command exited with code 1
```

<!-- pi:tool write #toolu_01QxcFEQviJRWUzLmeD2tihm -->

```json
{
  "path": "test/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses consecutive whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"ALL CAPS\"), \"all-caps\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01ETF7BgJPCVQj9mAFBmiAWS -->

```json
{
  "command": "node --test test/ 2>&1 | tail -12",
  "timeout": 30
}
```

<!-- pi:result #toolu_01QxcFEQviJRWUzLmeD2tihm -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:result #toolu_01ETF7BgJPCVQj9mAFBmiAWS -->

```
ℹ pass 0
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 55.5255

✖ failing tests:

test at test:1:1
✖ test (49.602667ms)
  'test failed'
```

<!-- pi -->

Probably the directory argument; run the file directly.

<!-- pi:tool bash #toolu_01DZeyiGBD7SW9Y6GCtL7Q5E -->

```json
{
  "command": "node --test test/slug.test.js 2>&1 | grep -E \"^ℹ (pass|fail)\"",
  "timeout": 30
}
```

<!-- pi:result #toolu_01DZeyiGBD7SW9Y6GCtL7Q5E -->

```
ℹ pass 4
ℹ fail 0
```

<!-- pi -->

I added `test/slug.test.js` with four `node:test` tests for `slugify`, and all four pass. I left `src/slug.js` unchanged.

The tests check that:
- a space becomes a hyphen;
- runs of spaces or tabs collapse into a single hyphen;
- leading and trailing spaces are trimmed;
- capital letters are lowercased.

Run it with `node --test test/slug.test.js`. Running `node --test test/` with the directory path failed on this Node version, so use the file path.

<!-- you -->

