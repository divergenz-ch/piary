In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_015GD9uYp3NSSvPsPpeCEcqi -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_015GD9uYp3NSSvPsPpeCEcqi -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_018fszdnYjHvyxNspbnw36Zp -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_018fszdnYjHvyxNspbnw36Zp error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

macOS sed.

<!-- pi:tool bash #toolu_01Kj75mspRVWTKSXXF4SSsYn -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01Kj75mspRVWTKSXXF4SSsYn -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller in `lib/title.js`, both the import and the `words.map` call. A grep afterwards found no remaining uses of the old name. I didn't run any tests.

<!-- you -->

