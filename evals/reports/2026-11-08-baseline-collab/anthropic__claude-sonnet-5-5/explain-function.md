---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01HAaK7Y1JQ9Xo4Lme64nB3R -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HAaK7Y1JQ9Xo4Lme64nB3R -->

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

**What it does:** `debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no further calls. It runs once, with the arguments from the last call.

**What it doesn't do:**
- It has no leading-edge option, so `fn` never fires at the start of a burst.
- It has no `cancel` or `flush` method.
- It drops the return value of `fn`.
- It doesn't preserve `this`, because it uses an arrow function.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosave after editing pauses
  - validating a field after typing stops
  - recomputing layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during a continuous stream:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting API calls

A continuous event stream never lets a debounced function fire until it stops. If you need feedback while the user is still scrolling or dragging, use a throttle.

<!-- you -->

