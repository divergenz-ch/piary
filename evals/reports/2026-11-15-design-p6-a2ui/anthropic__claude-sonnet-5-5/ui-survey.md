Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:thinking -->

I'm checking that each question's response counts add up to 212, and they do. I'm also working out the agreement, disagreement, and mean figures for setup, docs, and recommendation.

I'm working out the mean scores for each area, which come to about 3.76 for setup, 2.88 for docs, and 3.94 for recommendation. Next I'm settling on a diverging stacked bar chart with percentages for each response level, and I'm laying the data out in long format with one row per series.

<!-- pi:view a2ui #toolu_01NSuzGoWmkT1JRUp1zseyVB -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "k",
        "c",
        "t",
        "note"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey: 212 responses"
    },
    {
      "id": "k",
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
      "note": "mean 3.76"
    },
    {
      "id": "s2",
      "component": "Stat",
      "label": "Docs answered questions (agree)",
      "value": 32,
      "unit": "%",
      "note": "mean 2.88"
    },
    {
      "id": "s3",
      "component": "Stat",
      "label": "Would recommend (agree)",
      "value": 72,
      "unit": "%",
      "note": "mean 3.94"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "question",
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
      "title": "Share of answers by rating",
      "data": [
        {
          "question": "Setup was easy",
          "d1": 4.2,
          "d2": 9.9,
          "d3": 17.9,
          "d4": 41.5,
          "d5": 26.4
        },
        {
          "question": "Docs answered my questions",
          "d1": 14.6,
          "d2": 24.5,
          "d3": 28.8,
          "d4": 22.2,
          "d5": 9.9
        },
        {
          "question": "I would recommend us",
          "d1": 2.8,
          "d2": 6.6,
          "d3": 18.9,
          "d4": 37.3,
          "d5": 34.4
        }
      ]
    },
    {
      "id": "t",
      "component": "Table",
      "columns": [
        {
          "key": "q",
          "label": "Question"
        },
        {
          "key": "dis",
          "label": "Disagree (1–2)",
          "align": "end"
        },
        {
          "key": "neu",
          "label": "Neutral",
          "align": "end"
        },
        {
          "key": "agr",
          "label": "Agree (4–5)",
          "align": "end"
        }
      ],
      "rows": [
        {
          "q": "Setup was easy",
          "dis": "30 (14%)",
          "neu": "38 (18%)",
          "agr": "144 (68%)"
        },
        {
          "q": "Docs answered my questions",
          "dis": "83 (39%)",
          "neu": "61 (29%)",
          "agr": "68 (32%)"
        },
        {
          "q": "I would recommend us",
          "dis": "20 (9%)",
          "neu": "40 (19%)",
          "agr": "152 (72%)"
        }
      ]
    },
    {
      "id": "note",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong. Docs are the weak spot: 39% disagree, and only 32% agree. Docs are the clearest improvement target."
    }
  ]
}
```

<!-- pi:result #toolu_01NSuzGoWmkT1JRUp1zseyVB -->

```
ok
```

<!-- pi -->

The summary is above. All three questions sum to 212 responses.

- **Recommend:** 72% agree, with a mean of 3.94. This is the strongest result.
- **Setup:** 68% agree, with a mean of 3.76.
- **Docs:** only 32% agree, 39% disagree, and the mean is 2.88. This is the one to discuss at the meeting.

The survey doesn't say why people rated the docs low. A follow-up question on which docs fell short would help.

<!-- you -->

