---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_013MrGKjfk7SWgrUH1RWeQUc -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_013MrGKjfk7SWgrUH1RWeQUc -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call cancels the pending timer and starts a new one. `fn` runs only once, `wait` ms after the last call, and it receives the arguments from that last call. While calls keep arriving less than `wait` ms apart, `fn` never runs.

Limits of this implementation:
- It is trailing-edge only. It has no option to fire immediately on the first call.
- It has no `cancel` or `flush` method.
- It does not preserve `this`, because it uses an arrow function.
- It returns nothing from the wrapped call.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after edits
  - validating a field once the user pauses
  - recomputing layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during the activity:
  - scroll position tracking
  - drag or mousemove handlers
  - progress or animation updates

A debounced function can starve. If events never pause for `wait` ms, it never fires. Throttle avoids that.

<!-- you -->

