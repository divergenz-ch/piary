---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #call_d4053734d4234bf383a451ce4a6543f9|fc_083bea43273b6078016aef33e3ed0087d29fc943292e05e081 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_d4053734d4234bf383a451ce4a6543f9|fc_083bea43273b6078016aef33e3ed0087d29fc943292e05e081 -->

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

`debounce` delays calling `fn` until `wait` milliseconds have passed without another call:

- Each invocation cancels the previous timer.
- Only the arguments from the final call are used.
- The function runs once after activity stops.

Use it for events where you care about the final state, such as search input, window resizing, or form validation.

Throttling instead limits execution to at most once per interval while events continue, making it better for continuous updates such as scrolling, mouse movement, or progress reporting.

<!-- you -->

