I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:view a2ui #toolu_017irWB47Ma9GUjfnioW198k -->

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
      "text": "## Support desk – week of 9 Nov"
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
      "delta": "+32 vs 380",
      "good": "down"
    },
    {
      "id": "closed",
      "component": "Stat",
      "label": "Closed",
      "value": 398,
      "delta": "+27 vs 371",
      "good": "up"
    },
    {
      "id": "backlog",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": "+14 vs 43",
      "good": "down",
      "note": "+33%"
    },
    {
      "id": "reply",
      "component": "Stat",
      "label": "Median first reply",
      "value": 2.4,
      "unit": "h",
      "delta": "-0.7 h vs 3.1",
      "good": "down"
    },
    {
      "id": "csat",
      "component": "Stat",
      "label": "CSAT",
      "value": 91,
      "unit": "%",
      "delta": "+3 pts",
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
      "title": "Watch: backlog",
      "text": "Replies and CSAT improved, but opened (412) outpaced closed (398), so backlog grew 14 to 57. Volume eased through the week."
    }
  ]
}
```

<!-- pi:result #toolu_017irWB47Ma9GUjfnioW198k -->

```
ok
```

<!-- pi -->

I've built a one-screen dashboard of your five KPIs, each compared with last week, plus a bar chart of tickets opened Monday to Friday.

Replies and CSAT improved, but backlog is the one to watch. It rose from 43 to 57 because 412 tickets opened and only 398 closed. The dashboard flags this in a callout.

The figures are typed in by hand, so it won't update itself. For a daily view, give me a CSV or sheet of the daily numbers and I'll build it to read from that file.

<!-- you -->

