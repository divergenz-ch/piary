Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi -->

I’ll inspect the project structure and existing test conventions, then add only the new `slugify` test file and run the relevant tests.

<!-- pi:tool budget #call_4ede94a1e255458dbc9ff2cda85be65e|fc_0c7cfbda8b4932de016aefc120ecd087d28e8b012cd8addb87 -->

```json
{
  "minutes": 2,
  "reason": "Inspect the repository, add a focused node:test file, and verify it runs."
}
```

<!-- pi:result #call_4ede94a1e255458dbc9ff2cda85be65e|fc_0c7cfbda8b4932de016aefc120ecd087d28e8b012cd8addb87 -->

```
ok — budget 2 min
```

<!-- pi:tool bash #call_db4fc1e96d674b0482670b043ec1b6f5|fc_0c7cfbda8b4932de016aefc12236d487d2828438d2f2388191 -->

```json
{
  "command": "pwd && find . -maxdepth 3 -type f | sort",
  "timeout": 10
}
```

<!-- pi:tool read #call_2f47e6e1ec1b4501992d165522aab777|fc_0c7cfbda8b4932de016aefc12423fc87d29d2b13d0e8eb60b1 -->

```json
{
  "path": "src/slug.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_48f104acc58f4d7984bcd57c2651702f|fc_0c7cfbda8b4932de016aefc124240087d2a8086e9cef02685f -->

```json
{
  "command": "find . -maxdepth 3 -type f \\( -name '*test*' -o -name 'package.json' \\) -print",
  "timeout": 10
}
```

<!-- pi:result #call_db4fc1e96d674b0482670b043ec1b6f5|fc_0c7cfbda8b4932de016aefc12236d487d2828438d2f2388191 -->

```
<scratch>/workspace
./package.json
./src/slug.js
```

<!-- pi:result #call_2f47e6e1ec1b4501992d165522aab777|fc_0c7cfbda8b4932de016aefc12423fc87d29d2b13d0e8eb60b1 -->

```
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}
```

<!-- pi:result #call_48f104acc58f4d7984bcd57c2651702f|fc_0c7cfbda8b4932de016aefc124240087d2a8086e9cef02685f -->

```
./package.json
```

<!-- pi:tool read #call_591e41d8a4e346d6905d76c35bee6a1e|fc_0c7cfbda8b4932de016aefc124fc2c87d2b5b7b9a9bea3a711 -->

```json
{
  "path": "package.json",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_591e41d8a4e346d6905d76c35bee6a1e|fc_0c7cfbda8b4932de016aefc124fc2c87d2b5b7b9a9bea3a711 -->

```
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_289a9b930e774e44a0f9daa618f22c15|fc_0c7cfbda8b4932de016aefc125f3f487d2ae086fc7536a6e24 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens\", () => {\n\tassert.equal(slugify(\"hello world\"), \"hello-world\");\n});\n\ntest(\"slugify converts capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"Hello World\"), \"hello-world\");\n});\n"
}
```

<!-- pi:result #call_289a9b930e774e44a0f9daa618f22c15|fc_0c7cfbda8b4932de016aefc125f3f487d2ae086fc7536a6e24 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_86cf3a11aa9e437693cfd578c0f7c128|fc_0c7cfbda8b4932de016aefc129c17487d281d53766be197634 -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:result #call_86cf3a11aa9e437693cfd578c0f7c128|fc_0c7cfbda8b4932de016aefc129c17487d281d53766be197634 -->

```
✔ slugify converts spaces to hyphens (0.362625ms)
✔ slugify converts capital letters to lowercase (0.062541ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 44.887417
```

<!-- pi -->

Added `test/slug.test.js` using `node:test`, covering:

- Spaces converted to hyphens
- Capital letters converted to lowercase

All tests pass.

<!-- you -->

