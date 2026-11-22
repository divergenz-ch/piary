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

I'm fixing the "prces" typo to "prices" by redefining cell a1b2c3. The skill said to read before first use, but I'd already called it, so I'm just correcting it. I can't see the output, only that it returned ok, so I'll report it as redefined rather than verified.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the `total` cell (#a1b2c3). It had a typo, `prces`, where it should have read `prices`. It now sums the `prices` cell.

I can't see the cell's output from here, so check that it now shows a total. By hand, 3.50 + 4.20 + 12 = 19.70. In floating point the cell might show something like 19.7 or 19.700000000000003. If you see the long version, wrapping the sum in `.toFixed(2)` will tidy it.

<!-- you -->

