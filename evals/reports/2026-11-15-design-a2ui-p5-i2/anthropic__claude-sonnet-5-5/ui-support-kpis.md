I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:thinking -->

I'm weighing whether to read the skill file first, but I'll just compose the a2ui output directly. Checking the numbers: the Monday–Friday opened total comes to 412, and the backlog moved from 43 to 57, a rise of 14 that matches opened minus closed. Looking at the deltas now: opened is up 32 (about 8.4%), closed is up 27, reply time dropped 0.7 hours, CSAT rose 3 points, and the backlog grew by 14.

<!-- pi:view a2ui #toolu_01G7UYY4wVYAA2LTEbCRc3eW -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k1",
        "k2",
        "chart",
        "note"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Support desk: week to Fri 13 Nov"
    },
    {
      "id": "k1",
      "component": "Row",
      "children": [
        "o",
        "c",
        "b"
      ]
    },
    {
      "id": "k2",
      "component": "Row",
      "children": [
        "r",
        "s"
      ]
    },
    {
      "id": "o",
      "component": "Stat",
      "label": "Opened",
      "value": 412,
      "delta": 32,
      "note": "last week 380"
    },
    {
      "id": "c",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": 27,
      "good": "up",
      "note": "last week 371"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": 14,
      "good": "down",
      "note": "last week 43"
    },
    {
      "id": "r",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": -0.7,
      "good": "down",
      "note": "last week 3.1 h"
    },
    {
      "id": "s",
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
      "text": "Replies and CSAT improved, but opened outpaced closed by 14, so backlog grew 33%. Intake eased through the week."
    }
  ]
}
```

<!-- pi:result #toolu_01G7UYY4wVYAA2LTEbCRc3eW -->

```
ok
```

<!-- pi -->

I built a one-glance dashboard of your five KPIs, with the change from last week on each tile. Below the tiles is a chart of tickets opened per day, Monday to Friday.

- **Good news:** first reply is faster (2.4 h, down from 3.1 h) and CSAT is up 3 points to 91%.
- **Watch the backlog:** it grew from 43 to 57. You opened 14 more tickets than you closed, which is a 33% rise.
- **Intake eased through the week:** it went from 96 on Monday to 68 on Friday. That should help the backlog if closures hold steady.

The daily figures add up to 412, matching your weekly total.

To reuse it each morning, send me the new numbers and I'll update it.

<!-- you -->

