Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #toolu_01D4eH2wUoAuPkApeFcaLzqD -->

```json
{
  "command": "cat src/slug.js; ls; cat package.json; ls test* src",
  "timeout": 10
}
```

<!-- pi:result #toolu_01D4eH2wUoAuPkApeFcaLzqD error -->

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

<!-- pi:tool write #toolu_01JP3G6PfKckC5mFy88VoMtF -->

```json
{
  "path": "src/slug.test.js",
  "content": "import { test } from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"./slug.js\";\n\ntest(\"replaces spaces with hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"collapses runs of whitespace into one hyphen\", () => {\n\tassert.equal(slugify(\"hello   big \\t world\"), \"hello-big-world\");\n});\n\ntest(\"trims leading and trailing spaces\", () => {\n\tassert.equal(slugify(\"  hello world  \"), \"hello-world\");\n});\n\ntest(\"lowercases capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"HELLO\"), \"hello\");\n});\n"
}
```

<!-- pi:tool bash #toolu_01UHmqhRDBo7DUvWJzhuW1nk -->

```json
{
  "command": "node --test 2>&1 | tail -12",
  "timeout": 30
}
```

<!-- pi:result #toolu_01JP3G6PfKckC5mFy88VoMtF -->

```
Successfully wrote to src/slug.test.js
```

<!-- pi:result #toolu_01UHmqhRDBo7DUvWJzhuW1nk -->

```
✔ replaces spaces with hyphens (0.690375ms)
✔ collapses runs of whitespace into one hyphen (0.1065ms)
✔ trims leading and trailing spaces (0.091083ms)
✔ lowercases capital letters (0.074333ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 99.975333
```

<!-- pi -->

I added `src/slug.test.js` with four `node:test` tests, and all four pass when run with `node --test`. I left `src/slug.js` as it was.

The tests cover:
- a single space becoming a hyphen
- runs of spaces and tabs collapsing into one hyphen
- leading and trailing whitespace being trimmed
- capital letters being lowercased, including an all-caps word

<!-- you -->

