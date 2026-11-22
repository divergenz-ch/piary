Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:thinking -->

I'm checking that each set of response counts adds up to 212, and they all do. Then I'm working out the percentages for the setup, docs, and recommendation questions, along with a mean score for setup.

I'm running the mean and percentage figures for the docs and recommendation questions, which come to about 2.88 and 3.94. I'm also weighing whether to use a diverging stacked bar chart or keep it simple with a table and a callout.

<!-- pi:view a2ui #toolu_011pgrziQ4ZfSg5msS572xNe -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "tbl",
        "chart",
        "c"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Onboarding survey: 212 responses"
    },
    {
      "id": "tbl",
      "component": "Table",
      "columns": [
        {
          "key": "q",
          "label": "Statement"
        },
        {
          "key": "dis",
          "label": "Disagree (1–2)",
          "align": "end",
          "unit": "%"
        },
        {
          "key": "neu",
          "label": "Neutral (3)",
          "align": "end",
          "unit": "%"
        },
        {
          "key": "agr",
          "label": "Agree (4–5)",
          "align": "end",
          "unit": "%"
        },
        {
          "key": "mean",
          "label": "Mean (of 5)",
          "align": "end"
        }
      ],
      "rows": [
        {
          "q": "I would recommend us",
          "dis": 9.4,
          "neu": 18.9,
          "agr": 71.7,
          "mean": 3.94
        },
        {
          "q": "Setup was easy",
          "dis": 14.2,
          "neu": 17.9,
          "agr": 67.9,
          "mean": 3.76
        },
        {
          "q": "Docs answered my questions",
          "dis": 39.2,
          "neu": 28.8,
          "agr": 32.1,
          "mean": 2.88
        }
      ]
    },
    {
      "id": "chart",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "q",
      "y": [
        "dis",
        "neu",
        "agr"
      ],
      "labels": {
        "dis": "Disagree",
        "neu": "Neutral",
        "agr": "Agree"
      },
      "unit": "%",
      "data": [
        {
          "q": "Recommend",
          "dis": 9.4,
          "neu": 18.9,
          "agr": 71.7
        },
        {
          "q": "Setup easy",
          "dis": 14.2,
          "neu": 17.9,
          "agr": 67.9
        },
        {
          "q": "Docs helpful",
          "dis": 39.2,
          "neu": 28.8,
          "agr": 32.1
        }
      ]
    },
    {
      "id": "c",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong. Docs are the weak spot: more people disagree (39%) than agree (32%). Docs are the clear place to invest next."
    }
  ]
}
```

<!-- pi:result #toolu_011pgrziQ4ZfSg5msS572xNe -->

```
ok
```

<!-- pi -->

I've put a summary table and a stacked bar chart in the document. All three questions have 212 answers.

- **Recommend:** 72% agree and 9% disagree, with a mean of 3.94. This is the strongest result.
- **Setup was easy:** 68% agree and 14% disagree, with a mean of 3.76.
- **Docs answered my questions:** only 32% agree and 39% disagree, with a mean of 2.88. This is the only question where disagreement beats agreement.

Even with the weak docs score, most people would still recommend us. Docs look like the best place to improve next.

<!-- you -->

