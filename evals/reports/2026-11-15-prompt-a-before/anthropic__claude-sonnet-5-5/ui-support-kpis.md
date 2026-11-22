I run the support desk. This week: tickets opened 412 (last week 380), closed 398 (371), median first reply 2.4 h (3.1 h), CSAT 91% (88%), backlog 57 (43). Mon–Fri opened: 96, 88, 79, 81, 68. Give me something I can glance at every morning.

<!-- pi:view a2ui #toolu_0112nxyo6VuD2TcntRDRAPje -->

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
      "text": "## Support desk: this week vs last"
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
      "id": "backlog",
      "component": "Stat",
      "label": "Backlog",
      "value": 57,
      "delta": "+14 (+33%)",
      "good": "down",
      "note": "last week 43"
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
      "text": "Backlog grew 33% even though replies got faster and CSAT rose. Opened (412) outpaced closed (398) by 14. Intake fell through the week, so it should ease."
    }
  ]
}
```

<!-- pi:result #toolu_0112nxyo6VuD2TcntRDRAPje -->

```
ok
```

<!-- pi -->

I've put a one-screen dashboard above. Everything improved except backlog, which went from 43 to 57 because 14 more tickets opened than closed. Daily intake fell through the week, from 96 on Monday to 68 on Friday.

It shows static numbers for now. If you send me each day's figures, I can make it refresh every morning.

<!-- you -->

