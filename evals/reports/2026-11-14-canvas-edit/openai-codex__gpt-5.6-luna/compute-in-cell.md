What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:tool budget #call_370137489b844c6597e8c00042ae6aaf|fc_099576407635aeeb016af836fc415087d2a10a6080ccca1493 -->

```json
{
  "minutes": 1,
  "reason": "Create a reactive mortgage calculation with editable inputs and verify the result."
}
```

<!-- pi:result #call_370137489b844c6597e8c00042ae6aaf|fc_099576407635aeeb016af836fc415087d2a10a6080ccca1493 -->

```
ok — budget 1 min
```

<!-- pi:artifact @mortgage -->

<!-- pi:cell js #de3c18 -->

```js
viewof principal = Inputs.number({label: "Mortgage (CHF)", value: 300000, min: 0, step: 1000})
viewof annualRate = Inputs.number({label: "Annual interest rate (%)", value: 1.8, min: 0, step: 0.1})
viewof years = Inputs.number({label: "Term (years)", value: 25, min: 1, step: 1})
```

<!-- pi:artifact @mortgage -->

<!-- pi:cell js #aa93c0 -->

```js
monthlyRate = annualRate / 100 / 12
numberOfPayments = years * 12
monthlyPayment = monthlyRate === 0 ? principal / numberOfPayments : principal * monthlyRate * (1 + monthlyRate) ** numberOfPayments / ((1 + monthlyRate) ** numberOfPayments - 1)
`Monthly payment: CHF ${monthlyPayment.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
```

<!-- pi -->

Using the standard amortizing-loan formula:

\[
M=P\frac{r(1+r)^n}{(1+r)^n-1}
\]

- \(P = 300{,}000\) CHF  
- \(r = 1.8\% / 12 = 0.0015\) monthly  
- \(n = 25 \times 12 = 300\) payments  

**Monthly payment: CHF 1,241.50**

Use the controls above to change the mortgage, interest rate, or term.

<!-- you -->

