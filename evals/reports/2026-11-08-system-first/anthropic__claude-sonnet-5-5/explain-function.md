---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_015bWsY296CJDBpMK6a5jDFf -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_015bWsY296CJDBpMK6a5jDFf -->

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

**What it does:** `debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new one. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call.

Some limits of this implementation:
- It is trailing-edge only, so `fn` never fires at the start of a burst.
- It has no `cancel` or `flush` method.
- It doesn't preserve `this`, because the wrapper is an arrow function.
- It returns nothing to the caller.

**Debounce vs. throttle:**
- **Debounce:** use it when only the final value of a burst matters. It waits for the activity to stop. Typical cases are:
  - search-as-you-type requests
  - autosave after typing stops
  - validating a field once the user pauses
  - recalculating layout after a window resize ends
- **Throttle:** use it when you need regular updates during continuous activity. It runs at most once per interval while events keep coming. Typical cases are:
  - scroll or drag handlers
  - mousemove tracking
  - progress or analytics pings
  - game or animation input

Under constant events, a debounced function may never fire, while a throttled one fires every interval.

<!-- you -->

