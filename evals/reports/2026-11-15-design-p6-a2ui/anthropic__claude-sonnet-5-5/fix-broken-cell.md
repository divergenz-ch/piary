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

I'm wondering why "total" is flagged as an external variable, since another cell might define it or it could be a global. Maybe the earlier prices worked for a different reason. I'll try declaring it with `const`.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
total
```

<!-- pi:thinking -->

I'm wondering why the trailing "total" didn't show up in the output. The note says it's declaration-only, so I need to add a display cell to actually show it.

<!-- pi:block -->

<!-- pi:cell js #MB31AM -->

```js
total
```

<!-- pi -->

I fixed the total cell (#a1b2c3). The typo `prces` is now `prices`. I also declared the variable as `const total`, because the plain `total = …` form was rejected.

I added a small cell (#MB31AM) that displays `total`. It should show 19.7. I haven't seen it run, so check that it renders.

<!-- you -->

