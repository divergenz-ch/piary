---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01XvTcteyRWFkfqtKj5JRN1S -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01XvTcteyRWFkfqtKj5JRN1S -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call cancels the pending timer and starts a new one. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call. Calls that were superseded are dropped.

Limits of this implementation:
- It is trailing-edge only, so there is no immediate first call.
- It has no `cancel` or `flush`.
- It does not preserve `this`, because it uses an arrow function.
- It discards the return value of `fn`.

**Debounce vs. throttle**
- **Debounce** waits until the activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - validating a form after the user stops typing
  - saving a draft
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while the activity continues. Use it when you need regular updates during a continuous stream:
  - scroll position tracking
  - drag or mousemove handlers
  - progress reporting
  - rate-limiting an API

Rule of thumb: choose debounce to react once the burst is over, and throttle to react steadily during the burst. A debounced function can also never fire while events keep arriving faster than `wait`. For a continuous stream where you still need periodic updates, such as a live scroll indicator, that would leave the UI frozen, so use throttle there.

<!-- you -->

