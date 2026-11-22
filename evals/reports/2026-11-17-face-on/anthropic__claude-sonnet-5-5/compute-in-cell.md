What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:cell js #g1WJGF -->

```js
viewof principal = Inputs.range([50000, 1500000], {value: 300000, step: 5000, label: "Loan (CHF)"})
viewof rate = Inputs.range([0, 8], {value: 1.8, step: 0.05, label: "Rate (% a year)"})
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
calc = {
  const r = rate / 100 / 12;       // monthly rate
  const n = years * 12;            // number of payments
  const payment = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  return md`Payment = P·r / (1 − (1+r)^−n), with r = ${r.toFixed(5)}, n = ${n}

**Monthly payment: CHF ${payment.toLocaleString("de-CH", {minimumFractionDigits: 2, maximumFractionDigits: 2})}**

Total paid: CHF ${(payment*n).toLocaleString("de-CH", {maximumFractionDigits: 0})}, interest: CHF ${(payment*n - principal).toLocaleString("de-CH", {maximumFractionDigits: 0})}`;
}
```

<!-- pi -->

Likely needs a js-style syntax; use a single cell with plain declarations.

<!-- pi:block -->

<!-- pi:cell ojs #g1WJGF -->

```ojs
{
  const mk = (label, min, max, value, step) => Inputs.range([min, max], {label, value, step});
  return html`<div></div>`;
}
```

<!-- pi:block -->

<!-- pi:cell ojs #pfEVvA -->

```ojs
viewof principal = Inputs.range([50000, 1500000], {value: 300000, step: 5000, label: "Loan (CHF)"})
```

<!-- pi:block -->

<!-- pi:cell ojs #CtDKA5 -->

```ojs
viewof rate = Inputs.range([0, 8], {value: 1.8, step: 0.05, label: "Rate (% a year)"})
```

<!-- pi:block -->

<!-- pi:cell ojs #pVUzAA -->

```ojs
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
```

<!-- pi:block -->

<!-- pi:cell ojs #rsWQJC -->

```ojs
{
  const r = rate / 100 / 12;
  const n = years * 12;
  const payment = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  const f = (x, d) => x.toLocaleString("de-CH", {minimumFractionDigits: d, maximumFractionDigits: d});
  return md`Payment = P·r / (1 − (1+r)^−n), with r = ${r.toFixed(5)} per month, n = ${n}

**Monthly payment: CHF ${f(payment, 2)}**

Total paid: CHF ${f(payment*n, 0)}, of which interest CHF ${f(payment*n - principal, 0)}`;
}
```

<!-- pi:thinking -->

I need to clear a stray empty cell, g1WJGF, and then verify the number using bash.

<!-- pi:tool bash #toolu_0143gnACgubdrD1RmMBLXUg6 -->

```json
{
  "command": "node -e \"r=.018/12;n=300;console.log(300000*r/(1-Math.pow(1+r,-n)))\"",
  "timeout": 10
}
```

<!-- pi:block -->

<!-- pi:cell md #g1WJGF -->

```md
Adjust the loan, rate and term below:
```

<!-- pi:result #toolu_0143gnACgubdrD1RmMBLXUg6 -->

```
1242.5556160205415
```

<!-- pi -->

The monthly payment is about **CHF 1,242.56**. I checked this figure separately in a script; I haven't seen the cells run on the page.

The cells use the standard annuity formula, P·r / (1 − (1+r)^−n). Here r is the monthly rate (1.8% / 12) and n is the number of monthly payments (25 × 12 = 300).

The sliders for loan, rate and years recompute the payment, total paid and total interest when you move them.

<!-- you -->

