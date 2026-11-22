In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_013Gck4kFETyvvQZ1zcY6pYe -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 10
}
```

<!-- pi:result #toolu_013Gck4kFETyvvQZ1zcY6pYe -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_01L9HqWw3sPZCmARxYUABGyp -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01L9HqWw3sPZCmARxYUABGyp error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed needs `-i ''`.

<!-- pi:tool bash #toolu_014w12143XxKkg7HDyRxijdx -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_014w12143XxKkg7HDyRxijdx -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller in `lib/title.js`, both the import and the `words.map` call. A search afterwards finds no `capitalise` left in the project. I didn't run any tests.

<!-- you -->

