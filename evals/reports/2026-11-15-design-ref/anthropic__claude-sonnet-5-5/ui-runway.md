We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm treating the $38k monthly burn as gross expenses, since if it were net, revenue changes wouldn't affect the analysis. Next I'll run the numbers with bash for 5%, 8%, and 12% growth, assuming month one revenue is $12k and growing from there.

<!-- pi:tool bash #toolu_01CLCqQPMfosJswTr6U9GKoo -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    c+=r-38;r*=1+g/100;m+=1\n    if m<=60 and c<=0:break\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CLCqQPMfosJswTr6U9GKoo -->

```
5 120 79418.9 4186.9
8 120 1533718.9 123035.9
12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I'm checking whether the cash can last: at 5% growth, revenue reaches 38k around month 24, so I'll find the minimum cash and the breakeven month, plus the month when cash is lowest.

<!-- pi:tool bash #toolu_0129Kj5hbRLWWDaiNLjhfVfa -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;lm=0\n  for m in range(1,121):\n    c+=r-38\n    if c<lo:lo,lm=c,m\n    r*=1+g/100\n    if r>=38 and 'b' not in globals().get('x',''):pass\n  be=next(m for m in range(0,100) if 12*(1+g/100)**m>=38)\n  print(g,round(lo),lm,be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_0129Kj5hbRLWWDaiNLjhfVfa -->

```
5 102 24 24
8 236 15 15
12 310 11 11
```

<!-- pi:view a2ui #toolu_015q4JE1qZyobqTxGQjZdQBG -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "k",
        "c"
      ]
    },
    {
      "id": "t",
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
      "unit": "$k",
      "note": "Revenue passes $38k in month 24"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "8% growth: lowest cash (month 15)",
      "value": 236,
      "unit": "$k",
      "note": "Break-even in month 15"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "12% growth: lowest cash (month 11)",
      "value": 310,
      "unit": "$k",
      "note": "Break-even in month 11"
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Assumptions",
      "text": "$38k is gross monthly spend, with month 1 revenue at $12k and costs flat. If $38k is already net of revenue, you run out in about 12.6 months (480/38) whatever the growth."
    }
  ]
}
```

<!-- pi:result #toolu_015q4JE1qZyobqTxGQjZdQBG -->

```
ok
```

<!-- pi -->

You don't run out of money in any of the three cases, as long as $38k is your gross monthly spend. In that case you lose $26k in month 1, and the loss shrinks as revenue grows.

- **5% growth:** Cash bottoms out at about $102k in month 24, when revenue passes $38k.
- **8% growth:** Cash bottoms out at about $236k in month 15.
- **12% growth:** Cash bottoms out at about $310k in month 11.

If $38k is already net of revenue, growth doesn't matter and you run out in about 12.6 months.

The 5% case leaves the thinnest buffer, so a slowdown or a cost increase would hit it first.

<!-- you -->

