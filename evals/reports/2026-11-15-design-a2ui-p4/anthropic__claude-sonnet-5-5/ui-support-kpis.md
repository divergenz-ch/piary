I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:thinking -->

I'll skip reading the skill since I already know a2ui from the tool description, and go straight to building. Next I'm checking the weekday numbers: the opened total comes to 412 and the backlog moved by 14, with a quick doubt about last week's figures that I'll let go. The week-over-week changes are opened up about 8%, closed up 27, reply time down 0.7 hours, and CSAT up 3.

Next I'm noting the backlog is down by 14, which is good, and then I'll build the view.

<!-- pi:view a2ui #toolu_019F8GdBiGNY3EnJ1imCcSCP -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "kpis",
        "kpis2",
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
      "id": "kpis",
      "component": "Row",
      "children": [
        "opened",
        "closed",
        "backlog"
      ]
    },
    {
      "id": "kpis2",
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
      "title": "Watch: backlog",
      "text": "Replies and satisfaction improved, but we opened 14 more tickets than we closed, so the backlog grew from 43 to 57. Intake fell through the week (96 Mon to 68 Fri), so closing at the current pace should shrink it."
    }
  ]
}
```

<!-- pi:result #toolu_019F8GdBiGNY3EnJ1imCcSCP -->

```
ok
```

<!-- pi -->

I built a one-screen dashboard with the five KPIs, each compared with last week, plus a chart of tickets opened per day.

Replies are faster and CSAT is up, but the backlog grew from 43 to 57. You opened 14 more tickets than you closed. Intake fell from 96 on Monday to 68 on Friday, so the backlog should shrink if closures hold at this week's pace.

The numbers are fixed to this week. For a daily view you'd need to send me the new figures each morning.

<!-- you -->

