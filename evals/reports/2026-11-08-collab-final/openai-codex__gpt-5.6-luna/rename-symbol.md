In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool budget #call_71261b591fe44c33b490623697b15983|fc_0306c4b438046114016af04dfc4d1487d2a6e427b91528cca0 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the target file, make the rename, and verify the caller and tests/search."
}
```

<!-- pi:result #call_71261b591fe44c33b490623697b15983|fc_0306c4b438046114016af04dfc4d1487d2a6e427b91528cca0 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_51caa8b9290a406393eb23ea8b55d883|fc_0306c4b438046114016af04dfdcaec87d2b937c41eb109873f -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_273a46e275cf438a89d42a3c0ecc127d|fc_0306c4b438046114016af04dfecce887d2b46eae2803404917 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_51caa8b9290a406393eb23ea8b55d883|fc_0306c4b438046114016af04dfdcaec87d2b937c41eb109873f -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_273a46e275cf438a89d42a3c0ecc127d|fc_0306c4b438046114016af04dfecce887d2b46eae2803404917 -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool edit #call_6594aa4ce9f74ba38f7ecc4e9e8871ea|fc_0306c4b438046114016af04dffbcdc87d299005819a591d294 -->

```json
{
  "path": "lib/strings.js",
  "edits": [
    {
      "oldText": "export function capitalise(word) {",
      "newText": "export function capitalize(word) {"
    }
  ]
}
```

<!-- pi:result #call_6594aa4ce9f74ba38f7ecc4e9e8871ea|fc_0306c4b438046114016af04dffbcdc87d299005819a591d294 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_5289ae47ef454b34b27559768fc5d114|fc_0306c4b438046114016af04e013adc87d28756cf79a4fe96d2 -->

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

<!-- pi:result #call_5289ae47ef454b34b27559768fc5d114|fc_0306c4b438046114016af04e013adc87d28756cf79a4fe96d2 -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_33c3e3ee834a4cd4bb4554866e809838|fc_0306c4b438046114016af04e033a7c87d280eaa2d7448c930c -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" lib && git diff -- lib/strings.js lib/title.js",
  "timeout": 10
}
```

<!-- pi:result #call_33c3e3ee834a4cd4bb4554866e809838|fc_0306c4b438046114016af04e033a7c87d280eaa2d7448c930c error -->

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

