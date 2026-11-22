We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the net burn: gross expenses are $38k, and monthly revenue starts at $12k and grows. Next I'll compute the cash balance over time, taking month one's revenue as the starting point, using a quick bash calculation.

<!-- pi:tool bash #toolu_017J3Z5kabSZXvmNtUGPQnsw -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    c+=r-38;r*=1+g;m+=1\n  print(g,m,round(c,1),round(r,1))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_017J3Z5kabSZXvmNtUGPQnsw -->

```
0.05 120 79418.9 4186.9
0.08 120 1533718.9 123035.9
0.12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I'm checking whether cash ever reaches zero, starting with when revenue climbs past 38k. At 5% monthly growth that happens around month 23.6, so I need to see whether the cumulative deficit stays survivable. Next I'll work out the minimum cash balance, the month it occurs, and when the business breaks even.

<!-- pi:tool bash #toolu_01NHKLDgJrcJvmdNmyZebsKu -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n  c=480;r=12;m=0;mn=(c,0);be=None\n  for m in range(1,100):\n    if be is None and r>=38: be=m\n    c+=r-38;r*=1+g\n    if c<mn[0]: mn=(c,m)\n  print(g,be,[round(mn[0]),mn[1]])\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01NHKLDgJrcJvmdNmyZebsKu -->

```
0.05 25 [102, 24]
0.08 16 [236, 15]
0.12 12 [310, 11]
```

<!-- pi:view a2ui #toolu_01Xmptbguy27amuC5G6BktmY -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k",
        "c",
        "n"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## You don't run out at 8%, but 5% is close"
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
      "note": "Revenue covers the $38k burn in month 25"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "8% growth: lowest cash (month 15)",
      "value": 236,
      "unit": "$k",
      "note": "Revenue covers the $38k burn in month 16"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "12% growth: lowest cash (month 11)",
      "value": 310,
      "unit": "$k",
      "note": "Revenue covers the $38k burn in month 12"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "line",
      "x": "month",
      "y": [
        "g5",
        "g8",
        "g12"
      ],
      "unit": "$k",
      "yLabel": "Cash",
      "xLabel": "Month",
      "labels": {
        "g5": "5%",
        "g8": "8%",
        "g12": "12%"
      },
      "data": {
        "@call": "series",
        "args": {
          "from": 0,
          "to": 36,
          "index": "month",
          "columns": {
            "g5": "round(480 + 12*((1.05^month-1)/0.05) - 38*month)",
            "g8": "round(480 + 12*((1.08^month-1)/0.08) - 38*month)",
            "g12": "round(480 + 12*((1.12^month-1)/0.12) - 38*month)"
          }
        }
      }
    },
    {
      "id": "n",
      "component": "Callout",
      "tone": "warning",
      "title": "Assumption",
      "text": "The $38k is total monthly spend, held flat, and month 1 revenue is $12k. If $38k is already net of revenue, you run out in about 12.6 months."
    }
  ]
}
```

<!-- pi:result #toolu_01Xmptbguy27amuC5G6BktmY -->

```
ok
```

<!-- pi -->

Cash never reaches zero in any of the three cases, as long as spend stays flat at $38k and growth holds. Revenue passes the $38k spend in month 16 at 8% growth, month 25 at 5% and month 12 at 12%.

- **8% growth:** Cash bottoms out at about $236k in month 15, then recovers.
- **5% growth:** This is the tight case. Cash falls to about $102k in month 24, so a small miss in growth or a small rise in costs could sink it.
- **12% growth:** Cash bottoms out at about $310k in month 11.

I read the $38k as total monthly spend, with revenue coming in on top of it. If the $38k is already net of revenue, the $480k lasts about 12.6 months.

<!-- you -->

