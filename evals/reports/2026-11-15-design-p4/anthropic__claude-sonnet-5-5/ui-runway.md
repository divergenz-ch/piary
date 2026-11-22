We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the net monthly burn as gross expenses of $38k minus revenue that starts at $12k and grows each month. I'll set up the cash balance as the prior month's cash minus 38k plus that month's revenue, and compute it in code.

I'm going to run the cash projection through a quick bash calculation to check the numbers.

<!-- pi:tool bash #toolu_01FrF7ahrdx5wwmhP5JgJLNC -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n    c=480;r=12\n    for t in range(1,121):\n        r*=1+g;c+=r-38\n        if c<0:print(g,t,round(c,1));break\n    else:print(g,'never',round(c))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01FrF7ahrdx5wwmhP5JgJLNC -->

```
0.05 never 83594
0.08 never 1656743
0.12 never 90231997
```

<!-- pi:thinking -->

I'm checking how fast revenue climbs to 38k, then working out the lowest point cash drops to and which month the business breaks even.

<!-- pi:tool bash #toolu_01C3a4R4SamuPhGt9P5xSP5d -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n    c=480;r=12;m=c;mt=0;be=None\n    for t in range(1,121):\n        r*=1+g;c+=r-38\n        if c<m:m=c;mt=t\n        if be is None and r>=38:be=t\n    print(g,'min',round(m),'at',mt,'breakeven month',be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01C3a4R4SamuPhGt9P5xSP5d -->

```
0.05 min 128 at 23 breakeven month 24
0.08 min 262 at 14 breakeven month 15
0.12 min 336 at 10 breakeven month 11
```

<!-- pi:view a2ui #toolu_01FXTymXuxhySPDKTzFR5C1k -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
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
      "id": "t",
      "component": "Table",
      "columns": [
        {
          "key": "g",
          "label": "Growth / month"
        },
        {
          "key": "be",
          "label": "Revenue covers $38k (month)",
          "align": "end"
        },
        {
          "key": "low",
          "label": "Lowest cash ($k)",
          "align": "end"
        },
        {
          "key": "when",
          "label": "Low point (month)",
          "align": "end"
        }
      ],
      "rows": [
        {
          "g": "5%",
          "be": 24,
          "low": 128,
          "when": 23
        },
        {
          "g": "8%",
          "be": 15,
          "low": 262,
          "when": 14
        },
        {
          "g": "12%",
          "be": 11,
          "low": 336,
          "when": 10
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Assumptions",
      "text": "$38k is fixed monthly spending, with revenue growing from $12k starting next month. If 38k is already net of revenue, you'd run out in about 12.6 months with no growth benefit."
    }
  ]
}
```

<!-- pi:result #toolu_01FXTymXuxhySPDKTzFR5C1k -->

```
ok
```

<!-- pi -->

With $480k in the bank, you don't run out of money at 5%, 8% or 12% growth. Revenue overtakes the $38k monthly spend before the cash is gone, so the cash balance bottoms out and then rises.

The table shows the breakeven month and the lowest cash balance for each growth rate. Even the 5% case keeps about $128k at its lowest point.

This assumes the $38k is total monthly spending and revenue starts compounding next month. If the $38k is already net of revenue, the answer changes. Then you'd run out in about 12.6 months, and growth wouldn't help.

<!-- you -->

