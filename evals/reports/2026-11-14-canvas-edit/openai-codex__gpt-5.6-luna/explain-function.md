---
pi: v1
session: eval-explain-function
---

What does `debounce` in `src/timing.js` do, and when would I use it instead of throttling?

<!-- pi:tool budget #call_abe963785531404b97eb696e7db111ea|fc_0d1f1a710590878e016af83711d80487d2a21f19ecef81aad0 -->

```json
{
  "minutes": 1,
  "reason": "Inspect src/timing.js and briefly compare debounce with throttling."
}
```

<!-- pi:result #call_abe963785531404b97eb696e7db111ea|fc_0d1f1a710590878e016af83711d80487d2a21f19ecef81aad0 -->

```
ok — budget 1 min
```

<!-- pi:tool read #call_77ff2bc2a26947029cfffb96cc9db860|fc_0d1f1a710590878e016af83713933087d2b7ffa472319ce9fc -->

```json
{
  "path": "src/timing.js",
  "offset": 1,
  "limit": 200
}
```

<!-- pi:result #call_77ff2bc2a26947029cfffb96cc9db860|fc_0d1f1a710590878e016af83713933087d2b7ffa472319ce9fc -->

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

`debounce(fn, wait)` delays calling `fn` until no calls have occurred for `wait` milliseconds. Each new call cancels the previous timer, so only the latest arguments are used.

Use it when you care about the **final result after activity stops**, such as:

- Search requests while typing
- Validating form input
- Saving after the user pauses
- Handling window resize completion

Use **throttling** when you need execution at a controlled, regular rate during continuous activity, such as scrolling, dragging, or pointer movement.

<!-- you -->

