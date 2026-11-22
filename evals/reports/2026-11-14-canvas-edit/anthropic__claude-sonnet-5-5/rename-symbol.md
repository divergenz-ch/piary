In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01Nat9h4WMN8yy4vA6fiz2eZ -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Nat9h4WMN8yy4vA6fiz2eZ -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_015ZDaUK9UwTWX61DUKKU585 -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali[sz]e .",
  "timeout": 10
}
```

<!-- pi:result #toolu_015ZDaUK9UwTWX61DUKKU585 error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

Odd quoting; retry.

<!-- pi:tool bash #toolu_01CTm3VtD5hGRE1w7fytJeft -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js; rg -n capitali[sz]e .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CTm3VtD5hGRE1w7fytJeft -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which covers both the import and the `words.map` call. A search afterwards finds no remaining `capitalise` anywhere. I didn't run any tests.

<!-- you -->

