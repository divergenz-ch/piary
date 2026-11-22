---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_019ZWomnbAbmHKwUQrjH1ikT -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_019ZWomnbAbmHKwUQrjH1ikT -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait`-ms timer. `fn` runs only after `wait` ms pass with no further calls. It runs once, with the arguments from the last call.

Limits of this version:
- It is trailing-edge only. It never fires on the first call.
- It doesn't preserve `this`, because the wrapper is an arrow function.
- It has no `cancel` or `flush`.
- It discards `fn`'s return value.

**Debounce vs. throttle:**
- **Debounce:** use it when you only care about the final state after a burst of events. Examples are search-as-you-type requests, autosaving after the user stops editing, and validating a field. Another is recalculating layout once a window resize ends.
- **Throttle:** use it when you need regular updates *during* a continuous stream. Examples are scroll position tracking, drag or mousemove handlers, and progress reporting. It runs `fn` at most once per interval.

A continuous stream of events with gaps shorter than `wait` keeps a debounced function from ever firing. Throttle avoids that.

<!-- you -->

