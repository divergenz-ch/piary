We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out net burn: the $38k in expenses minus the $12k revenue, which is growing. I'll run the numbers with bash.

<!-- pi:tool bash #toolu_01LFbG9BBVGjcgXAKmFTNzb5 -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g/100\n    if m<=1:pass\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01LFbG9BBVGjcgXAKmFTNzb5 -->

```
5 120 79418.9 4186.9
8 120 1533718.9 123035.9
12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I'm working out when revenue catches up with expenses: breakeven at 5% growth is around month 23.6, 15 at 8%, and 10.2 at 12%. Since the cash minimum matters, I need to check whether the 5% case actually stays solvent, so I'll compute the minimum cash balance.

<!-- pi:tool bash #toolu_01SYGkUThXBj2kwuAPDKMNZE -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;lm=0\n  for m in range(1,61):\n    c+=r-38;r*=1+g/100\n    if c<lo:lo=c;lm=m\n  print(g,lm,round(lo,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01SYGkUThXBj2kwuAPDKMNZE -->

```
5 24 102.0
8 15 235.8
12 11 309.9
```

<!-- pi -->

You probably don't run out of money in any of the three cases. This assumes the $38k is fixed monthly spending, so net burn is $38k minus that month's revenue. Revenue grows from $12k a month, and the first month's revenue arrives in month 1.

| Growth | Revenue passes $38k in | Lowest cash | At month |
|---|---|---|---|
| 5% | about month 24 | about $102k | 24 |
| 8% | about month 15 | about $236k | 15 |
| 12% | about month 11 | about $310k | 11 |

- **If growth holds:** at 5% you get close to a $100k floor, but you still don't hit zero. Higher growth leaves a much larger cushion.
- **If it doesn't:** if growth stalls and revenue stays at $12k, the net burn is a flat $26k a month. That runs out in about 18 months (480 ÷ 26), around May 2028.
- **If costs rise:** the $38k is assumed flat. Any increase in spending cuts into these floors, and 5% growth is the case most exposed.

<!-- you -->

