---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_017iRv3fW9QPzCc3sx2F8UGU -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_017iRv3fW9QPzCc3sx2F8UGU -->

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
- It is trailing-edge only. `fn` never fires at the start of a burst.
- It has no `cancel` or `flush` method.
- It drops `this`, because the wrapper is an arrow function.
- It ignores the return value of `fn`.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final state matters:
  - search-as-you-type requests
  - validating a form after the user pauses
  - saving a draft after editing stops
  - recomputing layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need steady updates during the activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting an API

One caveat: a continuous stream of events never fires a debounced function, because the timer keeps resetting. If you need periodic updates during a long burst, use throttle.

<!-- you -->

