Our onboarding survey, 212 answers, 1 = strongly disagree to 5 = strongly agree. "Setup was easy": 1:9, 2:21, 3:38, 4:88, 5:56. "Docs answered my questions": 1:31, 2:52, 3:61, 4:47, 5:21. "I would recommend us": 1:6, 2:14, 3:40, 4:79, 5:73. Summarise this for my team meeting.

<!-- pi:tool bash #toolu_019WA7ivkvWB4qu3PCZJAhBy -->

```json
{
  "command": "python3 -c \"\nd={'easy':[9,21,38,88,56],'docs':[31,52,61,47,21],'rec':[6,14,40,79,73]}\nfor k,v in d.items():\n  n=sum(v);print(k,n,round(100*(v[3]+v[4])/n,1),round(100*(v[0]+v[1])/n,1),round(sum((i+1)*x for i,x in enumerate(v))/n,2))\"",
  "timeout": 10
}
```

<!-- pi:result #toolu_019WA7ivkvWB4qu3PCZJAhBy -->

```
easy 212 67.9 14.2 3.76
docs 212 32.1 39.2 2.88
rec 212 71.7 9.4 3.94
```

<!-- pi:view a2ui #toolu_01E4yRLpWidp85veotKvEQ1v -->

```json
{
  "components": [
    {
      "id": "root",
      "component": "Column",
      "children": [
        "t",
        "k",
        "c",
        "w"
      ]
    },
    {
      "id": "t",
      "component": "Text",
      "text": "## Onboarding survey (n=212): docs are the weak spot"
    },
    {
      "id": "k",
      "component": "Row",
      "children": [
        "a",
        "b",
        "d"
      ]
    },
    {
      "id": "a",
      "component": "Stat",
      "label": "Setup was easy: agree",
      "value": 67.9,
      "unit": "%",
      "note": "mean 3.76 · 14.2% disagree"
    },
    {
      "id": "b",
      "component": "Stat",
      "label": "Docs answered questions: agree",
      "value": 32.1,
      "unit": "%",
      "note": "mean 2.88 · 39.2% disagree"
    },
    {
      "id": "d",
      "component": "Stat",
      "label": "Would recommend: agree",
      "value": 71.7,
      "unit": "%",
      "note": "mean 3.94 · 9.4% disagree"
    },
    {
      "id": "c",
      "component": "Chart",
      "mark": "barH",
      "layout": "stack",
      "scheme": "diverging",
      "x": "q",
      "y": [
        "Strongly disagree",
        "Disagree",
        "Neutral",
        "Agree",
        "Strongly agree"
      ],
      "unit": "%",
      "title": "Share of answers by rating",
      "data": [
        {
          "q": "Setup was easy",
          "Strongly disagree": 4.2,
          "Disagree": 9.9,
          "Neutral": 17.9,
          "Agree": 41.5,
          "Strongly agree": 26.4
        },
        {
          "q": "Docs answered my questions",
          "Strongly disagree": 14.6,
          "Disagree": 24.5,
          "Neutral": 28.8,
          "Agree": 22.2,
          "Strongly agree": 9.9
        },
        {
          "q": "I would recommend us",
          "Strongly disagree": 2.8,
          "Disagree": 6.6,
          "Neutral": 18.9,
          "Agree": 37.3,
          "Strongly agree": 34.4
        }
      ]
    },
    {
      "id": "w",
      "component": "Callout",
      "tone": "warning",
      "title": "Takeaway",
      "text": "Setup and recommendation are solid (about 70% agree). Docs are the outlier: more people disagree (39%) than agree (32%). Suggest making docs the next focus. Survey doesn't say which topics fail, so a follow-up question is worth adding."
    }
  ]
}
```

<!-- pi:result #toolu_01E4yRLpWidp85veotKvEQ1v -->

```
ok
```

<!-- pi -->

I've put a summary of the survey in a chart for your meeting. The docs are the weak spot.

- **Setup was easy:** 67.9% agree and 14.2% disagree.
- **I would recommend us:** 71.7% agree and 9.4% disagree.
- **Docs answered my questions:** only 32.1% agree and 39.2% disagree. This is the only question where disagreement beats agreement.

I suggest making the docs the next focus. The survey doesn't say which topics fail, so a follow-up question on that would help.

<!-- you -->

