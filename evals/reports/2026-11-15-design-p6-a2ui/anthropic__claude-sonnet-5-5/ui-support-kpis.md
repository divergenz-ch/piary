I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:view a2ui #toolu_014NwuDYtqvZqZPhUUQhCrgN -->

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
      "text": "## Support desk – week ending 15 Nov"
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
      "delta": "+32 vs 380",
      "good": "down"
    },
    {
      "id": "c",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": "+27 vs 371",
      "good": "up"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": "+14 vs 43",
      "good": "down"
    },
    {
      "id": "r",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": "-0.7 h vs 3.1",
      "good": "down"
    },
    {
      "id": "s",
      "component": "Stat",
      "label": "CSAT",
      "value": 91,
      "unit": "%",
      "delta": "+3 pts vs 88",
      "good": "up"
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
      "text": "Replies and CSAT improved, but opened outpaced closed by 14, so backlog grew 33%. Volume eased through the week."
    }
  ]
}
```

<!-- pi:result #toolu_014NwuDYtqvZqZPhUUQhCrgN -->

```
ok
```

<!-- pi -->

I built a one-screen summary of the week. It has five KPI tiles, each with its change from last week, and a chart of tickets opened Monday to Friday.

Backlog is the one to watch. It rose from 43 to 57 because 14 more tickets opened than closed. First reply time and CSAT both improved.

The Mon–Fri figures add up to 412, which matches your weekly total. That means the week had no weekend tickets.

This is a static snapshot, so you'd need to send me new numbers each week to update it. I can set it up to read from a CSV file if you'd rather update it that way.

<!-- you -->

