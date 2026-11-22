---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01D1CwJK8jfFUCRRvnaGJoNm -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01D1CwJK8jfFUCRRvnaGJoNm -->

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

**What it does:** `debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no new calls, and it receives the arguments from the last call.

Limitations of this version:
- It's trailing-edge only, so there's no option to fire immediately on the first call.
- It has no `cancel` or `flush` method.
- It drops `this`, because the wrapper is an arrow function.
- It discards the return value of `fn`.

**Debounce vs. throttle**
- **Debounce** waits until the calls stop, then runs once. Use it when only the final value matters:
  - search-as-you-type input
  - autosave after typing stops
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** runs at most once per interval while events keep arriving. Use it when you need regular updates during a continuous stream:
  - scroll position tracking
  - mousemove or drag handlers
  - progress reporting
  - rate-limiting button spam

Debounce can starve. If events never pause for `wait` ms, `fn` never runs. If you need periodic updates during constant activity, use a throttle.

<!-- you -->

