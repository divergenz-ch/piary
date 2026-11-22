---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01EXeymvBW7Weo9GPNsB3VtD -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01EXeymvBW7Weo9GPNsB3VtD -->

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

`debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait` ms timer. `fn` runs only after the wrapper has gone `wait` ms without being called. It runs once, with the arguments from the last call.

Limitations of this version:
- It has no leading-edge option, so it never fires at the start of a burst.
- It has no `cancel` or `flush` method.
- It drops the `this` binding, because the wrapper is an arrow function.
- It discards `fn`'s return value.

**Debounce vs. throttle**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after edits
  - validating a field after the user stops typing
  - recomputing layout after a resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during a continuous stream:
  - scroll or drag handlers
  - mousemove tracking
  - progress reporting
  - game input

Debounce can starve. If events never pause for `wait` ms, `fn` never runs. If you need periodic updates during constant activity, use throttle.

<!-- you -->

