We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm reading "burn $38k a month" as either gross expenses or net burn, and the $12k revenue figure makes the gross reading look more likely. I'll go with 38k as gross expenses with revenue offsetting it, and note that assumption. Then I'll run the numbers in bash.

<!-- pi:tool bash #toolu_0171YiQs8Y8cYSae2nhd2KkB -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g\n    if c<=0:break\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_0171YiQs8Y8cYSae2nhd2KkB -->

```
0.05 120 79418.9 4186.9
0.08 120 1533718.9 123035.9
0.12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

Cash might not run out after all, since revenue should climb past 38k around month 14 at 8% growth. I still need the minimum cash balance and the month it occurs, so I'll work through the numbers properly.

<!-- pi:tool bash #toolu_01U6VyqU3ZEdz6srNcy6EdR8 -->

```json
{
  "command": "python3 -c \"\nfor g in (.05,.08,.12):\n  c=480;r=12;lo=c;lm=0;be=None\n  for m in range(1,121):\n    c+=r-38\n    if r>=38 and be is None:be=m\n    r*=1+g\n    if c<lo:lo=c;lm=m\n  print(g,round(lo),lm,be)\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01U6VyqU3ZEdz6srNcy6EdR8 -->

```
0.05 102 24 25
0.08 236 15 16
0.12 310 11 12
```

<!-- pi:thinking -->

I'm checking the timeline first: month 1 is December 2026, so month 24 lands in November 2028. Revenue crosses 38k at month 25, which I'm working out from the growth formula. Cash stays above zero at the low-case 5% point, around $102k. The one caveat is that if 38k is net burn rather than revenue, the money runs out in about 12.6 months.

<!-- pi:view a2ui #toolu_01UvAkAq8CyHt97W7ZNy958F -->

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
      "caption": "Month 1 = Dec 2026. Assumes $38k is total monthly expenses, revenue offsets it.",
      "columns": [
        {
          "key": "g",
          "label": "MoM growth"
        },
        {
          "key": "lo",
          "label": "Lowest cash",
          "unit": "$k",
          "align": "end"
        },
        {
          "key": "m",
          "label": "Lowest at month",
          "align": "end"
        },
        {
          "key": "b",
          "label": "Revenue ≥ $38k (break-even) at month",
          "align": "end"
        }
      ],
      "rows": [
        {
          "g": "5%",
          "lo": 102,
          "m": 24,
          "b": 25
        },
        {
          "g": "8%",
          "lo": 236,
          "m": 15,
          "b": 16
        },
        {
          "g": "12%",
          "lo": 310,
          "m": 11,
          "b": 12
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "If $38k is already net of revenue",
      "text": "Then cash is gone in about 12.6 months (≈ Dec 2027) with no growth help. Tell me which it is and I'll rerun."
    }
  ]
}
```

<!-- pi:result #toolu_01UvAkAq8CyHt97W7ZNy958F -->

```
ok
```

<!-- pi -->

Treating $38k as total monthly spend, with $12k of revenue offsetting it, you don't run out of money at 5%, 8% or 12% growth. Cash dips and then recovers once revenue passes $38k.

- **5% growth:** cash bottoms out near $102k at month 24 and breaks even at month 25. This is the tightest case.
- **8% growth:** the low point is about $236k at month 15, and break-even comes at month 16.
- **12% growth:** the low point is about $310k at month 11, and break-even comes at month 12.

If the $38k is already net of revenue, you'd run out in about 12.6 months (around December 2027), because growth wouldn't be offsetting it.

<!-- you -->

