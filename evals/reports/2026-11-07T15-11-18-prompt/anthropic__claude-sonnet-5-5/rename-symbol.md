In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01CkSs4CGakJpGkvM3CqvYUA -->

```json
{
  "command": "rg -n capitalise .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CkSs4CGakJpGkvM3CqvYUA -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool bash #toolu_01QUHQMiLHQhfN2jLih66VtR -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/strings.js lib/title.js && rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_01QUHQMiLHQhfN2jLih66VtR error -->

```
sed: 1: "lib/strings.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

Odd; likely BSD sed quirk. Retry.

<!-- pi:tool bash #toolu_013EsgdTwcU63WsgwiYVm9W8 -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/strings.js lib/title.js; rg -n capitali .",
  "timeout": 10
}
```

<!-- pi:result #toolu_013EsgdTwcU63WsgwiYVm9W8 -->

```
./lib/strings.js:1:export function capitalize(word) {
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which covers both the import and the `words.map(...)` call. A search afterwards found no remaining `capitalise` anywhere. I didn't run the code or any tests.

<!-- you -->

