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

<!-- pi:thinking -->

I'm trying to work out why assigning to `total` is failing: the error says it's an external variable, so it may be defined in another cell. I'll consider whether the first cell worked only because nothing else defined `total`, and whether switching to `const` would be safer.

I could also just try a different name for the variable, such as `const total = ...`, to see if the conflict goes away.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
total
```

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:block -->

<!-- pi:cell js #4sbkGj -->

```js
prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:thinking -->

I'm looking at cell a1b2c3, which has failed. I could redefine it as the const version and keep a separate displaying cell, since I already added #4sbkGj to show the value. It's cleaner to make a1b2c3 the const version and have the extra cell reference total instead, so I'll redefine it that way.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:block -->

<!-- pi:cell js #4sbkGj -->

```js
total
```

<!-- pi -->

I fixed the total cell, but I haven't seen it run, so the result is unchecked. The total should be 19.7.

There were two problems:
- **Typo:** `prces` should have been `prices`.
- **Assignment error:** My first fix, `total = …`, was rejected as an assignment to an external variable. I changed it to `const total = …`.

Because a `const` declaration shows nothing on its own, I added a small cell (#4sbkGj) that displays `total`.

<!-- you -->

