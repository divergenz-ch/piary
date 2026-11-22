We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the cash balance: the $38k monthly burn is gross spend, so net burn is that minus the growing $12k revenue. I'll run the projection in bash for three growth rates, taking this month's revenue as $12k and growth starting the month after.

<!-- pi:tool bash #toolu_013p8JvwRmmMBa7QLGdstgq1 -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g/100\n    if m in(12,24):print(g,'m',m,round(c))\n  print(g,'out month',m,round(c),'rev',round(r/(1+g/100),1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_013p8JvwRmmMBa7QLGdstgq1 -->

```
5 m 12 215
5 m 24 102
5 out month 120 79419 rev 3987.6
8 m 12 252
8 m 24 369
8 out month 120 1533719 rev 113922.1
12 m 12 314
12 m 24 986
12 out month 120 80563846 rev 8632288.4
```

<!-- pi:thinking -->

I'm checking whether cash ever runs out, and with 5% growth it looks like the low point sits around 100 and then climbs, so it never goes negative. I'll look for the exact minimums next.

<!-- pi:tool bash #toolu_01G6UESpyXWXX28fmyjUp6D9 -->

```json
{
  "command": "python3 -c \"\nfor g in (0,3,5,8,12):\n  c=480;r=12;m=0;lo=(480,0)\n  for m in range(1,121):\n    c+=r-38;r*=1+g/100\n    if c<lo[0]:lo=(c,m)\n    if c<0:print(g,'out',m);break\n  else:print(g,'min',round(lo[0]),lo[1])\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01G6UESpyXWXX28fmyjUp6D9 -->

```
0 out 19
3 out 23
5 min 102 24
8 min 236 15
12 min 310 11
```

<!-- pi -->

**Short answer: at 5%, 8% or 12% growth you don't run out of money, as long as growth holds.** I treated $38k as total monthly spend and subtracted revenue from it. Revenue grows from $12k, and the first month's revenue is the current $12k.

| Growth | Lowest cash balance | When it bottoms out | Revenue passes $38k |
|---|---|---|---|
| 5% | about $102k | month 24 | about month 24 |
| 8% | about $236k | month 15 | about month 16 |
| 12% | about $310k | month 11 | about month 11 |

- **8% (your case):** cash falls from $480k to about $236k, then recovers once revenue covers the $38k spend.
- **5%:** this is tight. The cushion shrinks to about $100k, and it would take almost two years to break even.
- **12%:** you break even in under a year and barely dip into the cash.
- **Growth stalls:** with no growth you run out in month 19. At 3% you run out in month 23. The 5% case only survives because compounding continues for about two years.

These figures assume constant growth and flat spend. Real growth usually slows and spend usually rises, so the 5% case is the one to watch.

<!-- you -->

