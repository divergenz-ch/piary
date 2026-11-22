In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01UQYyXNMojSgS63KjEiFUpg -->

```json
{
  "command": "grep -rn \"capitalise\" . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01UQYyXNMojSgS63KjEiFUpg -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01Piingtfx6MoAEmmhZbRx3Y -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn \"capitali[sz]e\" lib",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Piingtfx6MoAEmmhZbRx3Y error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

macOS sed; use -i ''.

<!-- pi:tool bash #toolu_01Jidxe43m327MJA1u9ZWkXv -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn \"capitali[sz]e\" lib",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Jidxe43m327MJA1u9ZWkXv -->

```
lib/title.js:1:import { capitalize } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`, both the import and the `words.map(...)` call. A follow-up grep of `lib` shows only the new spelling. I didn't run any tests.

<!-- you -->

