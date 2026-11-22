---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01Q8LwAfi3FrDgLskirW1LBj -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Q8LwAfi3FrDgLskirW1LBj -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new one. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call.

Limits of this version:
- It is trailing-edge only, so `fn` never runs immediately on the first call.
- It has no `cancel` or `flush` method.
- It drops `this`, because the wrapper is an arrow function.
- It returns nothing from `fn`.

**Debounce vs. throttle:**
- **Debounce** waits until the activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after edits
  - validating a form after typing pauses
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while the activity continues. Use it when you need regular updates during the activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting button spam

Debounce can starve. If events keep arriving more often than `wait`, `fn` never runs. If you need updates during a continuous stream, use throttle.

<!-- you -->

