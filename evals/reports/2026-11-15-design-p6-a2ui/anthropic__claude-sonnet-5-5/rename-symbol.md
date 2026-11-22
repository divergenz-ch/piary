In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01Am71HUjMPXTPK2ynAcaHTm -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Am71HUjMPXTPK2ynAcaHTm -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01LJsaQpn34yKBaWLkTDcrAQ -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01LJsaQpn34yKBaWLkTDcrAQ error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

macOS sed.

<!-- pi:tool bash #toolu_018UEHLXTJGuvJ6TyF7ow5Hb -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_018UEHLXTJGuvJ6TyF7ow5Hb -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its one caller in `lib/title.js`, which covers both the import and the `.map` call. A search for the old name finds nothing else in the repo. I didn't run any tests.

<!-- you -->

