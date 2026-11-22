Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:view a2ui #toolu_0193wAAhVKs1ekHUf8y9vxJt -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "kpis",
        "chart",
        "tbl",
        "c"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey: 212 responses"
    },
    {
      "id": "kpis",
      "component": "Row",
      "children": [
        "s1",
        "s2",
        "s3"
      ]
    },
    {
      "id": "s1",
      "component": "Stat",
      "label": "Setup was easy (agree)",
      "value": 68,
      "unit": "%",
      "note": "mean 3.8"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Docs answered questions (agree)",
      "value": 32,
      "unit": "%",
      "note": "mean 2.9"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "Would recommend (agree)",
      "value": 72,
      "unit": "%",
      "note": "mean 4.0"
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "q",
      "y": [
        "d1",
        "d2",
        "d3",
        "d4",
        "d5"
      ],
      "labels": {
        "d1": "1 Strongly disagree",
        "d2": "2",
        "d3": "3 Neutral",
        "d4": "4",
        "d5": "5 Strongly agree"
      },
      "unit": "%",
      "data": [
        {
          "q": "Setup easy",
          "d1": 4.2,
          "d2": 9.9,
          "d3": 17.9,
          "d4": 41.5,
          "d5": 26.4
        },
        {
          "q": "Docs helpful",
          "d1": 14.6,
          "d2": 24.5,
          "d3": 28.8,
          "d4": 22.2,
          "d5": 9.9
        },
        {
          "q": "Recommend",
          "d1": 2.8,
          "d2": 6.6,
          "d3": 18.9,
          "d4": 37.3,
          "d5": 34.4
        }
      ]
    },
    {
      "id": "tbl",
      "component": "Table",
      "columns": [
        "q",
        "dis",
        "agr"
      ],
      "rows": [
        {
          "q": "Setup easy",
          "dis": "14%",
          "agr": "68%"
        },
        {
          "q": "Docs helpful",
          "dis": "39%",
          "agr": "32%"
        },
        {
          "q": "Recommend",
          "dis": "9%",
          "agr": "72%"
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong. Docs are the weak spot: 39% disagree, more than agree. Fixing docs is the clearest improvement."
    }
  ]
}
```

<!-- pi:result #toolu_0193wAAhVKs1ekHUf8y9vxJt -->

```
ok
```

<!-- pi -->

I summarised the survey in the block above. Docs are the weak spot.

- **Setup was easy:** 68% agree and 14% disagree.
- **Would recommend:** 72% agree and 9% disagree.
- **Docs answered my questions:** only 32% agree, and 39% disagree.

"Agree" means a 4 or 5, and "disagree" means a 1 or 2. Docs are the only one of the three where more people disagree than agree.

I didn't check whether the people who rated docs low also rated setup or recommendation low. That would show whether bad docs are costing you recommendations. Breaking the results down by segment, such as new versus experienced users, would help too.

<!-- you -->

