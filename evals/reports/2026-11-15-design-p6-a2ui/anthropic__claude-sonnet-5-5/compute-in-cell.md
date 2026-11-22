What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:cell js #1ic2h7 -->

```js
viewof P = Inputs.range([50000, 2000000], {value: 300000, step: 5000, label: "Loan (CHF)"})
viewof rate = Inputs.range([0, 10], {value: 1.8, step: 0.05, label: "Rate (% a year)"})
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
{
  const r = rate / 100 / 12, n = years * 12;
  const pay = r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n));
  return md`**Monthly payment = P·r / (1 − (1+r)^−n)**, with r = ${(r*100).toFixed(4)}% per month, n = ${n} months

## CHF ${pay.toLocaleString("de-CH", {minimumFractionDigits: 2, maximumFractionDigits: 2})} per month

Total paid: CHF ${(pay*n).toLocaleString("de-CH", {maximumFractionDigits: 0})}, interest: CHF ${(pay*n-P).toLocaleString("de-CH", {maximumFractionDigits: 0})}`;
}
```

<!-- pi -->

Viewof syntax needs ojs mode; I'll use plain JS instead.

<!-- pi:block -->

<!-- pi:cell js #1ic2h7 -->

```js
{
  const P = Inputs.range([50000, 2000000], {value: 300000, step: 5000, label: "Loan (CHF)"});
  const rate = Inputs.range([0, 10], {value: 1.8, step: 0.05, label: "Rate (% a year)"});
  const years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"});
  const out = htl.html`<div></div>`;
  const f = n => n.toLocaleString("de-CH", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const update = () => {
    const r = rate.value / 100 / 12, n = years.value * 12;
    const pay = r === 0 ? P.value / n : P.value * r / (1 - Math.pow(1 + r, -n));
    out.replaceChildren(md`Payment = P·r / (1 − (1+r)^−n), with r = ${(r*100).toFixed(4)}% per month, n = ${n} months

## CHF ${f(pay)} per month

Total paid: CHF ${f(pay*n)}, of which interest CHF ${f(pay*n - P.value)}`);
  };
  for (const i of [P, rate, years]) i.addEventListener("input", update);
  update();
  return htl.html`<div>${P}${rate}${years}${out}</div>`;
}
```

<!-- pi -->

Wrap in an IIFE.

<!-- pi:block -->

<!-- pi:cell js #1ic2h7 -->

```js
(() => {
  const P = Inputs.range([50000, 2000000], {value: 300000, step: 5000, label: "Loan (CHF)"});
  const rate = Inputs.range([0, 10], {value: 1.8, step: 0.05, label: "Rate (% a year)"});
  const years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"});
  const out = htl.html`<div></div>`;
  const f = n => n.toLocaleString("de-CH", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const update = () => {
    const r = rate.value / 100 / 12, n = years.value * 12;
    const pay = r === 0 ? P.value / n : P.value * r / (1 - Math.pow(1 + r, -n));
    out.replaceChildren(md`Payment = P·r / (1 − (1+r)^−n), with r = ${(r*100).toFixed(4)}% per month, n = ${n} months

## CHF ${f(pay)} per month

Total paid: CHF ${f(pay*n)}, of which interest CHF ${f(pay*n - P.value)}`);
  };
  for (const i of [P, rate, years]) i.addEventListener("input", update);
  update();
  return htl.html`<div>${P}${rate}${years}${out}</div>`;
})()
```

<!-- pi:tool bash #toolu_01Do6hMr4559KKtpSh5MU3h2 -->

```json
{
  "command": "python3 -c \"r=.018/12;n=300;print(300000*r/(1-(1+r)**-n))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Do6hMr4559KKtpSh5MU3h2 -->

```
1242.5556160205415
```

<!-- pi -->

The monthly payment is about **CHF 1,242.56**. I checked this figure with a separate calculation.

It uses the standard annuity formula, payment = P·r / (1 − (1+r)^−n). Here r is the monthly rate (1.8% / 12) and n is 300 months.

The cell above has sliders for loan amount, rate and years. The payment, total paid and total interest update as you move them. I couldn't watch the cell run, so I haven't confirmed the sliders update the figures on the page.

<!-- you -->

