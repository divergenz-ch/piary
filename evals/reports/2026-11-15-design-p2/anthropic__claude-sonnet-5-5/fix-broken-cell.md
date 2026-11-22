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

Typo: `prces` should be `prices`.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:thinking -->

I'm wondering whether `total` is already declared in another cell, since the error says it's an external variable. The first cell's `prices` assignment worked, so I'll try declaring `total` with `const` instead of a bare assignment.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
sum = prices.reduce((acc, price) => acc + price, 0)
```

<!-- pi:thinking -->

The first cell worked with a plain `prices =` assignment, so the cause might be that prices is already defined in this notebook. I'm thinking the JS mode may need a `const` declaration, or I could switch to OJS mode, where a bare `total = ...` assignment is native.

<!-- pi:block -->

<!-- pi:cell ojs #a1b2c3 -->

```ojs
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:thinking -->

I'm checking the prices cell, which is in JavaScript mode and sets `prices` and may have worked before. I can't see it running, so I want to verify that before relying on it.

<!-- pi -->

I fixed the total cell (#a1b2c3). The typo `prces` is now `prices`. The cell also failed twice as plain JS with "Assignment to external variable", so I switched it to `ojs` mode, where `total = …` is a normal definition.

The result is 19.7. I couldn't see the cell run, so that figure is my own sum and not something I checked in the page.

<!-- you -->

