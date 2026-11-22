Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:thinking -->

I'm checking that the totals for each of the three survey questions add up to 212 respondents. For Setup, 67.9% agree, 14.2% disagree, and 17.9% are neutral, with a mean of about 3.76. The Docs question has 32.1% agreeing so far.

I'm finishing the Docs and Recommend breakdowns, with Docs disagreement at about 39.2% and a mean near 2.88, and Recommend agreement at about 71.7% with a mean near 3.94. Last, I'm planning to use a chart and a callout in the view.

<!-- pi:view a2ui #toolu_01HhMRKYSYAJT4DC4dft4Ur9 -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "t",
        "c",
        "k"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey (n = 212)"
    },
    {
      "id": "t",
      "component": "Table",
      "caption": "% of 212 answers; agree = 4–5, disagree = 1–2",
      "columns": [
        {
          "key": "q",
          "label": "Statement"
        },
        {
          "key": "agree",
          "label": "Agree",
          "unit": "%",
          "align": "right"
        },
        {
          "key": "neutral",
          "label": "Neutral",
          "unit": "%",
          "align": "right"
        },
        {
          "key": "disagree",
          "label": "Disagree",
          "unit": "%",
          "align": "right"
        },
        {
          "key": "mean",
          "label": "Mean (of 5)",
          "align": "right"
        }
      ],
      "rows": [
        {
          "q": "I would recommend us",
          "agree": 71.7,
          "neutral": 18.9,
          "disagree": 9.4,
          "mean": 3.94
        },
        {
          "q": "Setup was easy",
          "agree": 67.9,
          "neutral": 17.9,
          "disagree": 14.2,
          "mean": 3.76
        },
        {
          "q": "Docs answered my questions",
          "agree": 32.1,
          "neutral": 28.8,
          "disagree": 39.2,
          "mean": 2.88
        }
      ]
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "x": "q",
      "y": "pct",
      "series": "group",
      "unit": "%",
      "data": [
        {
          "q": "Recommend",
          "group": "Disagree",
          "pct": 9.4
        },
        {
          "q": "Recommend",
          "group": "Neutral",
          "pct": 18.9
        },
        {
          "q": "Recommend",
          "group": "Agree",
          "pct": 71.7
        },
        {
          "q": "Setup easy",
          "group": "Disagree",
          "pct": 14.2
        },
        {
          "q": "Setup easy",
          "group": "Neutral",
          "pct": 17.9
        },
        {
          "q": "Setup easy",
          "group": "Agree",
          "pct": 67.9
        },
        {
          "q": "Docs",
          "group": "Disagree",
          "pct": 39.2
        },
        {
          "q": "Docs",
          "group": "Neutral",
          "pct": 28.8
        },
        {
          "q": "Docs",
          "group": "Agree",
          "pct": 32.1
        }
      ]
    },
    {
      "id": "k",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong (about 7 in 10 agree). Docs are the weak spot: 83 people (39%) say they didn't answer their questions, more than the 68 (32%) who say they did. Docs are the clear priority."
    }
  ]
}
```

<!-- pi:result #toolu_01HhMRKYSYAJT4DC4dft4Ur9 error -->

```
The a2ui surface would not render, so the user would see this error instead:
- VALIDATION_FAILED at /components/2: Validation failed for component 'Table' (t): columns.1: Expected string, received object; columns.1.align: Invalid enum value. Expected start | end, received 'right', columns.2: Expected string, received object; columns.2.align: Invalid enum value. Expected start | end, received 'right', columns.3: Expected string, received object; columns.3.align: Invalid enum value. Expected start | end, received 'right', columns.4: Expected string, received object; columns.4.align: Invalid enum value. Expected start | end, received 'right'
Fix the payload and call view again.
```

<!-- pi:view a2ui #toolu_019nCy4bxa82PhJj1JSFNP8c -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "h",
        "t",
        "c",
        "k"
      ]
    },
    {
      "id": "h",
      "component": "Text",
      "text": "## Onboarding survey (n = 212)"
    },
    {
      "id": "t",
      "component": "Table",
      "caption": "% of 212 answers; agree = 4–5, disagree = 1–2",
      "columns": [
        {
          "key": "q",
          "label": "Statement"
        },
        {
          "key": "agree",
          "label": "Agree %",
          "align": "end"
        },
        {
          "key": "neutral",
          "label": "Neutral %",
          "align": "end"
        },
        {
          "key": "disagree",
          "label": "Disagree %",
          "align": "end"
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
          "agree": 71.7,
          "neutral": 18.9,
          "disagree": 9.4,
          "mean": 3.94
        },
        {
          "q": "Setup was easy",
          "agree": 67.9,
          "neutral": 17.9,
          "disagree": 14.2,
          "mean": 3.76
        },
        {
          "q": "Docs answered my questions",
          "agree": 32.1,
          "neutral": 28.8,
          "disagree": 39.2,
          "mean": 2.88
        }
      ]
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "x": "q",
      "y": "pct",
      "series": "group",
      "unit": "%",
      "data": [
        {
          "q": "Recommend",
          "group": "Disagree",
          "pct": 9.4
        },
        {
          "q": "Recommend",
          "group": "Neutral",
          "pct": 18.9
        },
        {
          "q": "Recommend",
          "group": "Agree",
          "pct": 71.7
        },
        {
          "q": "Setup easy",
          "group": "Disagree",
          "pct": 14.2
        },
        {
          "q": "Setup easy",
          "group": "Neutral",
          "pct": 17.9
        },
        {
          "q": "Setup easy",
          "group": "Agree",
          "pct": 67.9
        },
        {
          "q": "Docs",
          "group": "Disagree",
          "pct": 39.2
        },
        {
          "q": "Docs",
          "group": "Neutral",
          "pct": 28.8
        },
        {
          "q": "Docs",
          "group": "Agree",
          "pct": 32.1
        }
      ]
    },
    {
      "id": "k",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are strong (about 7 in 10 agree). Docs are the weak spot: 83 people (39%) say they didn't answer their questions, more than the 68 (32%) who say they did. Docs are the clear priority."
    }
  ]
}
```

<!-- pi:result #toolu_019nCy4bxa82PhJj1JSFNP8c -->

```
ok
```

<!-- pi -->

I've put a summary table, a stacked bar chart and a takeaway in the document. Every question has 212 answers, so the counts add up.

- **Recommend:** 71.7% agree and 9.4% disagree, with a mean of 3.94 out of 5. This is the strongest result.
- **Setup was easy:** 67.9% agree and 14.2% disagree, with a mean of 3.76.
- **Docs answered my questions:** only 32.1% agree, while 39.2% disagree. The mean is 2.88, the only one below 3.

Docs are the one area where more people were unhappy than happy, so they're the priority for the team.

<!-- you -->

