In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01Ku13ZNYVdiC3MZcYLWuZ4A -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Ku13ZNYVdiC3MZcYLWuZ4A -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_017T2ZfgT9xime6fJMsiJpHC -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_017T2ZfgT9xime6fJMsiJpHC error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi:tool bash #toolu_01VR7MtVPsXYRPBL8g5gkcQb -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01VR7MtVPsXYRPBL8g5gkcQb -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller in `lib/title.js`, both the import and the `words.map(...)` call. A search afterwards finds only the new spelling. I didn't run any tests.

<!-- you -->

