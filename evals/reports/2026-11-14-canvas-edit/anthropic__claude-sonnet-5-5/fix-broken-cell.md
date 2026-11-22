---
pi: v1
session: eval-fix-broken-cell
---

Add up these prices: 3.50, 4.20 and 12.

<!-- pi -->

Here are the prices and their total, as two cells.

<!-- pi:cell js #c0ffee -->

```js
prices = [3.5, 4.2, 12]
```

<!-- pi:cell js #a1b2c3 -->

```js
total = prces.reduce((sum, price) => sum + price, 0)
```

<!-- you -->

The total cell shows an error. Fix it.

<!-- pi -->

The error is a typo: the cell uses `prces` instead of `prices`. I'll redefine it.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the total cell (#a1b2c3). It referenced `prces`, a typo for `prices`. The redefined cell ran without an error, and the total should be 19.7 (3.5 + 4.2 + 12).

<!-- you -->

