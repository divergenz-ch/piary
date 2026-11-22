We have $480k in the bank, burn $38k a month, and revenue is $12k a month growing 8% month over month. When do we run out of money, and what changes if growth is 5% or 12%?

<!-- pi:thinking -->

I'm working out the net burn: the $38k monthly spend, less the $12k in revenue that's growing, so I'll run the numbers in bash.

<!-- pi:tool bash #toolu_01Wq6pG3rfsnUGGJV83GiG9s -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;m=0\n  while c>0 and m<120:\n    m+=1;c+=r-38;r*=1+g/100\n    if m<=60 and 0:print(m,c)\n  print(g,m,round(c,1),round(r,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01Wq6pG3rfsnUGGJV83GiG9s -->

```
5 120 79418.9 4186.9
8 120 1533718.9 123035.9
12 120 80563845.5 9668163.1
```

<!-- pi:thinking -->

I need to check whether the cash balance ever drops to zero, so I'm looking at the minimum cash point and the month it occurs. I also want to find the month when revenue first reaches 38k.

<!-- pi:tool bash #toolu_01CDMdwTT8ns7Xwd2c6odhCc -->

```json
{
  "command": "python3 -c \"\nfor g in (5,8,12):\n  c=480;r=12;lo=c;lm=0\n  for m in range(1,121):\n    c+=r-38;r*=1+g/100\n    if c<lo:lo,lm=c,m\n  print(g,lm,round(lo,1))\n\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_01CDMdwTT8ns7Xwd2c6odhCc -->

```
5 24 102.0
8 15 235.8
12 11 309.9
```

<!-- pi:view a2ui #toolu_0123g8Tdzq7QnYUet5wyhb1u -->

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
      "text": "## You don't run out in any scenario (if $38k is expenses)"
    },
    {
      "id": "k",
      "component": "Table",
      "columns": [
        {
          "key": "g",
          "label": "Growth"
        },
        {
          "key": "m",
          "label": "Cash low point (month)"
        },
        {
          "key": "l",
          "label": "Lowest cash ($k)"
        }
      ],
      "rows": [
        {
          "g": "5%",
          "m": 24,
          "l": 102
        },
        {
          "g": "8%",
          "m": 15,
          "l": 236
        },
        {
          "g": "12%",
          "m": 11,
          "l": 310
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Assumption matters",
      "text": "If $38k is already net burn (after revenue), cash lasts 480/38 ≈ 12.6 months with no growth help, i.e. out around month 13 (Dec 2027)."
    }
  ]
}
```

<!-- pi:result #toolu_0123g8Tdzq7QnYUet5wyhb1u -->

```
ok
```

<!-- pi -->

I treated $38k as monthly expenses, so net burn is $38k minus revenue. Revenue compounds from $12k.

- **5% growth:** cash bottoms out around $102k in month 24, then recovers. Revenue passes $38k at about month 24.
- **8% growth:** cash bottoms out around $236k in month 15.
- **12% growth:** cash bottoms out around $310k in month 11.

On this reading you never run out of money, even at 5%. At 5% the cushion is thin, so a small miss on growth or costs could change that.

If $38k is already net burn, revenue is already counted. Then you run out in about 12.6 months, which is around December 2027.

<!-- you -->

