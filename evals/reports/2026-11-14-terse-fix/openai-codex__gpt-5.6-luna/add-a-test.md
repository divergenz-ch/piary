Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool budget #call_8a771b33ff6346c4aa4a141adb46c94c|fc_09b5fd8d51a3a85b016af8711076a087d28a2aa0b6c5f8894d -->

```json
{
  "minutes": 1,
  "reason": "Inspect the project and add a focused node:test file for slugify."
}
```

<!-- pi:result #call_8a771b33ff6346c4aa4a141adb46c94c|fc_09b5fd8d51a3a85b016af8711076a087d28a2aa0b6c5f8894d -->

```
ok — budget 1 min
```

<!-- pi:tool bash #call_e435717d8f1743c09fddf4e9233faaf4|fc_09b5fd8d51a3a85b016af87111c96887d289b22c8be2cabf04 -->

```json
{
  "command": "find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_f011fc627e024e98a9f57e3189dc1363|fc_09b5fd8d51a3a85b016af87113b1e087d29c30e7d9d76b46d5 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_e5e64e032d6f449ea8cb155f44456acd|fc_09b5fd8d51a3a85b016af87113b1e087d29aeb082c155fcac6 -->

```json
{
  "command": "find . -maxdepth 2 -type f \\( -name 'package.json' -o -name '*test*' \\) -print",
  "timeout": 10
}
```

<!-- pi:result #call_e435717d8f1743c09fddf4e9233faaf4|fc_09b5fd8d51a3a85b016af87111c96887d289b22c8be2cabf04 -->

```
./package.json
./src/slug.js
```

<!-- pi:result #call_f011fc627e024e98a9f57e3189dc1363|fc_09b5fd8d51a3a85b016af87113b1e087d29c30e7d9d76b46d5 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_e5e64e032d6f449ea8cb155f44456acd|fc_09b5fd8d51a3a85b016af87113b1e087d29aeb082c155fcac6 -->

```
./package.json
```

<!-- pi:tool read #call_df4d771ea2004eaba1c277b7a8a80e9f|fc_09b5fd8d51a3a85b016af87115c41087d2a12208ecc13ab69c -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_df4d771ea2004eaba1c277b7a8a80e9f|fc_09b5fd8d51a3a85b016af87115c41087d2a12208ecc13ab69c -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_3cc1875704c5415390fb8ac2eedf330b|fc_09b5fd8d51a3a85b016af87116e93887d28f5c50b88b1d0166 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens and capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n});\n"
}
```

<!-- pi:result #call_3cc1875704c5415390fb8ac2eedf330b|fc_09b5fd8d51a3a85b016af87116e93887d28f5c50b88b1d0166 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_76b50943c21d4c739fa5b337794ca29f|fc_09b5fd8d51a3a85b016af8711954dc87d29edfcd636099c269 -->

```json
{
  "command": "node --test",
  "timeout": 10
}
```

<!-- pi:result #call_76b50943c21d4c739fa5b337794ca29f|fc_09b5fd8d51a3a85b016af8711954dc87d29edfcd636099c269 -->

```
✔ slugify converts spaces to hyphens and capital letters to lowercase (0.357084ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 50.074167
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters. Verified with `node --test` — 1 test passed.

<!-- you -->

