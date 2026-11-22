In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi -->

I’ll inspect `lib/strings.js` and its references, then make the minimal rename and verify no old references remain.

<!-- pi:tool budget #call_ff504f9cc91f4efb9b0b221d9b2bec01|fc_0f130e4ec78d69bc016aefc14cb04c87d2bce323f17a9b2b4a -->

```json
{
  "minutes": 1,
  "reason": "Inspect the symbol and caller, apply one small edit, and verify references."
}
```

<!-- pi:result #call_ff504f9cc91f4efb9b0b221d9b2bec01|fc_0f130e4ec78d69bc016aefc14cb04c87d2bce323f17a9b2b4a -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_ac7adaf71b514da1af6388fc3aa17733|fc_0f130e4ec78d69bc016aefc14e3a2887d28611dda49e879d18 -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_804718287ce242af908fc809b1add6e3|fc_0f130e4ec78d69bc016aefc14f3c0c87d287f8e7b6bd22ae63 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_ac7adaf71b514da1af6388fc3aa17733|fc_0f130e4ec78d69bc016aefc14e3a2887d28611dda49e879d18 -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_804718287ce242af908fc809b1add6e3|fc_0f130e4ec78d69bc016aefc14f3c0c87d287f8e7b6bd22ae63 -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool edit #call_7b67f9a028344835a4170226cce4d5ef|fc_0f130e4ec78d69bc016aefc1502e5c87d29a3717e799890fb1 -->

```json
{
  "path": "lib/strings.js",
  "edits": [
    {
      "oldText": "export function capitalise(word)",
      "newText": "export function capitalize(word)"
    }
  ]
}
```

<!-- pi:result #call_7b67f9a028344835a4170226cce4d5ef|fc_0f130e4ec78d69bc016aefc1502e5c87d29a3717e799890fb1 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_4fc9b8aa44af4c3bb2510bd0fecf44b2|fc_0f130e4ec78d69bc016aefc151a42087d2a5e37221b769434d -->

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

<!-- pi:result #call_4fc9b8aa44af4c3bb2510bd0fecf44b2|fc_0f130e4ec78d69bc016aefc151a42087d2a5e37221b769434d -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_8fa94128cff74ac499ec52a21ca18201|fc_0f130e4ec78d69bc016aefc153991887d28febf15ff3eca02b -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" lib && git diff -- lib/strings.js lib/title.js",
  "timeout": 10
}
```

<!-- pi:result #call_8fa94128cff74ac499ec52a21ca18201|fc_0f130e4ec78d69bc016aefc153991887d28febf15ff3eca02b error -->

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

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`. Verified no old references remain.

<!-- you -->

