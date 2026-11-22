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

The first cell, `prices = [...]`, ran without trouble, so the problem isn't a general naming clash. The error says "total" is an external variable, which makes me suspect another cell already defines it. I'll look for that, or switch to a bare expression or a `const` declaration.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
total
```

<!-- pi:thinking -->

I'm checking whether the note about rendering nothing applies, since I did include a bare `total`, so I'll switch to using `display` to be safe. I'm computing the value to verify it comes out to 19.7.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

I fixed the total cell (#a1b2c3). It had two problems:

- **Typo:** it referred to `prces` instead of `prices`.
- **Variable name:** the `total = …` form failed with "Assignment to external variable". I changed the cell to a plain expression that sums `prices`, so it no longer declares `total`.

The cell should now show 19.7 (3.5 + 4.2 + 12). I haven't seen it render, so check that it displays the value.

<!-- you -->

