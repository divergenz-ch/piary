---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_9cbef99d0abf49429be3b3b988c54bec|fc_0cec27e77360a78e016aefc138991487d29f2ab49e1670d111 -->

```json
{
  "minutes": 1,
  "reason": "Inspect src/timing.js and briefly compare debounce with throttling."
}
```

<!-- pi:result #call_9cbef99d0abf49429be3b3b988c54bec|fc_0cec27e77360a78e016aefc138991487d29f2ab49e1670d111 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_b90c48e7137e42b989110813507eb682|fc_0cec27e77360a78e016aefc139b75c87d29ed42152a4d35043 -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_b90c48e7137e42b989110813507eb682|fc_0cec27e77360a78e016aefc139b75c87d29ed42152a4d35043 -->

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

`debounce(fn, wait)` delays calling `fn` until no new call has occurred for `wait` milliseconds. Each call resets the timer, so rapid calls result in only one invocation—with the latest arguments—after activity stops.

Use it for actions that should happen **after input settles**, such as:

- Search requests while typing
- Saving after edits pause
- Handling window resize completion

Use **throttling** when you need regular updates during continuous activity, such as scroll or mouse-move handling.

<!-- you -->

