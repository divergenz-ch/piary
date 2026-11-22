---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01JwtCmFEYrYRa7CMsvCMBge -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01JwtCmFEYrYRa7CMsvCMBge -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the last call.

Limitations of this version:
- It is trailing-edge only, so there is no immediate first call.
- There is no `cancel` or `flush`.
- `this` isn't preserved, because the wrapper is an arrow function.
- The return value of `fn` is discarded.

**Debounce vs. throttle:**
- **Debounce** waits for a burst of events to stop and then fires once. Use it when only the final state matters:
  - search-as-you-type requests
  - validating a form after the user pauses
  - saving a draft after editing stops
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while events keep coming. Use it when you need regular updates during continuous activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting button spam

A debounced function never fires while events keep arriving, so a continuous stream starves it. If you need periodic updates during that stream, use throttle.

<!-- you -->

