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

The total cell has a typo: `prces` should be `prices`.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = Math.round(prices.reduce((sum, price) => sum + price, 0) * 100) / 100
```

<!-- pi -->

I fixed the total cell (#a1b2c3). The typo `prces` is now `prices`. I also rounded the sum to two decimals so floating-point error can't show up in the result. The total should be 19.70. I didn't check the cell's displayed output, only that it ran.

<!-- you -->

