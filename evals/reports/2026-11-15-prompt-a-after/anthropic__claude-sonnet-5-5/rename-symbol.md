In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01HtW7XWc5YKhM56aVvZjyfd -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01HtW7XWc5YKhM56aVvZjyfd -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01M4DNmDcVyvJfuFZeauBVR3 -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01M4DNmDcVyvJfuFZeauBVR3 error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

BSD sed.

<!-- pi:tool bash #toolu_01TCVFFcUWacga48ELtuBpdj -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 20
}
```

<!-- pi:result #toolu_01TCVFFcUWacga48ELtuBpdj -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which has both the import and the `words.map(...)` call. A search for `capitali` across the project now shows only the new spelling. I didn't run any tests.

<!-- you -->

