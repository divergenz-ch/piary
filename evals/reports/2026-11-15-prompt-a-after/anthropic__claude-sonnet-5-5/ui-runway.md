We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm weighing whether the $38k monthly burn is gross expenses or net, since revenue is $12k. I'll assume the burn is gross expenses, so net burn would be $38k minus the revenue, and I'll note that assumption. A quick bash calculation should settle the numbers.

<!-- pi:tool bash #toolu_01Xo9DYp83CSeH72J3NJgjKP -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g/100\n    if c<=0:break\n  print(g,m,round(c,1),round(r,1))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Xo9DYp83CSeH72J3NJgjKP -->

```
5 120 79418.9 4186.9
8 120 1533718.9 123035.9
12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I'm checking whether cash ever runs out: at 5% growth, revenue climbs to the 38k level around month 24, and cumulative cash seems to stay positive. If the burn is net rather than gross, though, the runway shrinks to roughly 12-13 months without any growth effect.

I'm still weighing both cases and need to work out the minimum cash balance and the breakeven month for each.

<!-- pi:tool bash #toolu_01KXL2NQ6ZayKEN7QRF3xBmH -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;be=None\n  for m in range(1,121):\n    c+=r-38\n    if be is None and r>=38:be=m\n    lo=min(lo,c);r*=1+g/100\n  print('gross',g,'breakeven mo',be,'min cash',round(lo))\nfor g in (0,5,8,12):\n  c=480;r=12\n  for m in range(1,121):\n    c+=r-38+12*0  # placeholder\n    break\nfor g in (5,8,12):\n  c=480;r=12;b=38\n  for m in range(1,121):\n    c+=r-b;r*=1+g/100\n    if c<=0:print('net',g,m);break\n  else:print('net',g,'never')\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01KXL2NQ6ZayKEN7QRF3xBmH -->

```
gross 5 breakeven mo 25 min cash 102
gross 8 breakeven mo 16 min cash 236
gross 12 breakeven mo 12 min cash 310
net 5 never
net 8 never
net 12 never
```

<!-- pi:thinking -->

I had the net burn case coded the same as gross, which is wrong. If net burn starts at 38, the 480 runs out in about 12.6 months with no change. Revenue growth would shrink the net burn over time, so I'm working out how that decline plays out month by month.

<!-- pi:tool bash #toolu_018azRU8WVbNLpyWXEDMk3Q5 -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12\n  for m in range(1,121):\n    c-=38-(r-12);r*=1+g/100\n    if c<=0:print(g,m);break\n  else:print(g,'never')\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_018azRU8WVbNLpyWXEDMk3Q5 -->

```
5 15
8 never
12 never
```

<!-- pi:thinking -->

I'm checking whether the 8% net variant ever overtakes, and it looks like the growing revenue increments eventually exceed it. I'll only bring up the 5% variant in my answer.

<!-- pi -->

**Short answer: on the numbers as given, you don't run out of money at 5%, 8% or 12% growth.** I took "$38k burn" to mean monthly expenses, so net burn is $38k minus revenue. That makes net burn $26k in month 1.

| Growth | Revenue passes $38k in month | Lowest cash balance |
|---|---|---|
| 5% | 25 | about $102k |
| 8% | 16 | about $236k |
| 12% | 12 | about $310k |

- **Why cash recovers:** revenue climbs past expenses, so you go cash-flow positive and the balance rises again.
- **What growth changes:** it doesn't change whether you survive. It changes how close you get. At 5% you dip to about $102k, which is thin if growth slips.
- **If $38k is already net burn:** that is, revenue is already netted out and only the growth adds to it. Flat burn would last about 12.6 months. At 5% growth cash runs out in month 15. At 8% and 12% it still never runs out.

The 8% and 12% paths assume growth holds for years, which is optimistic. If growth stalls early, the runway shortens a lot. Tell me which way you meant "burn" and I'll rerun it.

<!-- you -->

