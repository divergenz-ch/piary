In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01LiMXcFF3gjyAXF5SDjgLQP -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01LiMXcFF3gjyAXF5SDjgLQP -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01C2NTP8iHPeK5uUhL9W66c3 -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01C2NTP8iHPeK5uUhL9W66c3 error -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command


Command exited with code 1
```

<!-- pi -->

macOS sed.

<!-- pi:tool bash #toolu_01X9B79G8bmxfhQhyqU558a5 -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js && grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01X9B79G8bmxfhQhyqU558a5 -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which covers both the import and the `words.map` call. A final grep finds no remaining `capitalise` anywhere in the project. I didn't run any tests.

<!-- you -->

