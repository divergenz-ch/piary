What is the monthly payment on a 300 000 CHF mortgage at 1.8% a year over 25 years? Show the calculation so I can change the numbers.

<!-- pi:artifact @mortgage -->

<!-- pi:cell js #JbK9M4 -->

```js
viewof p = Inputs.range([50000, 2000000], {value: 300000, step: 5000, label: "Principal (CHF)"})
viewof rate = Inputs.range([0, 10], {value: 1.8, step: 0.05, label: "Annual rate (%)"})
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
```

<!-- pi:cell js #4Hzc9i -->

```js
{
  const r = rate/100/12, n = years*12;
  const pay = r === 0 ? p/n : p*r/(1-Math.pow(1+r,-n));
  const f = x => x.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2});
  return md`**Monthly payment: CHF ${f(pay)}**

M = P·r / (1 − (1+r)^−n), with r = ${rate}%/12 = ${r.toFixed(6)}, n = ${n}

Total paid: CHF ${f(pay*n)} · interest: CHF ${f(pay*n-p)}`;
}
```

<!-- pi -->

Those need ojs mode.

<!-- pi:block -->

<!-- pi:artifact @mortgage -->

<!-- pi:cell ojs #JbK9M4 -->

```ojs
viewof p = Inputs.range([50000, 2000000], {value: 300000, step: 5000, label: "Principal (CHF)"})
```

<!-- pi:cell ojs #sStGVq -->

```ojs
viewof rate = Inputs.range([0, 10], {value: 1.8, step: 0.05, label: "Annual rate (%)"})
```

<!-- pi:cell ojs #o7LZjy -->

```ojs
viewof years = Inputs.range([1, 40], {value: 25, step: 1, label: "Years"})
```

<!-- pi:cell ojs #4Hzc9i -->

```ojs
{
  const r = rate/100/12, n = years*12;
  const pay = r === 0 ? p/n : p*r/(1-Math.pow(1+r,-n));
  const f = x => x.toLocaleString("de-CH",{minimumFractionDigits:2,maximumFractionDigits:2});
  return md`**Monthly payment: CHF ${f(pay)}**

M = P·r / (1 − (1+r)^−n), with r = ${rate}%/12 = ${r.toFixed(6)}, n = ${n}

Total paid: CHF ${f(pay*n)} · interest: CHF ${f(pay*n-p)}`;
}
```

<!-- pi:tool bash #toolu_01GqpDp7H8nS6VLN2LrMEcQy -->

```json
{
  "command": "python3 -c \"r=.018/12;n=300;print(300000*r/(1-(1+r)**-n))\"",
  "timeout": 5
}
```

<!-- pi:result #toolu_01GqpDp7H8nS6VLN2LrMEcQy -->

```
1242.5556160205415
```

<!-- pi -->

The monthly payment is about **CHF 1,242.56**. I checked this with a separate calculation, but I haven't seen the cells run in the page.

The cells above have sliders for principal, annual rate and years. The result updates when you move them. It uses the standard annuity formula M = P·r / (1 − (1+r)^−n). Here r is the annual rate divided by 12, and n is the number of months.

<!-- you -->

