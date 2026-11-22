In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #call_8fa2cf83a34243d4ab4cc8c1198d1de2|fc_005752e784bc04aa016aef3fc7323c87d2bf964fc1341b120a -->

```json
{
  "command": "grep -RIn \"capitalise\\|capitalize\" lib/strings.js lib || true",
  "timeout": 10
}
```

<!-- pi:result #call_8fa2cf83a34243d4ab4cc8c1198d1de2|fc_005752e784bc04aa016aef3fc7323c87d2bf964fc1341b120a -->

```
lib/strings.js:1:export function capitalise(word) {
lib/title.js:1:import { capitalise } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool edit #call_20d44eb5c946413a9cee9d3320c2ef47|fc_005752e784bc04aa016aef3fc8cf9087d2b24e04a281e0c7d6 -->

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

<!-- pi:result #call_20d44eb5c946413a9cee9d3320c2ef47|fc_005752e784bc04aa016aef3fc8cf9087d2b24e04a281e0c7d6 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_08ee6f5e187a4865af454537cf000c6b|fc_005752e784bc04aa016aef3fcac68487d2a01bd67c1fe5302b -->

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

<!-- pi:result #call_08ee6f5e187a4865af454537cf000c6b|fc_005752e784bc04aa016aef3fcac68487d2a01bd67c1fe5302b -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_6665058749fd4f21b6b99d70c4c20526|fc_005752e784bc04aa016aef3fcd212487d2ae7cb3fb7372a845 -->

```json
{
  "command": "grep -RIn \"capitalise\" lib || true; grep -RIn \"capitalize\" lib",
  "timeout": 10
}
```

<!-- pi:result #call_6665058749fd4f21b6b99d70c4c20526|fc_005752e784bc04aa016aef3fcd212487d2ae7cb3fb7372a845 -->

```
lib/title.js:1:import { capitalize } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`.

<!-- you -->

