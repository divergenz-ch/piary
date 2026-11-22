---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01UauwxDywmdCXBiz2dqW4QU -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01UauwxDywmdCXBiz2dqW4QU -->

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

`debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait` ms timer. `fn` only runs once calls have stopped for `wait` ms, and it runs with the arguments from the last call.

Some limits of this implementation:
- It is trailing-edge only. There is no immediate "leading" call.
- It has no `cancel` or `flush` method.
- It doesn't preserve `this`, because the wrapper is an arrow function.
- It discards the return value of `fn`.

**Debounce vs. throttle**
- **Debounce** waits for a burst of events to end and then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosave after typing stops
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while events keep coming. Use it when you need regular updates during continuous activity:
  - scroll or drag handlers
  - mousemove tracking
  - progress or analytics pings

Debounce can starve. If events never pause for `wait` ms, `fn` never runs. If you need steady updates during the activity, use throttle.

<!-- you -->

