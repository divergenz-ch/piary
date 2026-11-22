---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_f856dcd865654d99abc30c6abc04c947|fc_0c8635eb0f4eb056016af04de84c5487d292eb15329c06a274 -->

```json
{
  "minutes": 1,
  "reason": "Inspect src/timing.js and briefly compare debounce with throttling."
}
```

<!-- pi:result #call_f856dcd865654d99abc30c6abc04c947|fc_0c8635eb0f4eb056016af04de84c5487d292eb15329c06a274 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_90d6eb74f9bd4d369434a532fa131bcf|fc_0c8635eb0f4eb056016af04de994f087d28ea097e4ffa75c5b -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_90d6eb74f9bd4d369434a532fa131bcf|fc_0c8635eb0f4eb056016af04de994f087d28ea097e4ffa75c5b -->

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

`debounce(fn, wait)` delays calling `fn` until no new call has occurred for `wait` milliseconds. Each call resets the timer, so only the final call in a burst runs.

Use it when you care about the completed action, such as:

- Search suggestions after the user stops typing
- Saving after edits pause
- Handling window resize after resizing ends

Use throttling when you need regular updates during continuous activity, such as scrolling or pointer movement.

<!-- you -->

