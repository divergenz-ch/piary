---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_0a8b1d7b36c84187acbf045b620a7acc|fc_00eb9e5b5a29459b016aefc34d4dd487d284bd8708e7cfaf4b -->

```json
{
  "minutes": 2,
  "reason": "Inspect src/timing.js and give a concise explanation with the debounce/throttle distinction."
}
```

<!-- pi:result #call_0a8b1d7b36c84187acbf045b620a7acc|fc_00eb9e5b5a29459b016aefc34d4dd487d284bd8708e7cfaf4b -->

```
ok — budget 2 min
```

<!-- pi:tool read #call_59f366c3daea4aae91f9a256b00933fb|fc_00eb9e5b5a29459b016aefc34f701487d2acbc5721cba2e3d3 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 240
}
```

<!-- pi:result #call_59f366c3daea4aae91f9a256b00933fb|fc_00eb9e5b5a29459b016aefc34f701487d2acbc5721cba2e3d3 -->

```
export function debounce(fn, wait) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), wait);
	};
}
```

<!-- pi -->

`debounce(fn, wait)` delays calling `fn` until no new call has occurred for `wait` milliseconds. Each call cancels the previous timer, so only the arguments from the final call are used.

Use it when you care about the **completed action**, such as:

- Search requests after the user stops typing
- Validating a finished input
- Saving after edits settle
- Handling window resize after resizing ends

Use **throttling** when you need periodic updates while events continue, such as scroll, mouse movement, or continuous resize feedback.

<!-- you -->

