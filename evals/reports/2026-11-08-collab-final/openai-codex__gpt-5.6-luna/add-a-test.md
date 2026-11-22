Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool budget #call_927ba4e385bf4b8e8c98e72a7c19cf42|fc_0125dbbca27ede23016af04dc95cbc87d2805d10f976d7775f -->

```json
{
  "minutes": 2,
  "reason": "Inspect the project and slugify implementation, then add and verify a focused node:test file."
}
```

<!-- pi:result #call_927ba4e385bf4b8e8c98e72a7c19cf42|fc_0125dbbca27ede23016af04dc95cbc87d2805d10f976d7775f -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_683ee3f4103f4005aea830c4b7de8e25|fc_0125dbbca27ede23016af04dcab8a887d2a825bf9630cc8841 -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_bce1196a20d247fbb8a3b17b222cc6a7|fc_0125dbbca27ede23016af04dcc3bf487d2bac017805d40b747 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:tool read #call_e5ef149dcaa14e839eada60e0e07cdee|fc_0125dbbca27ede23016af04dcc3bf487d296b0f097dc7e49f9 -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 120
}
```

<!-- pi:result #call_683ee3f4103f4005aea830c4b7de8e25|fc_0125dbbca27ede23016af04dcab8a887d2a825bf9630cc8841 -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  8 13:24 .
drwx------@ 5 user  staff  160 Nov  8 13:24 ..
-rw-r--r--@ 1 user  staff   54 Nov  8 13:24 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  8 13:24 src
./package.json
./src/slug.js
```

<!-- pi:result #call_bce1196a20d247fbb8a3b17b222cc6a7|fc_0125dbbca27ede23016af04dcc3bf487d2bac017805d40b747 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_e5ef149dcaa14e839eada60e0e07cdee|fc_0125dbbca27ede23016af04dcc3bf487d296b0f097dc7e49f9 -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_fea3a16a491943d3a4aab1e5a6ebb3be|fc_0125dbbca27ede23016af04dce236487d294bf59253a154e31 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces and capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"  Multiple   Capital Words  \"), \"multiple-capital-words\");\n});\n"
}
```

<!-- pi:result #call_fea3a16a491943d3a4aab1e5a6ebb3be|fc_0125dbbca27ede23016af04dce236487d294bf59253a154e31 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_430bddf9620e4a0397a188059a651ef2|fc_0125dbbca27ede23016af04dd1594087d28c7591f65df073b4 -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:result #call_430bddf9620e4a0397a188059a651ef2|fc_0125dbbca27ede23016af04dd1594087d28c7591f65df073b4 -->

```
✔ slugify converts spaces and capital letters (0.373125ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.190875
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters. Verified with `node --test`; all tests pass.

<!-- you -->

