---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool bash #toolu_01PnrXaQ2PfuhFpnYRQt6ia8 -->

```json
{
  "command": "cat src/timing.js",
  "timeout": 10
}
```

<!-- pi:result #toolu_01PnrXaQ2PfuhFpnYRQt6ia8 -->

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

**What it does:** `debounce(fn, wait)` returns a wrapped version of `fn`. Each call to the wrapper cancels any pending call and starts a new `wait`-ms timer. `fn` runs only after `wait` ms pass with no further calls, and it receives the arguments from the last call.

Limitations of this version:
- It has no `cancel` or `flush`.
- It has no leading-edge option.
- It doesn't preserve `this`, because it uses an arrow function.

**Debounce vs. throttle:**
- **Debounce** waits until the burst of events stops, then fires once. Use it when only the final value matters. Examples are search-as-you-type, autosave after typing stops, validating a form field, and resizing a layout once the user finishes dragging.
- **Throttle** fires at most once per interval while events keep coming. Use it when you need regular updates during continuous activity. Examples are scroll position tracking, mousemove or drag handlers, and progress reporting.

A quick rule: choose debounce if you want to react "after it settles", and throttle if you want to react "while it's happening, but not too often". Debounce can also starve. If events never pause for `wait` ms, `fn` never runs.

<!-- you -->

