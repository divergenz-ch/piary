We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm weighing whether the $38k is gross expenses with revenue offsetting it, or a net burn figure, and I'm going with gross expenses so net burn is 38k minus revenue. Next I'll run a quick calculation for runway under three growth rates.

<!-- pi:tool bash #toolu_01EvV3N533CcQ39VKiNHVzX4 -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<200:\n    m+=1;c+=r-38;r*=1+g/100\n    if m<4 or c<=0:print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01EvV3N533CcQ39VKiNHVzX4 -->

```
5 1 454 12.6
5 2 428.6 13.2
5 3 403.8 13.9
8 1 454 13.0
8 2 429.0 14.0
8 3 405.0 15.1
12 1 454 13.4
12 2 429.4 15.1
12 3 406.5 16.9
```

<!-- pi:thinking -->

I'm checking whether cash stays positive over the 200 months: revenue should pass 38 around month 24, so I need the minimum cash balance and the month where it breaks even.

<!-- pi:tool bash #toolu_01Xvceq1nxJypMGwMcRW27ZB -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0;mn=c;be=None\n  while m<60:\n    m+=1;c+=r-38;r*=1+g/100\n    if r>=38 and be is None:be=m+1\n    if c<mn:mn=c;mm=m\n  print(g,'min',round(mn),mm,'breakeven month',be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Xvceq1nxJypMGwMcRW27ZB -->

```
5 min 102 24 breakeven month 25
8 min 236 15 breakeven month 16
12 min 310 11 breakeven month 12
```

<!-- pi:view a2ui #toolu_01B39CpetVPKDwczAETWkrGN -->

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
      "note": "Revenue passes $38k in month 25"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "8% growth: lowest cash (month 15)",
      "value": 236,
      "unit": "$k",
      "note": "Breakeven in month 16"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "12% growth: lowest cash (month 11)",
      "value": 310,
      "unit": "$k",
      "note": "Breakeven in month 12"
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "info",
      "title": "Assumption",
      "text": "I read $38k as monthly expenses, with revenue offsetting it. If $38k is already net burn after revenue, flat burn gives about 12.6 months, so you run out around month 13, and growth would only help at the margin."
    }
  ]
}
```

<!-- pi:result #toolu_01B39CpetVPKDwczAETWkrGN -->

```
ok
```

<!-- pi -->

On my reading, you don't run out of money in any of the three cases. I treated the $38k as monthly expenses, with revenue offsetting it.

- **5% growth:** cash bottoms out at about $102k in month 24. Revenue passes $38k in month 25.
- **8% growth:** cash bottoms out at about $236k in month 15. Breakeven is in month 16.
- **12% growth:** cash bottoms out at about $310k in month 11. Breakeven is in month 12.

5% is the tight case. A small miss on growth or an expense increase would eat most of that $102k cushion.

If the $38k is already net burn after revenue, the answer changes. You'd run out around month 13, and growth would only help at the margin. Tell me which reading is right if it's the second one.

<!-- you -->

