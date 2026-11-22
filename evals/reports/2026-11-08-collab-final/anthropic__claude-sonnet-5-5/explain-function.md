---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #toolu_01RBTh31n146QukKANbRuuwV -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #toolu_01RBTh31n146QukKANbRuuwV -->

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

**What it does:** `debounce(fn, wait)` in `src/timing.js` returns a wrapped version of `fn`. Each call to the wrapper cancels the pending timer and starts a new `wait` ms timer. `fn` runs only after `wait` ms pass with no new calls. It runs once, with the arguments from the last call.

Limitations of this version:
- It is trailing-edge only, so there is no immediate first call.
- It has no `cancel` or `flush`.
- It doesn't preserve `this`, because it uses an arrow function.
- It returns nothing, so you can't get `fn`'s result.

**Debounce vs. throttle:**
- **Debounce** waits until the activity stops, then fires once. Use it when only the final value matters:
  - search-as-you-type requests
  - autosaving after the user stops editing
  - validating a field after typing
  - recomputing layout after a window resize ends
- **Throttle** fires at most once per interval while the activity continues. Use it when you need regular updates during the activity:
  - scroll or drag handlers
  - mousemove tracking
  - progress reporting
  - rate-limiting API calls

A continuous stream of events never lets a debounced function fire until the stream pauses. If you need updates during the stream, use throttle.

<!-- you -->

