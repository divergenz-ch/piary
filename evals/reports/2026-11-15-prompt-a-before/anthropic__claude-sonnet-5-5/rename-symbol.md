In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool bash #toolu_01AjftdwA8vGoXAAo7unbFYt -->

```json
{
  "command": "grep -rn capitalise . --exclude-dir=node_modules --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01AjftdwA8vGoXAAo7unbFYt -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool bash #toolu_01NyV1fYX8G3wipsnDxm5LDH -->

```json
{
  "command": "sed -i 's/capitalise/capitalize/g' lib/title.js lib/strings.js; grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01NyV1fYX8G3wipsnDxm5LDH -->

```
sed: 1: "lib/title.js
": extra characters at the end of l command
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi -->

BSD sed; use -i ''.

<!-- pi:tool bash #toolu_01AQZwQPkQiPqyV3fDtxd5q6 -->

```json
{
  "command": "sed -i '' 's/capitalise/capitalize/g' lib/title.js lib/strings.js; grep -rn capitali . --exclude-dir=.git",
  "timeout": 10
}
```

<!-- pi:result #toolu_01AQZwQPkQiPqyV3fDtxd5q6 -->

```
./lib/title.js:1:import { capitalize } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
./lib/strings.js:1:export function capitalize(word) {
```

<!-- pi -->

I renamed `capitalise` to `capitalize` in `lib/strings.js`. I also updated its one caller, `lib/title.js`, which covers both the import and the `words.map` call. A grep afterwards found no remaining `capitalise` anywhere in the project. I didn't run any code or tests.

<!-- you -->

