In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_019p3kMj2YQpHSa3MjjS1rS1 -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 10
}
```

<!-- pi:result #toolu_019p3kMj2YQpHSa3MjjS1rS1 -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_01GkSihRya1n5qovEghBvLhR -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01GkSihRya1n5qovEghBvLhR error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed; use -i ''.

<!-- pi:tool bash #toolu_01LoyeYWJRJi2R1dH1yhDmAM -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01LoyeYWJRJi2R1dH1yhDmAM -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which has both the import and the `words.map(...)` call. A search afterwards found no remaining `capitalise` anywhere. I didn't run any tests.

<!-- you -->

