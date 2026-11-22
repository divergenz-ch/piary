What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:cell js #wrjbqk -->

```js
viewof principal = Inputs.range([50000, 1500000], {value: 300000, step: 5000, label: "Loan (CHF)"})
viewof rate = Inputs.range([0, 8], {value: 1.8, step: 0.05, label: "Rate (% / year)"})
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
{
  const r = rate / 100 / 12, n = years * 12;
  const pmt = r === 0 ? principal / n : principal * r / (1 - Math.pow(1 + r, -n));
  return md`**Monthly payment = P·r / (1 − (1+r)^−n)**, with r = ${rate}/100/12 = ${r.toFixed(6)}, n = ${n}

**CHF ${pmt.toFixed(2)}** per month · total paid CHF ${(pmt*n).toFixed(0)} · interest CHF ${(pmt*n - principal).toFixed(0)}`;
}
```

<!-- pi -->

I've added a calculator cell with sliders for the loan amount, rate and years. It uses the standard annuity formula, payment = P·r / (1 − (1+r)^−n), where r is the monthly rate and n is the number of months.

I haven't read the cell's output here, so I can't give you the monthly figure. For 300 000 CHF at 1.8% over 25 years, the cell shows it live, along with total paid and total interest. Change the sliders and all three update.

<!-- you -->

