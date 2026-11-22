In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_0129Sbe4fGbCtfFZPk3sE2WZ -->

```json
{
  "command": "grep -rn \"capitalise\" . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_0129Sbe4fGbCtfFZPk3sE2WZ -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01HTyX57GtupDFxEfTRBE5PM -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn \"capitali\" lib",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HTyX57GtupDFxEfTRBE5PM error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

The sed in this shell is the BSD version, so it needs a different form.

<!-- pi:tool bash #toolu_01XE3oLvJojjpivYcGEcnvS5 -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn \"capitali\" lib",
  "timeout": 10
}
```

<!-- pi:result #toolu_01XE3oLvJojjpivYcGEcnvS5 -->

```
lib/title.js:1:import { capitalize } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, in both the import and the `words.map` call. A grep of `lib` shows no remaining uses of the old name. I didn't run any tests.

<!-- you -->

