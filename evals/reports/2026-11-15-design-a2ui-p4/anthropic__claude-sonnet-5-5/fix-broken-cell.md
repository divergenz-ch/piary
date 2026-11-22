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

The cause is a typo: `prces` should be `prices`.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the total cell. It had a typo, `prces` instead of `prices`. The cell now ran without an error, and the total should be 19.7 (3.5 + 4.2 + 12). I haven't looked at the displayed value.

<!-- you -->

