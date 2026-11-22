In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01Rtm87rtm44Guu8P5FyE38b -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01Rtm87rtm44Guu8P5FyE38b -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01AfkmCHaGY4oAhX3v3zX4UA -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01AfkmCHaGY4oAhX3v3zX4UA error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed; use -i ''.

<!-- pi:tool bash #toolu_01SVEqaoN1xruJoq2BMSSzNZ -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01SVEqaoN1xruJoq2BMSSzNZ -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`, both the import and the `words.map` call. A grep for `capitali` now finds only the new spelling. I didn't run any tests.

<!-- you -->

