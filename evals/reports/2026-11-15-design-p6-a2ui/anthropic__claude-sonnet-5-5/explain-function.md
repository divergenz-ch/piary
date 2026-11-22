---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01KLtrmu4i24kTFMSZEAEK19 -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01KLtrmu4i24kTFMSZEAEK19 -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call cancels the pending timer and starts a new one. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call. Calls made in quick succession collapse into one trailing call.

This version is minimal. It has no `cancel` or `flush`, no leading-edge option, and it doesn't preserve `this` because it uses an arrow function. It also returns nothing to the caller.

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

A continuous stream of events never triggers a debounced function until the stream pauses. If you need updates during the stream, use throttle.

<!-- you -->

