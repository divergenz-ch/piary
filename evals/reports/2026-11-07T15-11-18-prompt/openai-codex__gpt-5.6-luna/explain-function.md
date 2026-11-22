---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool read #call_a3abfd79ac194a038537b4aee4fdc4d2|fc_0858af9f29ebca8b016aef3faf53dc87d2ba1bec1d72728d65 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_a3abfd79ac194a038537b4aee4fdc4d2|fc_0858af9f29ebca8b016aef3faf53dc87d2ba1bec1d72728d65 -->

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

`debounce` delays calling `fn` until `wait` milliseconds have passed without another call. Each new call resets the timer, so rapid repeated calls produce only one invocation—with the latest arguments.

Use it when you care about the **final** action after activity stops, such as:

- Searching after the user finishes typing
- Saving edits after a pause
- Handling window resizing after resizing ends

Use **throttling** when you need regular updates during continuous activity, such as scrolling, dragging, or mouse movement.

<!-- you -->

