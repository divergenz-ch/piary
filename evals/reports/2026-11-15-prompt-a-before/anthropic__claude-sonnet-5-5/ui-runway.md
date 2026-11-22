We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the net burn: the $38k a month might be gross or net, so I'm assuming it's expenses and subtracting revenue. I'll run the calculation in bash.

<!-- pi:tool bash #toolu_019znBdxpWaUwC9nNvA8rGEa -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g/100\n    if c<=0:break\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_019znBdxpWaUwC9nNvA8rGEa -->

```
5 120 79418.9 4186.9
8 120 1533718.9 123035.9
12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I'm checking whether cash ever runs out: revenue should eventually pass 38k, so I need to find the lowest cash point and the month when revenue crosses 38.

<!-- pi:tool bash #toolu_01Wi87nrX7swxWVyNfQKccTY -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;mm=0;cross=None\n  for m in range(1,61):\n    c+=r-38;r*=1+g/100\n    if c<lo:lo=c;mm=m\n    if cross is None and r>=38:cross=m\n  print(g,round(lo),mm,cross)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Wi87nrX7swxWVyNfQKccTY -->

```
5 102 24 24
8 236 15 15
12 310 11 11
```

<!-- pi:view a2ui #toolu_01CGhW1k3R7y1N31EeCJTnN4 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k",
        "t",
        "c"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## You don't run out in any of the three cases"
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "a",
        "b",
        "d"
      ]
    },
    {
      "id": "a",
      "component": "Stat",
      "label": "5% growth: lowest cash (month 24)",
      "value": 102,
      "unit": "$k"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "8% growth: lowest cash (month 15)",
      "value": 236,
      "unit": "$k"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "12% growth: lowest cash (month 11)",
      "value": 310,
      "unit": "$k"
    },
    {
      "id": "t",
      "component": "Text",
      "text": "Revenue reaches the $38k monthly spend in month 24 at 5%, month 15 at 8% and month 11 at 12%. After that the business is cash-flow positive."
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Assumption",
      "text": "I treated $38k as total monthly spend, so net burn is $38k minus revenue. If $38k is already net of revenue, runway is just 480/38 ≈ 12.6 months, with no growth effect."
    }
  ]
}
```

<!-- pi:result #toolu_01CGhW1k3R7y1N31EeCJTnN4 -->

```
ok
```

<!-- pi -->

You don't run out of money in any of the three cases. That holds only if the $38k a month is your total spend, with revenue coming in on top of it. The figures are in the view above.

Cash falls until revenue catches up with spend, then it recovers. The 5% case is the tightest, with about $102k left at its lowest point in month 24.

If the $38k is already net of revenue, the answer is different. Cash would run out in about 12.6 months, and growth would make no difference.

<!-- you -->

