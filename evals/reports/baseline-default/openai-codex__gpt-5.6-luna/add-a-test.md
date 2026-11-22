Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #call_1109c7c76f094bb9bf20a3615b576086|fc_03e7b2bf9df170c7016aef33cfaf6887d2ac99a60400a81347 -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f -print && printf '\\n--- package ---\\n' && (test -f package.json && read package.json || true) && printf '\\n--- slug ---\\n' && read src/slug.js 2>/dev/null || true",
  "timeout": 10
}
```

<!-- pi:result #call_1109c7c76f094bb9bf20a3615b576086|fc_03e7b2bf9df170c7016aef33cfaf6887d2ac99a60400a81347 -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  7 17:21 .
drwx------@ 5 user  staff  160 Nov  7 17:21 ..
-rw-r--r--@ 1 user  staff   54 Nov  7 17:21 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  7 17:21 src
./package.json
./src/slug.js

--- package ---
/bin/bash: line 0: read: `package.json': not a valid identifier

--- slug ---
```

<!-- pi:tool read #call_e80c07f4ff5147589ea84eb357dc325c|fc_03e7b2bf9df170c7016aef33d1b91487d28be91146cd6ba787 -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 50
}
```

<!-- pi:result #call_e80c07f4ff5147589ea84eb357dc325c|fc_03e7b2bf9df170c7016aef33d1b91487d28be91146cd6ba787 -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool read #call_948beca7a9f5425080bc0ff9007902e3|fc_03e7b2bf9df170c7016aef33d42f2887d2bf948fd0934ccc79 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 50
}
```

<!-- pi:result #call_948beca7a9f5425080bc0ff9007902e3|fc_03e7b2bf9df170c7016aef33d42f2887d2bf948fd0934ccc79 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:tool write #call_ce9b09b96395455281decadfdfc0304e|fc_03e7b2bf9df170c7016aef33d56f1087d29eb769bda779d1da -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces and capital letters\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"  Multiple   Words  \"), \"multiple-words\");\n});\n"
}
```

<!-- pi:result #call_ce9b09b96395455281decadfdfc0304e|fc_03e7b2bf9df170c7016aef33d56f1087d29eb769bda779d1da -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_9d526028e06d4c388dbd84ad69b21c65|fc_03e7b2bf9df170c7016aef33d86a9487d2afcdca09dd364a66 -->

```json
{
  "command": "node --test",
  "timeout": 10
}
```

<!-- pi:result #call_9d526028e06d4c388dbd84ad69b21c65|fc_03e7b2bf9df170c7016aef33d86a9487d2afcdca09dd364a66 -->

```
✔ slugify converts spaces and capital letters (0.905292ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 157.855292
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters.

All tests pass with `node --test`.

<!-- you -->

