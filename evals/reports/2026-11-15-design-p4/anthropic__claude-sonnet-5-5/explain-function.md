---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01QZmLgzbd2QDHwP2dKpZdXV -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01QZmLgzbd2QDHwP2dKpZdXV -->

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

`debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait` ms timer. `fn` only runs once calls have stopped for `wait` ms, and it runs with the arguments from the last call.

This version is minimal:
- It is trailing-edge only, so `fn` never fires at the start of a burst.
- It has no `cancel` or `flush`.
- It drops `this` because it uses an arrow function, and it discards `fn`'s return value.

**Debounce or throttle:**
- **Debounce** waits for a burst of events to end, then fires once. Use it when only the final value matters. Examples are search-as-you-type requests, autosave after typing stops, and validating a field or handling a window-resize end.
- **Throttle** fires at most once per interval during a continuous stream. Use it when you need regular updates while events keep coming. Examples are scroll position tracking, drag or mousemove handlers, and progress updates.

A debounced function can starve if events never pause for `wait` ms, because it never fires. Use throttling if you need updates during that kind of continuous activity.

<!-- you -->

