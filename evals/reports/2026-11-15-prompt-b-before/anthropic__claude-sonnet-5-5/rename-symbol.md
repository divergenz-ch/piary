In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01X4zktcuNKDTiR3RDYKSHsk -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01X4zktcuNKDTiR3RDYKSHsk -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01XWaEoDRqKRDoDvMcbALdxT -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01XWaEoDRqKRDoDvMcbALdxT error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed; use -i ''.

<!-- pi:tool bash #toolu_015nHLWL6kVFxzGMjoU1Qetg -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_015nHLWL6kVFxzGMjoU1Qetg -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its one caller in `lib/title.js`, both the import and the `words.map` call. A grep afterwards found no remaining uses of the old name. I didn't run any tests.

<!-- you -->

