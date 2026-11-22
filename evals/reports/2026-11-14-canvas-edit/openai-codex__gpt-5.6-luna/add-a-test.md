Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool budget #call_9eeab922ef8e4783b13691b6c8fb88d2|fc_0034d75c19367def016af836ec9f5887d28f8e7db4c9ba57c5 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the project and add a focused node:test file for slugify."
}
```

<!-- pi:result #call_9eeab922ef8e4783b13691b6c8fb88d2|fc_0034d75c19367def016af836ec9f5887d28f8e7db4c9ba57c5 -->

```
ok — budget 1 min
```

<!-- pi:tool bash #call_ca8a31b7cbfa4005822daf595a7b10eb|fc_0034d75c19367def016af836ee144487d28a285a6184b2a8b9 -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_7fbd643fcd0e4563873ff9d774ba57c4|fc_0034d75c19367def016af836ef322c87d29444e6d93d7e2c3c -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_ca8a31b7cbfa4005822daf595a7b10eb|fc_0034d75c19367def016af836ee144487d28a285a6184b2a8b9 -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov 14 13:24 .
drwx------@ 6 user  staff  192 Nov 14 13:24 ..
-rw-r--r--@ 1 user  staff   54 Nov 14 13:24 package.json
drwxr-xr-x@ 3 user  staff   96 Nov 14 13:24 src
./package.json
./src/slug.js
```

<!-- pi:result #call_7fbd643fcd0e4563873ff9d774ba57c4|fc_0034d75c19367def016af836ef322c87d29444e6d93d7e2c3c -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:tool read #call_95f9cc4b8cbb4848992bb59817c45b66|fc_0034d75c19367def016af836effae487d2971e23b921a028c6 -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:tool bash #call_cae7c53a6c674ffab8e04c29705e9e99|fc_0034d75c19367def016af836f0fd0087d29db3217a9593c58c -->

```json
{
  "command": "find . -maxdepth 3 -type d -print",
  "timeout": 10
}
```

<!-- pi:result #call_95f9cc4b8cbb4848992bb59817c45b66|fc_0034d75c19367def016af836effae487d2971e23b921a028c6 -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:result #call_cae7c53a6c674ffab8e04c29705e9e99|fc_0034d75c19367def016af836f0fd0087d29db3217a9593c58c -->

```
.
./src
```

<!-- pi:tool write #call_a31c31b407eb48118312b9e8bb6add51|fc_0034d75c19367def016af836f1fa8087d2a260e99dc48f07f7 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens and capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"  Multiple   Words  \"), \"multiple-words\");\n});\n"
}
```

<!-- pi:result #call_a31c31b407eb48118312b9e8bb6add51|fc_0034d75c19367def016af836f1fa8087d2a260e99dc48f07f7 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_5d7c83b884e34afab84de260ed1dd5a2|fc_0034d75c19367def016af836f4b2b087d2ad57c921bc28253e -->

```json
{
  "command": "node --test",
  "timeout": 10
}
```

<!-- pi:result #call_5d7c83b884e34afab84de260ed1dd5a2|fc_0034d75c19367def016af836f4b2b087d2ad57c921bc28253e -->

```
✔ slugify converts spaces to hyphens and capital letters to lowercase (0.354625ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.793958
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters. All tests pass.

<!-- you -->

