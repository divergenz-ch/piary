---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_7517888d420045659c376e4bc998641c|fc_0c489d43a2893c09016af067b1d59087d29b716bb8b285285c -->

```json
{
  "minutes": 1,
  "reason": "Inspect src/timing.js and briefly compare debounce with throttling."
}
```

<!-- pi:result #call_7517888d420045659c376e4bc998641c|fc_0c489d43a2893c09016af067b1d59087d29b716bb8b285285c -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_9df736fd87314abb8964faa3bf39b7fb|fc_0c489d43a2893c09016af067b34bbc87d2a4b99c272f2a0225 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_9df736fd87314abb8964faa3bf39b7fb|fc_0c489d43a2893c09016af067b34bbc87d2a4b99c272f2a0225 -->

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

`debounce(fn, wait)` delays calling `fn` until no calls have occurred for `wait` milliseconds. Each new call cancels and restarts the timer, and only the latest arguments are used.

Use it when you want one action after activity settles—for example:

- Search input: request results after the user stops typing
- Window resizing: recalculate layout after resizing ends
- Autosave: save after edits pause

Use throttling instead when you need periodic updates during continuous activity, such as updating scroll position or handling mouse movement at a limited rate.

<!-- you -->

