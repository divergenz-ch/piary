I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:view a2ui #toolu_0111ndoyQhJQPiVKJoegZgVS -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "kpis",
        "chart",
        "note"
      ]
    },
    {
      "id": "title",
      "component": "Text",
      "text": "## Support desk: this week vs last"
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "s1",
        "s2",
        "s3",
        "s4",
        "s5"
      ]
    },
    {
      "id": "s1",
      "component": "Stat",
      "label": "Opened",
      "value": 412,
      "delta": 32,
      "note": "last week 380"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": 27,
      "good": "up",
      "note": "last week 371"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": -0.7,
      "good": "down",
      "note": "last week 3.1 h"
    },
    {
      "id": "s4",
      "component": "Stat",
      "label": "CSAT",
      "value": 91,
      "unit": "%",
      "delta": "+3 pts",
      "good": "up",
      "note": "last week 88%"
    },
    {
      "id": "s5",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": 14,
      "good": "down",
      "note": "last week 43"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "bar",
      "x": "day",
      "y": "opened",
      "title": "Tickets opened, Mon–Fri",
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
      "text": "Backlog grew 14 (+33%) because opened (+32) outpaced closed (+27), even though replies are faster and CSAT is up."
    }
  ]
}
```

<!-- pi:result #toolu_0111ndoyQhJQPiVKJoegZgVS -->

```
ok
```

<!-- pi -->

I've built a one-screen summary of this week against last week. It has five headline tiles and a bar chart of tickets opened Monday to Friday.

Replies are faster (2.4 h, down from 3.1 h) and CSAT is up 3 points. The backlog is the one thing to watch: it rose from 43 to 57. Tickets opened (up 32) grew faster than tickets closed (up 27).

Opened tickets also fell steadily through the week, from 96 on Monday to 68 on Friday.

The numbers are the ones you gave me, typed in by hand, so the screen won't update by itself. Send me the new figures each morning and I'll refresh it.

<!-- you -->

