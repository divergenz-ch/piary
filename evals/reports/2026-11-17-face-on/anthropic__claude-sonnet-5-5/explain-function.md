---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01KFPKs4GFq9TkbMuo6DKW5S -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01KFPKs4GFq9TkbMuo6DKW5S -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait`-ms timer. `fn` runs only after calls have stopped for `wait` ms, and it runs with the arguments from the last call.

Limitations of this version:
- It is trailing-edge only, so `fn` never fires at the start of a burst.
- There is no `cancel` or `flush`.
- `this` isn't preserved, because it uses an arrow function.
- The return value of `fn` is discarded.

**Debounce vs. throttle:**
- **Debounce** waits until activity stops, then fires once. Use it when only the final state matters:
  - search-as-you-type requests
  - autosave after editing
  - validating a field after the user pauses
  - recomputing layout after a window resize ends
- **Throttle** fires at most once per interval during continuous activity. Use it when you need regular updates while the activity is still going on:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting an API

Debounce can starve. If events keep arriving more often than every `wait` ms, `fn` never runs. If you need periodic updates during a long burst, use throttle.

<!-- you -->

