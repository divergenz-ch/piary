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

Typo: `prces` should be `prices`. I'll redefine the cell.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:thinking -->

The `prices` cell with `c0ffee` ran fine, but the total still fails. I suspect the first assignment was implicit too, so I'll switch to `const`.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
total
```

<!-- pi:thinking -->

I'm checking the second item that got replaced, since "total" is declared but doesn't seem to render anything. The note says it's declaration-only, so I need to make sure it actually displays.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:thinking -->

The error says "external variable total", which makes me wonder whether another cell already declared it, or whether an earlier call created it in the shared scope. Either way, I'll switch to a `const` declaration and display the result.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
display(total)
```

<!-- pi -->

I fixed the total cell (#a1b2c3). The cause was a typo: it read `prces` instead of `prices`. It now declares `const total = prices.reduce(...)` and displays the result, which should be 19.7.

I haven't seen the cell run, so please check that it shows 19.7. The bare `total = …` form was rejected as an assignment to an external variable, so I switched to `const`.

<!-- you -->

