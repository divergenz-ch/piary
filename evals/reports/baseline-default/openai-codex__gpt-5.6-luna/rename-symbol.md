In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool read #call_edcbf70ebfd04c65806c40e1053f2165|fc_0cb89ae0981c4ad2016aef33f9f70487d2b68657f6cfd9c7f4 -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_edcbf70ebfd04c65806c40e1053f2165|fc_0cb89ae0981c4ad2016aef33f9f70487d2b68657f6cfd9c7f4 -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:tool bash #call_e4d237967aa34834a3fac95fada0bc54|fc_0cb89ae0981c4ad2016aef33fc756087d29f12848e2812331d -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" . --glob '!node_modules'",
  "timeout": 10
}
```

<!-- pi:result #call_e4d237967aa34834a3fac95fada0bc54|fc_0cb89ae0981c4ad2016aef33fc756087d29f12848e2812331d -->

```
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
./lib/strings.js:1:export function capitalise(word) {
```

<!-- pi:tool edit #call_262ca813621b4383b7d22368e40d8a2b|fc_0cb89ae0981c4ad2016aef33fedbc087d2a209b9f5860db251 -->

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

<!-- pi:result #call_262ca813621b4383b7d22368e40d8a2b|fc_0cb89ae0981c4ad2016aef33fedbc087d2a209b9f5860db251 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:tool edit #call_f8fdb1a6c1214c8997b809516748cfb8|fc_0cb89ae0981c4ad2016aef34016d1087d284777ca73b6a1df1 -->

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

<!-- pi:result #call_f8fdb1a6c1214c8997b809516748cfb8|fc_0cb89ae0981c4ad2016aef34016d1087d284777ca73b6a1df1 -->

```
Successfully replaced 2 block(s) in lib/title.js.
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`.

<!-- you -->

