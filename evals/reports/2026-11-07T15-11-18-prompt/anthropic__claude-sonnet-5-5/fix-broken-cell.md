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

<!-- pi:thinking -->

I've spotted the mistake: "prces" is a typo, so I need to redefine cell a1b2c3 to fix it. The first cell with the prices list looks fine as it is.

<!-- pi -->

The total cell has a typo: `prces` should be `prices`. I'll redefine the cell with the fix.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the total cell (#a1b2c3). The typo `prces` is now `prices`, and the cell ran without an error. The total should be 19.7 (3.5 + 4.2 + 12). I haven't looked at the cell's displayed value to confirm it.

<!-- you -->

