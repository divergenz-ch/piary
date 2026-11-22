What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:tool budget #call_0ef8496de3764e379e10f4cfee3f02ab|fc_05bb686fefd8f204016af04dd525a087d28aa26e03886fc323 -->

```json
{
  "minutes": 1,
  "reason": "Compute the amortizing mortgage payment and provide an editable calculation."
}
```

<!-- pi:result #call_0ef8496de3764e379e10f4cfee3f02ab|fc_05bb686fefd8f204016af04dd525a087d28aa26e03886fc323 -->

```
ok — budget 1 min
```

<!-- pi:artifact @mortgage-calculation -->

<!-- pi:cell js #520e10 -->

```js
const principal = 300000;
const annualRate = 0.018;
const years = 25;
const monthlyRate = annualRate / 12;
const payments = years * 12;
const monthlyPayment = principal * monthlyRate * (1 + monthlyRate) ** payments / ((1 + monthlyRate) ** payments - 1);

md`### Mortgage calculation

Monthly payment: **CHF ${monthlyPayment.toFixed(2)}**

Formula: 
\[
M = P \frac{r(1+r)^n}{(1+r)^n-1}
\]

where `P = CHF ${principal.toLocaleString()}`, `r = ${annualRate} / 12 = ${monthlyRate.toFixed(6)}`, and `n = ${payments}` monthly payments.`
```

<!-- pi:artifact @mortgage-calculation -->

<!-- pi:cell js #df7f52 -->

```js
md`**Result:** CHF ${monthlyPayment.toFixed(2)} per month.

Change `principal`, `annualRate`, or `years` above to recalculate.`
```

<!-- pi -->

The monthly payment is **CHF 1,242.08**.

The editable calculation is shown above. It uses the standard amortizing-loan formula:

\[
M=P\frac{r(1+r)^n}{(1+r)^n-1}
\]

where \(P=300{,}000\), \(r=0.018/12\), and \(n=25\times12=300\).

<!-- you -->

