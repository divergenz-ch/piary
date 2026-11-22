We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the net burn as gross expenses of $38k minus current revenue, which starts at $12k and grows from next month. I'll run three scenarios with a quick calculation to see how cash evolves.

<!-- pi:tool bash #toolu_012W6XGG5LJ4nGPw8UHM3y7T -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<200:\n    m+=1;c+=r-38;r*=1+g/100\n    if m>60:break\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_012W6XGG5LJ4nGPw8UHM3y7T -->

```
5 61 2629.2 235.4
8 61 14415.6 1312.3
12 61 98592.9 12063.7
```

<!-- pi:thinking -->

I'm checking whether revenue ever gets above 38k, and computing the minimum cash balance, to see if the company runs out of money. I need to find the month when revenue reaches 38.

<!-- pi:tool bash #toolu_012vE8YmbYeYvUiJDfzTLBMo -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;lm=0;be=None\n  for m in range(1,61):\n    c+=r-38\n    if c<lo:lo=c;lm=m\n    if r>=38 and be is None:be=m\n    r*=1+g/100\n  print(g,round(lo),lm,be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_012vE8YmbYeYvUiJDfzTLBMo -->

```
5 102 24 25
8 236 15 16
12 310 11 12
```

<!-- pi -->

**You don't run out of money in any of the three cases, if revenue really compounds at that rate every month.** I treated $38k as gross monthly expenses, with the first month's revenue at $12k and growth starting the month after.

| Monthly growth | Revenue passes $38k | Lowest cash | Low point |
|---|---|---|---|
| 5% | month 25 | about $102k | month 24 |
| 8% | month 16 | about $236k | month 15 |
| 12% | month 12 | about $310k | month 11 |

- **At 8%:** cash bottoms out around $236k, about half of today's balance, and then recovers.
- **At 5%:** it's tight. You'd burn roughly $380k over two years and hold only about $100k of runway at the low point. A small miss in growth or a cost increase would put you at real risk.
- **At 12%:** you break even about a year out and the dip is shallow.

If $38k is already net burn (expenses minus revenue), the answer changes a lot. Flat $38k net burn runs out in about 12.6 months, and growth would stretch that. Tell me if that's the case and I'll rerun it.

Sustained 5–12% monthly growth for two years or more is very aggressive. A more realistic check is to let growth fade over time.

<!-- you -->

