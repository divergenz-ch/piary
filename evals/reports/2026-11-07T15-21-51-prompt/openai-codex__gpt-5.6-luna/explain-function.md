---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_b5bf7c6122c845fcb6dfa833f1cff8b6|fc_0e05f049ac587a23016aef422b7a6487d2bbc82d640a245c80 -->

```json
{
  "minutes": 2,
  "reason": "Inspect src/timing.js and provide a concise explanation with the throttle comparison."
}
```

<!-- pi:result #call_b5bf7c6122c845fcb6dfa833f1cff8b6|fc_0e05f049ac587a23016aef422b7a6487d2bbc82d640a245c80 -->

```
ok — budget 2 min
```

<!-- pi:tool read #call_2d34b82b1f9a447db7d81e73779b93d1|fc_0e05f049ac587a23016aef422ce2d487d2ae861d07d5f4c223 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_2d34b82b1f9a447db7d81e73779b93d1|fc_0e05f049ac587a23016aef422ce2d487d2ae861d07d5f4c223 -->

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

`debounce(fn, wait)` delays calling `fn` until `wait` milliseconds have passed without another call. Each new call resets the timer, so only the final call in a burst runs.

Use it for actions that should happen after input settles, such as:

- Searching while a user types
- Validating a completed field
- Saving after edits stop
- Responding to window resizing

**Debouncing vs. throttling:**

- **Debounce:** run once after events stop.
- **Throttle:** run at most once per interval while events continue.

Use throttling when you need regular updates during continuous activity, such as scroll or mouse-move handling; use debouncing when intermediate events can be ignored.

<!-- you -->

