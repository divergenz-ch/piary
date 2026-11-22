We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out whether the $38k monthly burn is gross or net, and I'll take it as expenses with revenue offsetting that, so net burn is $38k minus revenue. Next I'll run the calculation in bash.

<!-- pi:tool bash #toolu_01HzAvt6fvM1cmJp87MoTwof -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    c+=r-38;r*=1+g/100;m+=1\n    if r>=38 and 0:pass\n  print(g,m,round(c),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01HzAvt6fvM1cmJp87MoTwof -->

```
5 120 79419 4186.9
8 120 1533719 123035.9
12 120 80563846 9668163.1
```

<!-- pi:thinking -->

I'm checking whether cash ever runs out, starting from month 1 revenue of 12 and a net of -26, and also looking at the 5% growth case where revenue reaches about 38 around month 24. I need the minimum cash balance, the breakeven month, and the runway if growth stays at zero.

<!-- pi:tool bash #toolu_01JTT9zyFr3aAeT9vXoQnwzi -->

```json
{
  "command": "python3 -c \"\nfor g in (0,5,8,12):\n  c=480;r=12;m=0;mn=c;mm=0;be=None\n  while m<120:\n    if r>=38 and be is None:be=m+1\n    c+=r-38;r*=1+g/100;m+=1\n    if c<mn:mn=c;mm=m\n    if c<0:print(g,'out',m);break\n  else:print(g,'min',round(mn),mm,'breakeven',be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01JTT9zyFr3aAeT9vXoQnwzi -->

```
0 out 19
5 min 102 24 breakeven 25
8 min 236 15 breakeven 16
12 min 310 11 breakeven 12
```

<!-- pi -->

Assuming $38k is total monthly expenses, so net burn is $38k minus that month's revenue, you don't run out of cash at any of these growth rates. Revenue overtakes expenses first.

| Growth | Lowest cash | Month of lowest cash | Revenue passes $38k |
|---|---|---|---|
| 5% | about $102k | 24 | month 25 |
| 8% | about $236k | 15 | month 16 |
| 12% | about $310k | 11 | month 12 |

- **Zero growth:** cash runs out in month 19, about June 2028. This is the baseline the growth rates beat.
- **5% growth:** this is the tight case. You'd have only about $100k left at the bottom, so a small miss on growth or a cost increase could put you at risk.
- **Sensitivity:** the result depends on the growth rate holding for about two years. If growth stalls early, you hit the zero-growth outcome.

If the $38k is net burn after revenue, the answer is different. Cash would last about 12.6 months with no growth, and growth would stretch that. Tell me if that's what you meant and I'll rerun it.

<!-- you -->

