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

I'm noticing a typo in "prces" and an earlier cell ID, c0ffee, that I made up myself, which is fine. I'll redefine a1b2c3, since I'm not sure that ID exists.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi -->

Declare it with `const` rather than assigning to it.

<!-- pi:block -->

<!-- pi:cell js #a1b2c3 -->

```js
total = prices.reduce((sum, price) => sum + price, 0)
```

<!-- pi:block -->

<!-- pi:cell js #c0ffee -->

```js
prices = [3.5, 4.2, 12]
```

<!-- pi:thinking -->

I caught myself repeating the same point, so I'll just switch to const here.

<!-- pi:block -->

<!-- pi:cell js #c0ffee -->

```js
const prices = [3.5, 4.2, 12]
```

<!-- pi:cell js #a1b2c3 -->

```js
const total = prices.reduce((sum, price) => sum + price, 0);
total
```

<!-- pi:thinking -->

I'm checking whether the note about declaration-only still fits, since the cell ends with an expression and "renders nothing" might not be accurate. To be safe, I'll keep the total as a const and add a separate display cell.

<!-- pi:block -->

<!-- pi:cell js #7DczkC -->

```js
total
```

<!-- pi -->

I fixed the total cell, but I haven't seen it run, so I can't confirm the number it shows. It should come to 19.7.

The error had two causes:
- **Typo:** the cell read `prces` instead of `prices`.
- **Missing declarations:** both cells assigned to their names without declaring them, which the cell runtime rejects. I added `const` to each.

Declaring `total` with `const` means that cell no longer displays anything by itself. I added a small cell below it that shows `total`.

<!-- you -->

