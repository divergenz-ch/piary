In `lib/strings.js`, rename `capitalise` to `capitalize`, and update its one caller.

<!-- pi:tool read #call_66fcb87890ff47b3946496370e14079a|fc_0bb3946a70b0bbd5016aef343a04dc87d2aa0662fe85344b0e -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:tool bash #call_f35cea753b264fe29fc5513e712226ec|fc_0bb3946a70b0bbd5016aef343b228487d2a914d32ad9bc1a15 -->

```json
{
  "command": "rg -n \"capitalise|capitalize\" . --glob '!node_modules'",
  "timeout": 10
}
```

<!-- pi:result #call_66fcb87890ff47b3946496370e14079a|fc_0bb3946a70b0bbd5016aef343a04dc87d2aa0662fe85344b0e -->

```
export function capitalise(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_f35cea753b264fe29fc5513e712226ec|fc_0bb3946a70b0bbd5016aef343b228487d2a914d32ad9bc1a15 -->

```
./lib/strings.js:1:export function capitalise(word) {
./lib/title.js:1:import { capitalise } from "./strings.js";
./lib/title.js:3:export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool edit #call_026a7eb9d5ce4e8a8af25c7b11f01d87|fc_0bb3946a70b0bbd5016aef343c37f087d2a5524cb203be26b4 -->

```json
{
  "path": "lib/strings.js",
  "edits": [
    {
      "oldText": "capitalise",
      "newText": "capitalize"
    }
  ]
}
```

<!-- pi:tool edit #call_cc66fe29c78248d2b5dd4d9df65b8f51|fc_0bb3946a70b0bbd5016aef343d760887d2975967404f22ffe6 -->

```json
{
  "path": "lib/title.js",
  "edits": [
    {
      "oldText": "capitalise",
      "newText": "capitalize"
    }
  ]
}
```

<!-- pi:result #call_026a7eb9d5ce4e8a8af25c7b11f01d87|fc_0bb3946a70b0bbd5016aef343c37f087d2a5524cb203be26b4 -->

```
Successfully replaced 1 block(s) in lib/strings.js.
```

<!-- pi:result #call_cc66fe29c78248d2b5dd4d9df65b8f51|fc_0bb3946a70b0bbd5016aef343d760887d2975967404f22ffe6 error -->

```
Found 2 occurrences of the text in lib/title.js. The text must be unique. Please provide more context to make it unique.
```

<!-- pi:tool read #call_d50437d1b3704605be63a39ab214304f|fc_0bb3946a70b0bbd5016aef343e84c487d29c010da64d30534f -->

```json
{
  "path": "lib/title.js",
  "offset": 1,
  "limit": 50
}
```

<!-- pi:result #call_d50437d1b3704605be63a39ab214304f|fc_0bb3946a70b0bbd5016aef343e84c487d29c010da64d30534f -->

```
import { capitalise } from "./strings.js";

export const title = (words) => words.map(capitalise).join(" ");
```

<!-- pi:tool edit #call_870a3f71585e4360b3e68b6dfea489be|fc_0bb3946a70b0bbd5016aef34400f3887d29184defa5be0463c -->

```json
{
  "path": "lib/title.js",
  "edits": [
    {
      "oldText": "import { capitalise } from \"./strings.js\";\n\nexport const title = (words) => words.map(capitalise).join(\" \");",
      "newText": "import { capitalize } from \"./strings.js\";\n\nexport const title = (words) => words.map(capitalize).join(\" \");"
    }
  ]
}
```

<!-- pi:result #call_870a3f71585e4360b3e68b6dfea489be|fc_0bb3946a70b0bbd5016aef34400f3887d29184defa5be0463c -->

```
Successfully replaced 1 block(s) in lib/title.js.
```

<!-- pi:tool read #call_0ab5b0d8b4e64648beb7d8d38774fc6a|fc_0bb3946a70b0bbd5016aef3442b6c087d29a10494ce025c4c5 -->

```json
{
  "path": "lib/strings.js",
  "offset": 1,
  "limit": 20
}
```

<!-- pi:tool read #call_75f71b27ab6e4186b18cdf428c2baab5|fc_0bb3946a70b0bbd5016aef34443e9487d2bedace25c76a6624 -->

```json
{
  "path": "lib/title.js",
  "offset": 1,
  "limit": 20
}
```

<!-- pi:tool bash #call_995a209f79fa4a4ba3ba1b262e374036|fc_0bb3946a70b0bbd5016aef34443e9487d2819d8d627499ff20 -->

```json
{
  "command": "rg -n \"capitalise\" . --glob '!node_modules' || true",
  "timeout": 10
}
```

<!-- pi:result #call_0ab5b0d8b4e64648beb7d8d38774fc6a|fc_0bb3946a70b0bbd5016aef3442b6c087d29a10494ce025c4c5 -->

```
export function capitalize(word) {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
```

<!-- pi:result #call_75f71b27ab6e4186b18cdf428c2baab5|fc_0bb3946a70b0bbd5016aef34443e9487d2bedace25c76a6624 -->

```
import { capitalize } from "./strings.js";

export const title = (words) => words.map(capitalize).join(" ");
```

<!-- pi:result #call_995a209f79fa4a4ba3ba1b262e374036|fc_0bb3946a70b0bbd5016aef34443e9487d2819d8d627499ff20 -->

```
(no output)
```

<!-- pi -->

Renamed `capitalise` to `capitalize` in `lib/strings.js` and updated its caller in `lib/title.js`.

<!-- you -->

