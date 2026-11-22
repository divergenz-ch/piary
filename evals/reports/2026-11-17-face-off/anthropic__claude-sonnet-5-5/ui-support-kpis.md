I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:thinking -->

I'm setting up a glanceable dashboard through the a2ui view, and I've confirmed the Mon–Fri opened total adds up to 412. The backlog went from 43 to 57, a rise of 14, which matches opened minus closed for the week. I'm now working out the week-over-week changes, including the CSAT and reply-time movement.

I'm moving on from checking the numbers to just building the dashboard now, since the a2ui view is already clear to me.

<!-- pi:view a2ui #toolu_01QPQPAsCMrwx83VjXciUTKB -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "title",
        "kpis",
        "daily",
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
        "opened",
        "closed",
        "reply",
        "csat",
        "backlog"
      ]
    },
    {
      "id": "opened",
      "component": "Stat",
      "label": "Opened",
      "value": 412,
      "delta": "+32 (+8%)",
      "note": "last week 380"
    },
    {
      "id": "closed",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": "+27 (+7%)",
      "good": "up",
      "note": "last week 371"
    },
    {
      "id": "reply",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": "-0.7 h",
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
      "id": "backlog",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": "+14",
      "good": "down",
      "note": "last week 43"
    },
    {
      "id": "daily",
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
      "text": "Speed and CSAT improved, but opened outpaced closed by 14, so backlog grew 43 → 57 (+33%)."
    }
  ]
}
```

<!-- pi:result #toolu_01QPQPAsCMrwx83VjXciUTKB -->

```
ok
```

<!-- pi -->

The dashboard is above. Replies are faster, CSAT is up and closures are up. The backlog is the one problem: you opened 14 more tickets than you closed, so it rose from 43 to 57.

Daily volume fell from Monday's 96 to Friday's 68. If that continues, the backlog should start to shrink.

Next week, send me the new numbers and I'll rebuild it. I can also add a daily closed count if you track it.

<!-- you -->

