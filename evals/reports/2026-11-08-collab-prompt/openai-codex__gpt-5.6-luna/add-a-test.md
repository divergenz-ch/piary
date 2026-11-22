Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool budget #call_849fc81204bf407d896c5d3efe3b2c8c|fc_000d030966994ef9016aefc32f5ba087d2a021f31d29f4d3ac -->

```json
{
  "minutes": 2,
  "reason": "Inspect the project and existing test conventions, then add and verify one focused node:test file."
}
```

<!-- pi:result #call_849fc81204bf407d896c5d3efe3b2c8c|fc_000d030966994ef9016aefc32f5ba087d2a021f31d29f4d3ac -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_0ec38e855ecf4a8b80345cb8d403abd3|fc_000d030966994ef9016aefc331062487d2b185b3ac8ea9c20f -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_25efcbfeb49a440b94d059da2aa8c44d|fc_000d030966994ef9016aefc333213c87d2847ceddb97e848b5 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_13705058888742f8ac4b37945d0f28f2|fc_000d030966994ef9016aefc333213c87d2b4d98fba79fba3f4 -->

```json
{
  "command": "find . -maxdepth 3 -type f \\( -name '*test*' -o -name '*spec*' -o -name 'package.json' \\) -print",
  "timeout": 10
}
```

<!-- pi:result #call_0ec38e855ecf4a8b80345cb8d403abd3|fc_000d030966994ef9016aefc331062487d2b185b3ac8ea9c20f -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  8 03:32 .
drwx------@ 5 user  staff  160 Nov  8 03:32 ..
-rw-r--r--@ 1 user  staff   54 Nov  8 03:32 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  8 03:32 src
./package.json
./src/slug.js
```

<!-- pi:result #call_25efcbfeb49a440b94d059da2aa8c44d|fc_000d030966994ef9016aefc333213c87d2847ceddb97e848b5 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_13705058888742f8ac4b37945d0f28f2|fc_000d030966994ef9016aefc333213c87d2b4d98fba79fba3f4 -->

```
./package.json
```

<!-- pi:tool read #call_5a654eb9c0ff479d869d413e3e467f44|fc_000d030966994ef9016aefc333ef2c87d297f5bbd2524acc73 -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 100
}
```

<!-- pi:result #call_5a654eb9c0ff479d869d413e3e467f44|fc_000d030966994ef9016aefc333ef2c87d297f5bbd2524acc73 -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_1e3d223156d845e1b40c4f576632e21b|fc_000d030966994ef9016aefc334f05487d2b4e74cbf897daeb9 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens and capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n\tassert.equal(slugify(\"  Multiple   Words  \"), \"multiple-words\");\n});\n"
}
```

<!-- pi:result #call_1e3d223156d845e1b40c4f576632e21b|fc_000d030966994ef9016aefc334f05487d2b4e74cbf897daeb9 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_f65967e44861401498ca961c236f6eed|fc_000d030966994ef9016aefc3379c2887d28a61c52da7a4628c -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:result #call_f65967e44861401498ca961c236f6eed|fc_000d030966994ef9016aefc3379c2887d28a61c52da7a4628c -->

```
✔ slugify converts spaces to hyphens and capital letters to lowercase (1.028166ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 92.79125
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering spaces and capital letters.

Verified with:

```bash
node --test test/slug.test.js
```

1 test passed.

<!-- you -->

