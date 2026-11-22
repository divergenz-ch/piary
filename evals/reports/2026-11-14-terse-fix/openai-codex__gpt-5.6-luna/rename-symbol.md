In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool budget #call_d3eaebcad3214bde8a9d445402731e5a|fc_040567323ff5ba41016af87135371087d2a62a4c8a0534bbe6 -->

```json
{
  "minutes": 1,
  "reason": "Inspect the string utility and its caller, make the rename, then verify references."
}
```

<!-- pi:result #call_d3eaebcad3214bde8a9d445402731e5a|fc_040567323ff5ba41016af87135371087d2a62a4c8a0534bbe6 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_135aa192868e48628b182fcfa3272d8c|fc_040567323ff5ba41016af87136c10c87d2932b8d403f0368c2 -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_f64ad864d834402a8b38c8f4b9abcbcc|fc_040567323ff5ba41016af87137c32c87d29e84b8b927e04f04 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_135aa192868e48628b182fcfa3272d8c|fc_040567323ff5ba41016af87136c10c87d2932b8d403f0368c2 -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_f64ad864d834402a8b38c8f4b9abcbcc|fc_040567323ff5ba41016af87137c32c87d29e84b8b927e04f04 -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool edit #call_8f268190b94d4bd2bc3d7acb715d94db|fc_040567323ff5ba41016af871390a8087d2bc6a623ac0041ce9 -->

```json
{
  "path": "lib/strings.js",
  "edits": [
    {
      "oldText": "export function capitalise(word) {",
      "newText": "export function capitalize(word) {"
    }
  ]
}
```

<!-- pi:result #call_8f268190b94d4bd2bc3d7acb715d94db|fc_040567323ff5ba41016af871390a8087d2bc6a623ac0041ce9 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_e565567aca5640f8b57e4150e817884a|fc_040567323ff5ba41016af8713ac24c87d28b1cb5e89065aa3e -->

```json
{
  "path": "lib/title.js",
  "edits": [
    {
      "oldText": "import { capitalise } from \"./strings.js\";",
      "newText": "import { capitalize } from \"./strings.js\";"
    },
    {
      "oldText": "words.map(capitalise)",
      "newText": "words.map(capitalize)"
    }
  ]
}
```

<!-- pi:result #call_e565567aca5640f8b57e4150e817884a|fc_040567323ff5ba41016af8713ac24c87d28b1cb5e89065aa3e -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool bash #call_649bc035935c42988505c1291a268dc7|fc_040567323ff5ba41016af8713d3b5487d299b57b5248a0c019 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" lib",
  "timeout": 10
}
```

<!-- pi:result #call_649bc035935c42988505c1291a268dc7|fc_040567323ff5ba41016af8713d3b5487d299b57b5248a0c019 -->

```
lib/strings.js:1:export function capitalize(word) {
lib/title.js:1:import { capitalize } from "./strings.js";
lib/title.js:3:export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`.

<!-- you -->

