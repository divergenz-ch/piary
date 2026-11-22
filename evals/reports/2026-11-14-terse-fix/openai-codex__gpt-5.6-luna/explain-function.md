---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_c6f8f9d393014369a7128b5a09c76147|fc_09ae0d352be20a23016af87125de4887d2a38f174ae592344f -->

```json
{
  "minutes": 1,
  "reason": "Inspect src/timing.js and briefly compare debounce with throttling."
}
```

<!-- pi:result #call_c6f8f9d393014369a7128b5a09c76147|fc_09ae0d352be20a23016af87125de4887d2a38f174ae592344f -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_cc1c871486784a6498085f4a9de201e9|fc_09ae0d352be20a23016af87127c51087d29f24bd138ceb9742 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_cc1c871486784a6498085f4a9de201e9|fc_09ae0d352be20a23016af87127c51087d29f24bd138ceb9742 -->

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

`debounce(fn, wait)` returns a wrapper that delays calling `fn` until `wait` milliseconds have passed without another call. Each new call cancels and restarts the timer, using the latest arguments.

Use it when only the **final result after activity stops** matters—for example:

- Search-as-you-type requests
- Resizing or layout recalculation
- Saving after the user pauses editing

Throttling instead limits execution to at most once per interval while events continue, making it better for continuous feedback such as scroll handlers, mouse movement, or progress updates.

<!-- you -->

