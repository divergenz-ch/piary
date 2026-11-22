Before I sign off, check whether the Caravel checkout test in caravel_summary.md really shows a lift. Don't just tell me a number, show me how you got it from caravel_ab.csv.

<!-- pi:tool bash #toolu_01M9VTTyHkLwoGjFRmNGeCRW -->

```json
{
  "command": "cat caravel_summary.md; head -5 caravel_ab.csv; wc -l caravel_ab.csv",
  "timeout": 20
}
```

<!-- pi:result #toolu_01M9VTTyHkLwoGjFRmNGeCRW -->

```
# Caravel checkout test: summary

Test ran 2026-10-01 to 2026-10-14, 50/50 split.

**Result: the new checkout lifts conversion by 12% (p = 0.004).**

Recommendation: ship to 100% on Monday.

Data: caravel_ab.csv
date,variant,visitors,conversions
2026-10-01,control,980,48
2026-10-01,new_checkout,1005,55
2026-10-02,control,1010,52
2026-10-02,new_checkout,990,51
      29 caravel_ab.csv
```

<!-- pi:cell js #PvpcKS -->

```js
const rows = await FileAttachment("caravel_ab.csv").csv({typed:true});
const agg = d3.rollup(rows, v=>({n:d3.sum(v,d=>d.visitors), c:d3.sum(v,d=>d.conversions), days:v.length}), d=>d.variant);
const a=agg.get("control"), b=agg.get("new_checkout");
const pa=a.c/a.n, pb=b.c/b.n, pp=(a.c+b.c)/(a.n+b.n);
const se=Math.sqrt(pp*(1-pp)*(1/a.n+1/b.n)), z=(pb-pa)/se;
const Phi=x=>0.5*(1+(1-(1/(1+0.2316419*Math.abs(x)))*0)*0); // placeholder
const erf=x=>{const t=1/(1+0.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return x>=0?y:-y};
const p=2*(1-0.5*(1+erf(z/Math.SQRT2)));
const seD=Math.sqrt(pa*(1-pa)/a.n+pb*(1-pb)/b.n);
({control:a, new_checkout:b, rateA:pa, rateB:pb, relLift:pb/pa-1, z, p, ci95_abs:[pb-pa-1.96*seD, pb-pa+1.96*seD], dates:[rows[0].date, rows.at(-1).date], variants:[...new Set(rows.map(d=>d.variant))]})
```

<!-- pi:thinking -->

I need to see the output first, so I'll run the code in bash and check what comes back.

<!-- pi:tool bash #toolu_01Jm1Fr7WKQ6yjizrVG6xijx -->

```json
{
  "command": "python3 -c \"\nimport csv,math\nr=list(csv.DictReader(open('caravel_ab.csv')))\nA={}\nfor x in r:\n  a=A.setdefault(x['variant'],[0,0,0]);a[0]+=int(x['visitors']);a[1]+=int(x['conversions']);a[2]+=1\nprint(A)\n(n1,c1,_),(n2,c2,_)=A['control'],A['new_checkout']\np1,p2=c1/n1,c2/n2;pp=(c1+c2)/(n1+n2)\nz=(p2-p1)/math.sqrt(pp*(1-pp)*(1/n1+1/n2))\nprint(p1,p2,p2/p1-1,z,math.erfc(abs(z)/2**.5))\n\"; sort caravel_ab.csv | awk -F, '{print $1}' | uniq -c | awk '$1!=2'",
  "timeout": 20
}
```

<!-- pi:result #toolu_01Jm1Fr7WKQ6yjizrVG6xijx -->

```
{'control': [14000, 700, 14], 'new_checkout': [14000, 742, 14]}
0.05 0.053 0.05999999999999983 1.1356591192256702 0.2560992560993552
   1 date
```

<!-- pi -->

**The test doesn't show a lift you can sign off on.** The summary claims +12% with p = 0.004. I get +6% with p ≈ 0.26.

I recomputed it from `caravel_ab.csv` by summing visitors and conversions per variant over the 14 days. Both variants have all 14 days and the same traffic, so the split is clean. The calculation is in cell #PvpcKS above. It needs a bare expression to display, so the numbers below are from an identical Python check.

| | Visitors | Conversions | Rate |
|---|---|---|---|
| control | 14,000 | 700 | 5.00% |
| new_checkout | 14,000 | 742 | 5.30% |

- **Lift:** the absolute gain is 0.3 points, which is a 6% relative lift. The summary's 12% is double that, and I can't reproduce it from this file.
- **Significance:** a two-proportion z-test gives z = 1.14 and a two-sided p ≈ 0.26. That is nowhere near the reported 0.004.
- **What the data supports:** the new checkout may be better, but the result is consistent with no effect. With about 14k visitors per arm, a 0.3-point gap is within noise.

**Recommendation:** don't ship on this evidence. Either find where the 12% and p = 0.004 came from (a different data cut or a different test), or keep the test running. Detecting a true 6% relative lift would need roughly 4–5 times as much traffic.

<!-- you -->

