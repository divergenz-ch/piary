---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01SFyVUtVGgdTi6p3tD69x2A -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01SFyVUtVGgdTi6p3tD69x2A -->

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

`debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the last call.

It's a trailing-edge debounce only. It has no leading-edge option, no `cancel` or `flush`, and it doesn't preserve `this` (the arrow function ignores it). It also discards the return value of `fn`.

**Debounce vs. throttle**
- **Debounce:** use it when only the final value matters, after activity stops. Examples are search-as-you-type requests, autosaving after edits stop, validating a field after typing pauses, and recalculating layout after a window resize ends.
- **Throttle:** use it when you need regular updates while the activity continues, at most once per interval. Examples are scroll position tracking, drag or mousemove handlers, and progress or analytics pings.

A debounced function never fires while events keep arriving faster than `wait`. If that matters, for example for a continuous scroll that should update live, use a throttle.

<!-- you -->

