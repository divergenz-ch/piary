---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_011YAjAzGfbAH65bLu83G2gu -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_011YAjAzGfbAH65bLu83G2gu -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait`-ms timer. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the last call.

Details of this implementation:
- It is trailing-edge only. There is no immediate or leading call.
- There is no `cancel` or `flush` method.
- It ignores `this`, because the wrapper is an arrow function.
- It discards the return value of `fn`.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type input
  - autosave after typing
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during a burst:
  - scroll position tracking
  - mousemove or drag handlers
  - progress or analytics pings
  - game input

With a debounce, a continuous stream of events never fires `fn` until the stream pauses. If you need periodic updates during that stream, use a throttle.

<!-- you -->

