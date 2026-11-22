---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01KKwyKDEUBwDUr7wrQTss5p -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01KKwyKDEUBwDUr7wrQTss5p -->

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

`debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait` ms timer. `fn` runs only after the wrapper has gone `wait` ms without being called. It runs once, with the arguments from the last call.

This version is minimal:
- It is trailing-edge only. There is no leading-edge option.
- There is no `cancel` or `flush`.
- It doesn't preserve `this`, because the wrapper is an arrow function.
- It returns nothing from `fn`.

**Debounce vs. throttle**
- **Debounce** waits for the calls to stop, then fires once. Use it when only the final value matters:
  - search-as-you-type
  - autosave after typing stops
  - validating a form field
  - resizing a window and recalculating layout once at the end
- **Throttle** fires at most once per interval while events keep arriving. Use it when you need updates during a continuous stream:
  - scroll position tracking
  - drag or mousemove handlers
  - live progress or animation updates
  - rate-limiting button spam

A debounced function never fires while events keep arriving faster than `wait`. If you need regular updates during a long burst, use throttle.

<!-- you -->

