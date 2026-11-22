In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool budget #call_d1ff1bf0bd06496a8c03fc74c658b453|fc_04b7549b3f65ea42016aefc362f78c87d29655eaf4ee8aee34 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the symbol and caller, make the two renames, then verify with a search/test."
}
```

<!-- pi:result #call_d1ff1bf0bd06496a8c03fc74c658b453|fc_04b7549b3f65ea42016aefc362f78c87d29655eaf4ee8aee34 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_4bdac556dd4546cf918578df0fa41eb6|fc_04b7549b3f65ea42016aefc364501087d2bd27f5c3fb6b3b3b -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_7a6d48c15fcd430cae40db4cc11095fe|fc_04b7549b3f65ea42016aefc365526087d2ad9991ccb3d8599f -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_4bdac556dd4546cf918578df0fa41eb6|fc_04b7549b3f65ea42016aefc364501087d2bd27f5c3fb6b3b3b -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_7a6d48c15fcd430cae40db4cc11095fe|fc_04b7549b3f65ea42016aefc365526087d2ad9991ccb3d8599f -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool edit #call_13edf4ff4c434f64817746ec55a900b3|fc_04b7549b3f65ea42016aefc3662e3087d291db0653cba8a040 -->

```json
{
  "path": "lib/strings.js",
  "edits": [
    {
      "oldText": "capitalise",
      "newText": "capitalize"
    }
  ]
}
```

<!-- pi:result #call_13edf4ff4c434f64817746ec55a900b3|fc_04b7549b3f65ea42016aefc3662e3087d291db0653cba8a040 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_85dc9497345e4df192250258308791a9|fc_04b7549b3f65ea42016aefc3675e1887d2bbb9499327c1dd28 -->

```json
{
  "path": "lib/title.js",
  "edits": [
    {
      "oldText": "capitalise",
      "newText": "capitalize"
    }
  ]
}
```

<!-- pi:result #call_85dc9497345e4df192250258308791a9|fc_04b7549b3f65ea42016aefc3675e1887d2bbb9499327c1dd28 error -->

```
Found 2 occurrences of the text in lib/title.js. The text must be unique. Please provide more context to make it unique.
```

<!-- pi:tool edit #call_c8efb3747c5f402ea7ce5022d0e1738c|fc_04b7549b3f65ea42016aefc368d4d487d29345bc929c80c354 -->

```json
{
  "path": "lib/title.js",
  "edits": [
    {
      "oldText": "import { capitalise } from \"./strings.js\";",
      "newText": "import { capitalize } from \"./strings.js\";"
    },
    {
      "oldText": "words.map(capitalise)",
      "newText": "words.map(capitalize)"
    }
  ]
}
```

<!-- pi:result #call_c8efb3747c5f402ea7ce5022d0e1738c|fc_04b7549b3f65ea42016aefc368d4d487d29345bc929c80c354 -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_2b98a3aba1294cbb8cf25579fda7fcae|fc_04b7549b3f65ea42016aefc36b1ab487d28095dc4aea044bbb -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" lib && git diff -- lib/strings.js lib/title.js",
  "timeout": 10
}
```

<!-- pi:result #call_2b98a3aba1294cbb8cf25579fda7fcae|fc_04b7549b3f65ea42016aefc36b1ab487d28095dc4aea044bbb error -->

```
lib/strings.js:1:export function capitalize(word) {
lib/title.js:1:import { capitalize } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
diff --git a/lib/strings.js b/lib/title.js
index eb6292a..2d8411b 100644
--- a/lib/strings.js
+++ b/lib/title.js
@@ -1,3 +1,3 @@
-export function capitalize(word) {
-	return word.charAt(0).toUpperCase() + word.slice(1);
-}
+import { capitalize } from "./strings.js";
+
+export const title = (words) => words.map(capitalize).join(" ");


Command exited with code 1
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`.

<!-- you -->

