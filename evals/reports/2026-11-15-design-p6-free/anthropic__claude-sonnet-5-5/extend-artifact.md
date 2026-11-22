---
pi: v1
session: eval-extend-artifact
---

Make me a small savings calculator.

<!-- pi -->

A calculator in two cells: the inputs, then the result.

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
monthly = 500
```

<!-- pi:cell js #r3su1t -->

```js
html`<p>After 10 years: <strong>${(monthly * 12 * 10).toLocaleString()}</strong></p>`
```

<!-- you -->

Turn the monthly amount into a slider from 100 to 2000.

<!-- pi:artifact @savings -->

<!-- pi:cell js #s4v1n6 -->

```js
viewof monthly = Inputs.range([100, 2000], {value: 500, step: 50, label: "Monthly amount"})
```

<!-- pi:thinking -->

I'm noting that `viewof` is Observable JavaScript syntax, so the answer should be written in ojs mode.

<!-- pi:block -->

<!-- pi:artifact @savings -->

<!-- pi:cell ojs #s4v1n6 -->

```ojs
viewof monthly = Inputs.range([100, 2000], {value: 500, step: 50, label: "Monthly amount"})
```

<!-- pi -->

The monthly amount is now a slider from 100 to 2000, starting at 500 and moving in steps of 50. The result cell reads `monthly`, so it should update as you drag. I haven't seen it run, so I haven't confirmed that.

<!-- you -->

