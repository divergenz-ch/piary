Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool budget #call_8624600fb5d241b191c1f02929ccba81|fc_0cfed9a3166874da016aef42123ec087d2a70c767a580bc742 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the project and add a focused node:test file for slugify."
}
```

<!-- pi:result #call_8624600fb5d241b191c1f02929ccba81|fc_0cfed9a3166874da016aef42123ec087d2a70c767a580bc742 -->

```
ok — budget 1 min
```

<!-- pi:tool bash #call_0e47c64f567c4ecea27ba175b619f76f|fc_0cfed9a3166874da016aef4213658887d28837b58980030123 -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_ed26acf7b4324238872af712e468990b|fc_0cfed9a3166874da016aef42155bc087d2914c068d05d0eac0 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_21e70e5c2d6f4cf58296a5977ae85c10|fc_0cfed9a3166874da016aef42155bc087d2a03dc172ade02836 -->

```json
{
  "command": "find . -maxdepth 2 -type f \\( -name 'package.json' -o -name '*test*' \\) -print",
  "timeout": 10
}
```

<!-- pi:result #call_0e47c64f567c4ecea27ba175b619f76f|fc_0cfed9a3166874da016aef4213658887d28837b58980030123 -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  7 18:21 .
drwx------@ 5 user  staff  160 Nov  7 18:21 ..
-rw-r--r--@ 1 user  staff   54 Nov  7 18:21 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  7 18:21 src
./package.json
./src/slug.js
```

<!-- pi:result #call_ed26acf7b4324238872af712e468990b|fc_0cfed9a3166874da016aef42155bc087d2914c068d05d0eac0 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_21e70e5c2d6f4cf58296a5977ae85c10|fc_0cfed9a3166874da016aef42155bc087d2a03dc172ade02836 -->

```
./package.json
```

<!-- pi:tool read #call_6a554dec00ec4f71b61ad217beecd8ae|fc_0cfed9a3166874da016aef42164ec087d2afb6127056ae060f -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_6a554dec00ec4f71b61ad217beecd8ae|fc_0cfed9a3166874da016aef42164ec087d2afb6127056ae060f -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_0f12c98053ee4a6285657707cd1f15a6|fc_0cfed9a3166874da016aef4217b18087d29df71da38191144e -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens and capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n});\n"
}
```

<!-- pi:result #call_0f12c98053ee4a6285657707cd1f15a6|fc_0cfed9a3166874da016aef4217b18087d29df71da38191144e -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_8cb9be6135a24af59aed686ed2d4c236|fc_0cfed9a3166874da016aef421a3c8c87d2a9a742a3219980f9 -->

```json
{
  "command": "node --test",
  "timeout": 10
}
```

<!-- pi:result #call_8cb9be6135a24af59aed686ed2d4c236|fc_0cfed9a3166874da016aef421a3c8c87d2a9a742a3219980f9 -->

```
✔ slugify converts spaces to hyphens and capital letters to lowercase (1.590125ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 211.7375
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters. `node --test` passes.

<!-- you -->

