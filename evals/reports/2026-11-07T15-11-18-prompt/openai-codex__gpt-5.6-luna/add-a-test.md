Write a new test file for the `slugify` function (it lives in `src/slug.js`; leave that file as it is). Cover spaces and capital letters, and use `node:test`.

<!-- pi:tool bash #call_80462878dd2e40aab6aa262805ce3387|fc_02e64ccd2a0b07b8016aef3f99db0c87d290a8c99b938fa3f4 -->

```json
{
  "command": "ls -la && find . -maxdepth 3 -type f | sort && printf '\\n--- slug ---\\n' && sed -n '1,160p' src/slug.js 2>/dev/null || true && printf '\\n--- package ---\\n' && sed -n '1,200p' package.json 2>/dev/null || true",
  "timeout": 10
}
```

<!-- pi:result #call_80462878dd2e40aab6aa262805ce3387|fc_02e64ccd2a0b07b8016aef3f99db0c87d290a8c99b938fa3f4 -->

```
total 8
drwxr-xr-x@ 4 user  staff  128 Nov  7 18:11 .
drwx------@ 5 user  staff  160 Nov  7 18:11 ..
-rw-r--r--@ 1 user  staff   54 Nov  7 18:11 package.json
drwxr-xr-x@ 3 user  staff   96 Nov  7 18:11 src
./package.json
./src/slug.js

--- slug ---
export function slugify(text) {
	return text.trim().toLowerCase().replace(/\s+/g, "-");
}

--- package ---
{ "name": "slug", "type": "module", "private": true }
```

<!-- pi:tool write #call_6e94d82d57804ffaafc46ed6072c52e7|fc_02e64ccd2a0b07b8016aef3f9e5c2087d29b2a2db6f07ab9c5 -->

```json
{
  "path": "test/slug.test.js",
  "content": "import test from \"node:test\";\nimport assert from \"node:assert/strict\";\nimport { slugify } from \"../src/slug.js\";\n\ntest(\"slugify converts spaces to hyphens and capital letters to lowercase\", () => {\n\tassert.equal(slugify(\"  Hello World  \"), \"hello-world\");\n\tassert.equal(slugify(\"Node JS Testing\"), \"node-js-testing\");\n});\n"
}
```

<!-- pi:result #call_6e94d82d57804ffaafc46ed6072c52e7|fc_02e64ccd2a0b07b8016aef3f9e5c2087d29b2a2db6f07ab9c5 -->

```
Successfully wrote to test/slug.test.js
```

<!-- pi:tool bash #call_4c803d48a8d64e96a9afd241421e1b16|fc_02e64ccd2a0b07b8016aef3fa17bb887d2b1f90f25b3463f18 -->

```json
{
  "command": "node --test test/slug.test.js",
  "timeout": 10
}
```

<!-- pi:result #call_4c803d48a8d64e96a9afd241421e1b16|fc_02e64ccd2a0b07b8016aef3fa17bb887d2b1f90f25b3463f18 -->

```
✔ slugify converts spaces to hyphens and capital letters to lowercase (0.606584ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 77.852166
```

<!-- pi -->

Created `test/slug.test.js` using `node:test`, covering spaces and capital letters. Test passes.

<!-- you -->

