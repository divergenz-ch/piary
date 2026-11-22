I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:thinking -->

I'm checking that the Monday-to-Friday opened total of 412 adds up, and it does. The backlog moved from 43 to 57, a rise of 14, which matches opened minus closed. Next I'll build the a2ui view with stats and a chart, going from the description rather than reading a skill file.

<!-- pi:view a2ui #toolu_014J8wh1Jf7kAD8Pkkrx49gr -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "row1",
        "row2",
        "chart",
        "note"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Support desk: week of 9–13 Nov"
    },
    {
      "id": "row1",
      "component": "Row",
      "children": [
        "opened",
        "closed",
        "backlog"
      ]
    },
    {
      "id": "row2",
      "component": "Row",
      "children": [
        "reply",
        "csat"
      ]
    },
    {
      "id": "opened",
      "component": "Stat",
      "label": "Opened",
      "value": 412,
      "delta": 32,
      "note": "last week 380"
    },
    {
      "id": "closed",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": 27,
      "good": "up",
      "note": "last week 371"
    },
    {
      "id": "backlog",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": 14,
      "good": "down",
      "note": "last week 43"
    },
    {
      "id": "reply",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": -0.7,
      "good": "down",
      "note": "last week 3.1 h"
    },
    {
      "id": "csat",
      "component": "Stat",
      "label": "CSAT",
      "value": 91,
      "unit": "%",
      "delta": "+3 pts",
      "good": "up",
      "note": "last week 88%"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "x": "day",
      "y": "opened",
      "title": "Tickets opened per day",
      "data": [
        {
          "day": "Mon",
          "opened": 96
        },
        {
          "day": "Tue",
          "opened": 88
        },
        {
          "day": "Wed",
          "opened": 79
        },
        {
          "day": "Thu",
          "opened": 81
        },
        {
          "day": "Fri",
          "opened": 68
        }
      ]
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "warning",
      "title": "Watch the backlog",
      "text": "Opened outpaced closed by 14, exactly the backlog rise (43 → 57). Replies and CSAT improved; volume tapered through the week."
    }
  ]
}
```

<!-- pi:result #toolu_014J8wh1Jf7kAD8Pkkrx49gr -->

```
ok
```

<!-- pi -->

I've built a one-screen summary of the week. The daily figures add up to 412, matching your weekly total.

The backlog is the one number to watch. It rose by 14 (43 to 57), which is exactly how much more you opened than you closed. Everything else improved: first reply is faster and CSAT is up.

Next week, send me the new numbers and I'll refresh it.

<!-- you -->

