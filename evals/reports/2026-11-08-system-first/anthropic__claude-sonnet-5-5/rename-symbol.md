In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01GaPCkSFdbbbsCjysKnA9Bk -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 20
}
```

<!-- pi:result #toolu_01GaPCkSFdbbbsCjysKnA9Bk -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_01QkNVjL2yPbfCwyrbTAq2Z6 -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali[sz]e .",
  "timeout": 20
}
```

<!-- pi:result #toolu_01QkNVjL2yPbfCwyrbTAq2Z6 error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed; retry.

<!-- pi:tool bash #toolu_01M17krvA7BKkRMzwMsp4bDA -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali[sz]e .",
  "timeout": 20
}
```

<!-- pi:result #toolu_01M17krvA7BKkRMzwMsp4bDA -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller in `lib/title.js`, both the import and the `words.map(...)` call. A search afterwards finds no remaining `capitalise`. I didn't run any tests.

<!-- you -->

