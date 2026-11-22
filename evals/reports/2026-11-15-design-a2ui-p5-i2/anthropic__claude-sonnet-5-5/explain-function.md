---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01UJtBhHet4ByQvptpvGSYSi -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01UJtBhHet4ByQvptpvGSYSi -->

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

**Limitations of this version:**
- It's trailing-edge only, so `fn` never fires at the start of a burst.
- There's no `cancel` or `flush`.
- It doesn't preserve `this`, because the wrapper is an arrow function.
- The return value of `fn` is discarded.

**Debounce vs. throttle:**
- **Debounce** waits until the activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - validating a form after the user pauses
  - saving a draft after editing stops
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval during continuous activity. Use it when you need steady updates while events keep coming:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting an API

A debounced function can be starved. If events keep arriving more often than `wait`, it never fires. If you need periodic updates during a long burst, use throttle.

<!-- you -->

