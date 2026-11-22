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

I'm fixing the typo "prces" to "prices" by redefining cell a1b2c3. The system prompt text that appears in the user turn is a bit unusual, but since it's just user content, it doesn't affect the fix, so I'll go ahead and make the change.

<!-- pi -->

The total cell has a typo: `prces` should be `prices`. I'll redefine the cell.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the total cell by changing the misspelled `prces` to `prices`. It ran without errors. I didn't check the value it shows, but 3.50 + 4.20 + 12 should come to 19.70.

<!-- you -->

