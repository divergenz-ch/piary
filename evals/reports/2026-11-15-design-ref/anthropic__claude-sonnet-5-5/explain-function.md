---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01AhV61JxZYSnTrYRWMj49dV -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01AhV61JxZYSnTrYRWMj49dV -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new one. `fn` runs only after `wait` ms pass with no further calls. It runs once, with the arguments from the last call.

**Limitations of this version:**
- It is trailing-edge only, so there is no option to fire immediately on the first call.
- There is no `cancel` or `flush` method.
- `this` isn't preserved, because it uses an arrow function.
- The return value of `fn` is discarded.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after edits
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during the activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting button spam

Rule of thumb: choose debounce if intermediate calls are worthless, and throttle if you need updates while the activity is still going. A debounced function can also be delayed indefinitely if calls keep arriving more often than every `wait` ms. Throttle avoids that.

<!-- you -->

