In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool budget #call_eea588b1f4b543c18635199799396535|fc_04670bf37fb32076016aef424382b087d2aeb300e93e41f1de -->

```json
{
  "minutes": 1,
  "reason": "Inspect the string module and its caller, make the rename, then run a quick verification."
}
```

<!-- pi:result #call_eea588b1f4b543c18635199799396535|fc_04670bf37fb32076016aef424382b087d2aeb300e93e41f1de -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_761fdc06a296410baafd92fc8de1392b|fc_04670bf37fb32076016aef42456a3887d2a2bcff3fd997020e -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_4d4595edd518405986237396db54fc0b|fc_04670bf37fb32076016aef42466c8487d2bac83ede226438a8 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" .",
  "timeout": 10
}
```

<!-- pi:result #call_761fdc06a296410baafd92fc8de1392b|fc_04670bf37fb32076016aef42456a3887d2a2bcff3fd997020e -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_4d4595edd518405986237396db54fc0b|fc_04670bf37fb32076016aef42466c8487d2bac83ede226438a8 -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool edit #call_a1d53b9584404ead88b004f62c801994|fc_04670bf37fb32076016aef424791fc87d2b1dc6979445a2785 -->

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

<!-- pi:result #call_a1d53b9584404ead88b004f62c801994|fc_04670bf37fb32076016aef424791fc87d2b1dc6979445a2785 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_4f6e63607bfc4af982be0e464ec5e472|fc_04670bf37fb32076016aef424d96f487d2a72d3241bdb0f590 -->

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

<!-- pi:result #call_4f6e63607bfc4af982be0e464ec5e472|fc_04670bf37fb32076016aef424d96f487d2a72d3241bdb0f590 -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi:tool read #call_4fc6d988e35d43ab939d22cb39d93307|fc_04670bf37fb32076016aef424fbb4c87d296a9558ac0051c1b -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 20
}
```

<!-- pi:tool read #call_040cbb52bf914ff28af639fcb9c3c33c|fc_04670bf37fb32076016aef42516c6887d2942cdd8ae5e04fe5 -->

```json
{
  "path": "lib/title.js",
  "offset": 1,
  "limit": 20
}
```

<!-- pi:tool bash #call_760ea135f29d4ff9bba6955587015132|fc_04670bf37fb32076016aef42516c6887d2b51a29045c785706 -->

```json
{
  "command": "if rg -n \"capitalise\" .; then exit 1; else echo 'No remaining capitalise references'; fi",
  "timeout": 10
}
```

<!-- pi:result #call_4fc6d988e35d43ab939d22cb39d93307|fc_04670bf37fb32076016aef424fbb4c87d296a9558ac0051c1b -->

```
export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_040cbb52bf914ff28af639fcb9c3c33c|fc_04670bf37fb32076016aef42516c6887d2942cdd8ae5e04fe5 -->

```
import { capitalize } from "./strings.js";

export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi:result #call_760ea135f29d4ff9bba6955587015132|fc_04670bf37fb32076016aef42516c6887d2b51a29045c785706 -->

```
No remaining capitalise references
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`. Verified no old references remain.

<!-- you -->

