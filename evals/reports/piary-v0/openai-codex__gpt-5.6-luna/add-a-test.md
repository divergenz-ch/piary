Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #call_c9d4dc6b551c4e82b9847a6f7dc43069|fc_0e43742ec8b2dc6d016aef340d56c887d2a90228ba7e7a18ac -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort && printf '\\n--- slug ---\\n' && sed -n '1,160p' src/slug.js && printf '\\n--- package ---\\n' && sed -n '1,160p' package.json 2>/dev/null || true",
  "timeout": 10
}
```

<!-- pi:result #call_c9d4dc6b551c4e82b9847a6f7dc43069|fc_0e43742ec8b2dc6d016aef340d56c887d2a90228ba7e7a18ac -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  7 17:22 .
drwx------@ 5 user  staff  160 Nov  7 17:22 ..
-rw-r--r--@ 1 user  staff   54 Nov  7 17:22 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  7 17:22 src
./package.json
./src/slug.js

--- slug ---
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}

--- package ---
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_c442d2aa49c046dcb95c2fd26d611c02|fc_0e43742ec8b2dc6d016aef3412508487d2904c782e2308847d -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces and capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"  Multiple   Capital Letters  \"), \"multiple-capital-letters\");\n});\n"
}
```

<!-- pi:result #call_c442d2aa49c046dcb95c2fd26d611c02|fc_0e43742ec8b2dc6d016aef3412508487d2904c782e2308847d -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_3281c6bf124a4bd49d2c496cd978431a|fc_0e43742ec8b2dc6d016aef3415537887d28a5070f88939187d -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:result #call_3281c6bf124a4bd49d2c496cd978431a|fc_0e43742ec8b2dc6d016aef3415537887d28a5070f88939187d -->

```
✔ slugify converts spaces and capital letters (0.974584ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 78.394375
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters. Verified with `node --test`.

<!-- you -->

