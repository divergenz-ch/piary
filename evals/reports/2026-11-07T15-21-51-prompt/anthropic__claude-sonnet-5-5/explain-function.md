---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01FQSWW27kd1bCEMGwWhtA2K -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01FQSWW27kd1bCEMGwWhtA2K -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending timer and starts a new `wait`-ms timer. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call.

Limitations of this version (`src/timing.js`):
- It is trailing-edge only. `fn` never runs at the start of a burst.
- It has no `cancel` or `flush`.
- It doesn't preserve `this`, because it uses an arrow function.
- It discards `fn`'s return value.

**Debounce vs. throttle:**
- **Debounce** waits for activity to stop and then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosave after editing
  - validating a form field
  - recalculating layout after a window resize ends
- **Throttle** fires at most once per interval while activity continues. Use it when you need regular updates during the activity:
  - scroll or drag handlers
  - mousemove tracking
  - progress or position updates
  - rate-limiting a button

A continuous stream of events can starve a debounce, because `fn` never runs until the stream pauses. Throttle avoids that.

<!-- you -->

