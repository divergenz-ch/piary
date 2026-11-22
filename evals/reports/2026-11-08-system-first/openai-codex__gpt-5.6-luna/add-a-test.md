Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi -->

I’ll inspect the project layout and existing test conventions, then add and run a focused `node:test` test file without modifying `src/slug.js`.

<!-- pi:tool budget #call_d0afd12944b04e4bbfa82e7b5dee633a|fc_01378ca1e1318ccd016af0678d9c8487d29ad5e79b49703823 -->

```json
{
  "minutes": 2,
  "reason": "Inspect the repository, add one test file matching its conventions, and run the relevant test."
}
```

<!-- pi:result #call_d0afd12944b04e4bbfa82e7b5dee633a|fc_01378ca1e1318ccd016af0678d9c8487d29ad5e79b49703823 -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_dfe8ab8d80bd4aa5a2a0084990c86739|fc_01378ca1e1318ccd016af0678ee69087d2a04dca05f1b576fd -->

```json
{
  "command": "pwd && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_e15230e01b1f4b4aaa16d54ed57d6b63|fc_01378ca1e1318ccd016af06790f88087d2a3322010955dd6e5 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_61da67aa324d44e88092b3cf13d8dc29|fc_01378ca1e1318ccd016af06790f88087d2a7e41f0ded2af83c -->

```json
{
  "command": "find . -maxdepth 2 -type f \\( -name 'package.json' -o -name '*test*' -o -name '*spec*' \\) -print",
  "timeout": 10
}
```

<!-- pi:result #call_dfe8ab8d80bd4aa5a2a0084990c86739|fc_01378ca1e1318ccd016af0678ee69087d2a04dca05f1b576fd -->

```
<scratch>/workspace
./package.json
./src/slug.js
```

<!-- pi:result #call_e15230e01b1f4b4aaa16d54ed57d6b63|fc_01378ca1e1318ccd016af06790f88087d2a3322010955dd6e5 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_61da67aa324d44e88092b3cf13d8dc29|fc_01378ca1e1318ccd016af06790f88087d2a7e41f0ded2af83c -->

```
./package.json
```

<!-- pi:tool read #call_c9831a2132b842b1bce1a52b4e8d7c23|fc_01378ca1e1318ccd016af06791ee9087d28218552e836a2d7d -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_c9831a2132b842b1bce1a52b4e8d7c23|fc_01378ca1e1318ccd016af06791ee9087d28218552e836a2d7d -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_8facd1dafdc942ed82c97ab1bdf7a022|fc_01378ca1e1318ccd016af06792f47c87d28f1a87c56c3a5f0a -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces and capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n});\n"
}
```

<!-- pi:result #call_8facd1dafdc942ed82c97ab1bdf7a022|fc_01378ca1e1318ccd016af06792f47c87d28f1a87c56c3a5f0a -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_c03d5597de094b68bb74a321090c2eb2|fc_01378ca1e1318ccd016af0679557b087d295b4b7908048aed8 -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:tool read #call_1a6332a5e68c47fd89ae448a861d85fd|fc_01378ca1e1318ccd016af06796553887d296ba0edb14422a08 -->

```json
{
  "path": "test/slug.test.js",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_c03d5597de094b68bb74a321090c2eb2|fc_01378ca1e1318ccd016af0679557b087d295b4b7908048aed8 -->

```
✔ slugify converts spaces and capital letters (0.388959ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 48.410042
```

<!-- pi:result #call_1a6332a5e68c47fd89ae448a861d85fd|fc_01378ca1e1318ccd016af06796553887d296ba0edb14422a08 -->

```
import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slug.js";

test("slugify converts spaces and capital letters", () => {
	assert.equal(slugify("Hello World"), "hello-world");
});
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters.

Test passes: `1` passed.

<!-- you -->

