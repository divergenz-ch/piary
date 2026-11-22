In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool budget #call_2e641f4149ce4d31b4b2d00ec69b0840|fc_0d1432465524fa37016af067ca482c87d280ac36f4c2d56f75 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the symbol and caller, make the targeted rename, then verify no old references remain."
}
```

<!-- pi:result #call_2e641f4149ce4d31b4b2d00ec69b0840|fc_0d1432465524fa37016af067ca482c87d280ac36f4c2d56f75 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_d38f4526b4f54e51ba3d2ee031353c1d|fc_0d1432465524fa37016af067d0658887d2a6e5fec3c1b15e75 -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_e7db43a2866945e2ac1b208830f67065|fc_0d1432465524fa37016af067d1678887d2b07b5ee45bfb7370 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_d38f4526b4f54e51ba3d2ee031353c1d|fc_0d1432465524fa37016af067d0658887d2a6e5fec3c1b15e75 -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_e7db43a2866945e2ac1b208830f67065|fc_0d1432465524fa37016af067d1678887d2b07b5ee45bfb7370 -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool edit #call_5f02de2b098a420682fb144c1fdd687f|fc_0d1432465524fa37016af067d25c2087d287f6e727b3986117 -->

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

<!-- pi:result #call_5f02de2b098a420682fb144c1fdd687f|fc_0d1432465524fa37016af067d25c2087d287f6e727b3986117 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_645b0caf26744ff5ae6b3bb9b3704c1d|fc_0d1432465524fa37016af067d4db6087d293bb3e6e82b8256f -->

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

<!-- pi:result #call_645b0caf26744ff5ae6b3bb9b3704c1d|fc_0d1432465524fa37016af067d4db6087d293bb3e6e82b8256f -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_d5994a5280ac4243b29c1d7340774a71|fc_0d1432465524fa37016af067d6e47487d2937536c0f6b8d1ea -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" lib && git diff -- lib/strings.js lib/title.js",
  "timeout": 10
}
```

<!-- pi:result #call_d5994a5280ac4243b29c1d7340774a71|fc_0d1432465524fa37016af067d6e47487d2937536c0f6b8d1ea error -->

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

