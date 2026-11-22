---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_0133qA42E69Fips5WNKrSoXU -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_0133qA42E69Fips5WNKrSoXU -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new one. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the last call.

Some limits of this implementation:
- It's trailing-edge only. `fn` never fires at the start of a burst.
- It has no `cancel` or `flush` method.
- It drops `this` because it uses an arrow function.
- It discards `fn`'s return value.

**Debounce vs. throttle:**
- **Debounce** waits until activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after edits
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during the activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting an API

A continuous stream of events can starve a debounced function indefinitely, because the timer keeps resetting. Throttle avoids that.

<!-- you -->

