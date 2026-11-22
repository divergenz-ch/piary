---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01FzHCKJxizf1aV3Cqqq1HYk -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01FzHCKJxizf1aV3Cqqq1HYk -->

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

**What it does:** `debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the most recent call. A burst of calls therefore produces one execution, at the end of the burst.

Limitations of this implementation:
- It is trailing-edge only. There is no option to fire immediately on the first call.
- It has no `cancel` or `flush` method.
- It drops `this` because it uses an arrow function.
- It discards the return value of `fn`.

**Debounce vs. throttle**
- **Debounce** waits until the activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type input, where you fetch after the user pauses
  - auto-saving after edits
  - recalculating layout after a window resize ends
  - form validation on input
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during the activity:
  - scroll position tracking
  - mousemove or drag handlers
  - progress reporting
  - rate-limiting button spam

A continuous stream of events, such as scrolling that never pauses, can keep a debounced function from ever running. Use throttle when you need updates during the stream. Use debounce when you only need the result once it settles.

<!-- you -->

