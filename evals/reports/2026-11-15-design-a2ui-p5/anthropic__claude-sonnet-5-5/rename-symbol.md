In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01ALRNXsAuFWpuyPh6ViFcxQ -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01ALRNXsAuFWpuyPh6ViFcxQ -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01Q833TmofZF22FY3Pwao9Kp -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Q833TmofZF22FY3Pwao9Kp error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

macOS sed; use -i ''.

<!-- pi:tool bash #toolu_01Wp6yGjLCCFeCKmGXi3ctWu -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Wp6yGjLCCFeCKmGXi3ctWu -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js` and in its one caller, `lib/title.js`, which covers both the import and the `.map` call. A grep for "capitali" now finds only the new spelling. I didn't run any tests or the code.

<!-- you -->

